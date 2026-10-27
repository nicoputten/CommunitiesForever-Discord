// The Discord gateway (BOT-02): one client with the Guilds intent only (no privileged intents), its state changes
// reported as ConnectionEvents, the global slash command registration, and posting (BOT-03). Thin: what to do with
// them is src/app's.
import { Client, DiscordAPIError, Events, GatewayIntentBits, REST, Routes } from "discord.js";
import type { CommandDefinition } from "../core/commands.js";
import type { ConnectionEvent, FailReason } from "../core/connection.js";
import type { MessageContent, PostedMessage } from "../core/milestones.js";

export interface Discord {
  /** Logs in; resolves undefined once the gateway accepted the bot, or the reason it never will. */
  login(): Promise<FailReason | undefined>;
  /** Replaces the global slash commands with these; resolves the number registered. */
  registerCommands(commands: readonly CommandDefinition[]): Promise<number>;
  /** Posts a message; resolves its id. Throws a PostError. */
  post(channelId: string, content: MessageContent): Promise<string>;
  /** Replaces a posted message's content (BOT-09). Throws a PostError. */
  edit(channelId: string, messageId: string, content: MessageContent): Promise<void>;
  /** The bot's own messages among the channel's last 50. Throws a PostError. */
  recentPosts(channelId: string): Promise<PostedMessage[]>;
  destroy(): Promise<void>;
}

export interface DiscordConfig {
  discordToken: string;
  discordAppId: string;
}

/** A refused REST call, with Discord's error code (e.g. 50013 missing permissions, 10003 unknown channel). */
export class PostError extends Error {
  constructor(readonly code: number | string | undefined) {
    super(`Discord refused the request (${code ?? "no answer"})`);
  }
}

interface ApiMessage {
  id: string;
  author?: { id?: string };
  embeds?: { url?: string; description?: string }[];
}

export function connectDiscord(config: DiscordConfig, report: (event: ConnectionEvent) => void): Discord {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  const servers = () => client.guilds.cache.size;
  client.once(Events.ClientReady, () => report({ kind: "ready", servers: servers() }));
  client.on(Events.GuildCreate, () => report({ kind: "joined", servers: servers() }));
  client.on(Events.GuildDelete, () => report({ kind: "left", servers: servers() }));
  client.on(Events.ShardDisconnect, (event) => report({ kind: "disconnected", code: event.code }));
  client.on(Events.ShardReconnecting, () => report({ kind: "reconnecting" }));
  client.on(Events.ShardResume, () => report({ kind: "resumed" }));
  // discord.js retries by itself; without a listener an "error" event would end the process.
  client.on(Events.Error, () => undefined);

  const rest = new REST().setToken(config.discordToken);
  const refused = (error: unknown) => new PostError(error instanceof DiscordAPIError ? error.code : undefined);

  return {
    async login() {
      try {
        await client.login(config.discordToken);
        return undefined;
      } catch (error) {
        return failReason(error);
      }
    },
    async registerCommands(commands) {
      await rest.put(Routes.applicationCommands(config.discordAppId), { body: commands });
      return commands.length;
    },
    async post(channelId, content) {
      try {
        const message = (await rest.post(Routes.channelMessages(channelId), { body: content })) as ApiMessage;
        return message.id;
      } catch (error) {
        throw refused(error);
      }
    },
    async edit(channelId, messageId, content) {
      try {
        await rest.patch(Routes.channelMessage(channelId, messageId), { body: content });
      } catch (error) {
        throw refused(error);
      }
    },
    async recentPosts(channelId) {
      try {
        const own = client.user?.id ?? config.discordAppId;
        const messages = (await rest.get(Routes.channelMessages(channelId), {
          query: new URLSearchParams({ limit: "50" }),
        })) as ApiMessage[];
        return messages
          .filter((m) => m.author?.id === own)
          .map((m) => ({
            id: m.id,
            texts: (m.embeds ?? []).flatMap((e) => [e.url ?? "", e.description ?? ""]),
          }));
      } catch (error) {
        throw refused(error);
      }
    },
    async destroy() {
      client.removeAllListeners();
      await client.destroy();
    },
  };
}

function failReason(error: unknown): FailReason {
  const code = (error as { code?: unknown } | null)?.code;
  const message = error instanceof Error ? error.message : "";
  if (code === "TokenInvalid" || code === 4004 || /invalid token/i.test(message)) return "invalid token";
  if (code === 4014 || /disallowed intents/i.test(message)) return "disallowed intents";
  return "other";
}
