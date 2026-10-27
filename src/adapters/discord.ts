// The Discord gateway (BOT-02): one client with the Guilds intent only (no privileged intents), its state changes
// reported as ConnectionEvents, and the global slash command registration. Thin: what to do with them is src/app's.
import { Client, Events, GatewayIntentBits, REST, Routes } from "discord.js";
import type { CommandDefinition } from "../core/commands.js";
import type { ConnectionEvent, FailReason } from "../core/connection.js";

export interface Discord {
  /** Logs in; resolves undefined once the gateway accepted the bot, or the reason it never will. */
  login(): Promise<FailReason | undefined>;
  /** Replaces the global slash commands with these; resolves the number registered. */
  registerCommands(commands: readonly CommandDefinition[]): Promise<number>;
  destroy(): Promise<void>;
}

export interface DiscordConfig {
  discordToken: string;
  discordAppId: string;
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
