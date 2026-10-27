// The Discord gateway (BOT-02): one client with the Guilds intent only (no privileged intents), its state changes
// reported as ConnectionEvents, the global slash command registration, and posting (BOT-03). Thin: what to do with
// them is src/app's. It also tells what the server's channels and roles are, for the site's dropdowns (BOT-08).
import {
  ChannelType,
  Client,
  DiscordAPIError,
  Events,
  GatewayIntentBits,
  MessageFlags,
  PermissionFlagsBits,
  REST,
  Routes,
} from "discord.js";
import type { CommandDefinition } from "../core/commands.js";
import type { ConnectionEvent, FailReason } from "../core/connection.js";
import type { GuildSnapshot } from "../core/guild.js";
import type { MessageContent, PostedMessage } from "../core/milestones.js";

export interface Discord {
  /** Logs in; resolves undefined once the gateway accepted the bot, or the reason it never will. */
  login(): Promise<FailReason | undefined>;
  /** Replaces the global slash commands with these; resolves the number registered. */
  registerCommands(commands: readonly CommandDefinition[]): Promise<number>;
  /** Posts a message, with image files it references as `attachment://<name>` (BOT-05); resolves its id. Throws a PostError. */
  post(channelId: string, content: MessageContent, files?: readonly Attachment[]): Promise<string>;
  /** Replaces a posted message's content (BOT-09). Throws a PostError. */
  edit(channelId: string, messageId: string, content: MessageContent): Promise<void>;
  /** The bot's own messages among the channel's last 50. Throws a PostError. */
  recentPosts(channelId: string): Promise<PostedMessage[]>;
  /** The (first) server's channels and roles as Discord's cache knows them; undefined when not in a server. */
  guild(): GuildSnapshot | undefined;
  /**
   * Calls `listener` for each slash command (BOT-05). The answer is deferred at once, only for the asker (ephemeral);
   * `reply` fills it in. Returns the unsubscribe.
   */
  onCommand(listener: (command: SlashCommand) => void): () => void;
  /** Calls `listener` when the server's channels or roles change; returns the unsubscribe. */
  onGuildChange(listener: () => void): () => void;
  destroy(): Promise<void>;
}

/** A slash command a user ran: its name, and the answer to give only to them. */
export interface SlashCommand {
  name: string;
  reply(content: MessageContent, files?: readonly Attachment[]): Promise<void>;
}

/** A file to attach to a post (a card image from the site, BOT-05). */
export interface Attachment {
  name: string;
  data: Uint8Array;
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
  const guildListeners = new Set<() => void>();
  const guildChanged = () => guildListeners.forEach((listener) => listener());
  for (const event of [
    Events.GuildCreate,
    Events.GuildUpdate,
    Events.ChannelCreate,
    Events.ChannelDelete,
    Events.ChannelUpdate,
    Events.GuildRoleCreate,
    Events.GuildRoleDelete,
    Events.GuildRoleUpdate,
  ] as const) {
    client.on(event, guildChanged);
  }
  const commandListeners = new Set<(command: SlashCommand) => void>();
  client.on(Events.InteractionCreate, (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    // Within Discord's 3 seconds; the answer follows when the site has given it.
    const deferred = interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => undefined);
    const command: SlashCommand = {
      name: interaction.commandName,
      async reply(content, files = []) {
        await deferred;
        try {
          await interaction.editReply({
            embeds: content.embeds,
            allowedMentions: { parse: [] },
            files: files.map((f) => ({ name: f.name, attachment: Buffer.from(f.data) })),
          });
        } catch (error) {
          throw refused(error);
        }
      },
    };
    commandListeners.forEach((listener) => listener(command));
  });
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
    async post(channelId, content, files = []) {
      try {
        const message = (await rest.post(Routes.channelMessages(channelId), {
          body: content,
          ...(files.length > 0 ? { files: files.map((f) => ({ name: f.name, data: Buffer.from(f.data) })) } : {}),
        })) as ApiMessage;
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
    guild() {
      const guild = client.guilds.cache.first();
      if (guild === undefined) return undefined;
      const me = guild.members.me;
      const needed = [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
      ];
      return {
        channels: guild.channels.cache.map((channel) => ({
          id: channel.id,
          name: channel.name,
          kind:
            channel.type === ChannelType.GuildText
              ? "text"
              : channel.type === ChannelType.GuildAnnouncement
                ? "announcement"
                : "other",
          // Discord's order: channels without a category first, then by category, then within it.
          position:
            ((channel.parent?.rawPosition ?? -1) + 1) * 100_000 + ("rawPosition" in channel ? channel.rawPosition : 0),
          canPost: me ? (channel.permissionsFor(me)?.has(needed) ?? false) : false,
        })),
        roles: guild.roles.cache.map((role) => ({
          id: role.id,
          name: role.name,
          position: role.position,
          mentionable: role.mentionable,
          managed: role.managed,
          everyone: role.id === guild.id,
        })),
      };
    },
    onCommand(listener) {
      commandListeners.add(listener);
      return () => commandListeners.delete(listener);
    },
    onGuildChange(listener) {
      guildListeners.add(listener);
      return () => guildListeners.delete(listener);
    },
    async destroy() {
      guildListeners.clear();
      commandListeners.clear();
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
