// The Discord gateway (BOT-02): one client with the Guilds intent only (no privileged intents), its state changes
// reported as ConnectionEvents, the global slash command registration, and posting (BOT-03). Thin: what to do with
// them is src/app's. It also tells what the server's channels and roles are, for the site's dropdowns (BOT-08).
import {
  ApplicationCommandOptionType,
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
import type { Emoji } from "../core/classIcons.js";
import type { CommandDefinition } from "../core/commands.js";
import type { ConnectionEvent, FailReason } from "../core/connection.js";
import type { GuildSnapshot } from "../core/guild.js";
import type { MessageContent, PostedMessage } from "../core/message.js";

export interface Discord {
  /** Logs in; resolves undefined once the gateway accepted the bot, or the reason it never will. */
  login(): Promise<FailReason | undefined>;
  /** Replaces the global slash commands with these; resolves the number registered. */
  registerCommands(commands: readonly CommandDefinition[]): Promise<number>;
  /** Posts a message, with image files it references as `attachment://<name>` (BOT-05); resolves its id. Throws a PostError. */
  post(channelId: string, content: MessageContent, files?: readonly Attachment[]): Promise<string>;
  /** Replaces a posted message's content (BOT-09). Throws a PostError. */
  edit(channelId: string, messageId: string, content: MessageContent): Promise<void>;
  /** A direct message to a user (BOT-04's quiet notices); resolves its id. Throws a PostError (50007: DMs closed). */
  dm(userId: string, content: MessageContent): Promise<string>;
  /** BOT-11: the bot's own application emoji (the class icons). Throws a PostError. */
  emojis(): Promise<Emoji[]>;
  /** BOT-11: uploads a PNG as an application emoji; resolves it. Throws a PostError. */
  createEmoji(name: string, png: Uint8Array): Promise<Emoji>;
  /** BOT-11: deletes an application emoji. Throws a PostError. */
  deleteEmoji(id: string): Promise<void>;
  /** The bot's own messages among the channel's last 50. Throws a PostError. */
  recentPosts(channelId: string): Promise<PostedMessage[]>;
  /** The (first) server's channels and roles as Discord's cache knows them; undefined when not in a server. */
  guild(): GuildSnapshot | undefined;
  /**
   * Calls `listener` for each slash command (BOT-05). The answer is deferred at once, only for the asker (ephemeral);
   * `reply` fills it in. Returns the unsubscribe.
   */
  onCommand(listener: (command: SlashCommand) => void): () => void;
  /** Calls `listener` for autocomplete requests (BOT-06). Returns the unsubscribe. */
  onAutocomplete(listener: (request: Autocomplete) => void): () => void;
  /** Calls `listener` for button presses (BOT-06) and select menu choices (BOT-04). Returns the unsubscribe. */
  onButton(listener: (press: ButtonPress) => void): () => void;
  /** Calls `listener` when the server's channels or roles change; returns the unsubscribe. */
  onGuildChange(listener: () => void): () => void;
  destroy(): Promise<void>;
}

/** A slash command a user ran: its name, and the answer to give only to them. */
export interface SlashCommand {
  name: string;
  /** The asker's Discord user id: passed to the site only, never shown (CLAUDE.md rule 5). */
  userId: string;
  /** The options as given: text, or true/false; a sub-command's name as `subcommand` (BOT-04 `/run edit`). */
  options: Readonly<Record<string, string | boolean>>;
  reply(content: MessageContent, files?: readonly Attachment[]): Promise<void>;
}

/** A user typing in an autocomplete option (BOT-06): answer with up to 25 choices. */
export interface Autocomplete {
  command: string;
  /** BOT-04: who is typing (for their own runs and days), passed to the site only. */
  userId: string;
  option: string;
  value: string;
  respond(choices: readonly { name: string; value: string }[]): Promise<void>;
}

/**
 * A button press (BOT-06: Share) or a select menu choice (BOT-04). `share` posts the given message in the channel the
 * button is in.
 */
export interface ButtonPress {
  customId: string;
  /** The presser's Discord user id (BOT-04): passed to the site only, never shown (CLAUDE.md rule 5). */
  userId: string;
  /** A select menu's chosen values; empty for a button. */
  values: readonly string[];
  share(content: MessageContent, files?: readonly Attachment[]): Promise<void>;
  /**
   * Acknowledges at once (Discord wants it within 3 seconds), before asking the site: `reply` thinks in a new answer
   * only for the presser, `update` keeps the message the component is on, to change it (BOT-04's picker).
   */
  defer(as: "reply" | "update"): void;
  /** Answers only the presser (ephemeral). Throws a PostError. */
  reply(content: MessageContent): Promise<void>;
  /** Replaces the message the component is on (an ephemeral answer of the bot's). Throws a PostError. */
  update(content: MessageContent): Promise<void>;
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
  const autocompleteListeners = new Set<(request: Autocomplete) => void>();
  const buttonListeners = new Set<(press: ButtonPress) => void>();
  const files = (list: readonly Attachment[]) => list.map((f) => ({ name: f.name, attachment: Buffer.from(f.data) }));
  client.on(Events.InteractionCreate, (interaction) => {
    if (interaction.isAutocomplete()) {
      const focused = interaction.options.getFocused(true);
      const request: Autocomplete = {
        command: interaction.commandName,
        userId: interaction.user.id,
        option: focused.name,
        value: String(focused.value),
        async respond(choices) {
          await interaction
            .respond(choices.slice(0, 25).map((c) => ({ name: c.name.slice(0, 100), value: c.value.slice(0, 100) })))
            .catch(() => undefined);
        },
      };
      autocompleteListeners.forEach((listener) => listener(request));
      return;
    }
    if (interaction.isButton() || interaction.isStringSelectMenu()) {
      let deferred: Promise<unknown> | undefined;
      let deferredAs: "reply" | "update" | undefined;
      const answer = (content: MessageContent) => ({
        ...(content.content !== undefined ? { content: content.content } : {}),
        embeds: content.embeds,
        allowedMentions: { parse: [] },
        components: (content.components ?? []) as never[],
      });
      const press: ButtonPress = {
        customId: interaction.customId,
        userId: interaction.user.id,
        values: interaction.isStringSelectMenu() ? [...interaction.values] : [],
        defer(as) {
          if (deferred !== undefined) return;
          deferredAs = as;
          deferred = (
            as === "reply" ? interaction.deferReply({ flags: MessageFlags.Ephemeral }) : interaction.deferUpdate()
          ).catch(() => undefined);
        },
        async reply(content) {
          try {
            if (deferredAs === "reply") {
              await deferred;
              await interaction.editReply(answer(content));
            } else if (deferred !== undefined) {
              await deferred;
              await interaction.followUp({ ...answer(content), flags: MessageFlags.Ephemeral });
            } else {
              await interaction.reply({ ...answer(content), flags: MessageFlags.Ephemeral });
            }
          } catch (error) {
            throw refused(error);
          }
        },
        async update(content) {
          try {
            if (deferred !== undefined) {
              await deferred;
              await interaction.editReply(answer(content));
            } else {
              await interaction.update(answer(content));
            }
          } catch (error) {
            throw refused(error);
          }
        },
        async share(content, attachments = []) {
          try {
            // The ephemeral answer stays; the shared copy is a new message in the channel.
            await interaction.reply({
              embeds: content.embeds,
              allowedMentions: { parse: [] },
              files: files(attachments),
            });
          } catch (error) {
            throw refused(error);
          }
        },
      };
      buttonListeners.forEach((listener) => listener(press));
      return;
    }
    if (!interaction.isChatInputCommand()) return;
    // Within Discord's 3 seconds; the answer follows when the site has given it.
    const deferred = interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => undefined);
    const options: Record<string, string | boolean> = {};
    for (const option of interaction.options.data) {
      if (typeof option.value === "string" || typeof option.value === "boolean") options[option.name] = option.value;
      if (option.type === ApplicationCommandOptionType.Subcommand) {
        options.subcommand = option.name;
        for (const sub of option.options ?? []) {
          if (typeof sub.value === "string" || typeof sub.value === "boolean") options[sub.name] = sub.value;
        }
      }
    }
    const command: SlashCommand = {
      name: interaction.commandName,
      userId: interaction.user.id,
      options,
      async reply(content, attachments = []) {
        await deferred;
        try {
          await interaction.editReply({
            embeds: content.embeds,
            allowedMentions: { parse: [] },
            files: files(attachments),
            ...(content.components !== undefined ? { components: content.components } : {}),
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
    async dm(userId, content) {
      try {
        const channel = (await rest.post(Routes.userChannels(), { body: { recipient_id: userId } })) as { id: string };
        const message = (await rest.post(Routes.channelMessages(channel.id), { body: content })) as ApiMessage;
        return message.id;
      } catch (error) {
        throw refused(error);
      }
    },
    async emojis() {
      try {
        const list = (await rest.get(Routes.applicationEmojis(config.discordAppId))) as { items?: Emoji[] };
        return (list.items ?? []).map((e) => ({ id: e.id, name: e.name }));
      } catch (error) {
        throw refused(error);
      }
    },
    async createEmoji(name, png) {
      try {
        const image = `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
        const emoji = (await rest.post(Routes.applicationEmojis(config.discordAppId), {
          body: { name, image },
        })) as Emoji;
        return { id: emoji.id, name: emoji.name };
      } catch (error) {
        throw refused(error);
      }
    },
    async deleteEmoji(id) {
      try {
        await rest.delete(Routes.applicationEmoji(config.discordAppId, id));
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
    onAutocomplete(listener) {
      autocompleteListeners.add(listener);
      return () => autocompleteListeners.delete(listener);
    },
    onButton(listener) {
      buttonListeners.add(listener);
      return () => buttonListeners.delete(listener);
    },
    onGuildChange(listener) {
      guildListeners.add(listener);
      return () => guildListeners.delete(listener);
    },
    async destroy() {
      guildListeners.clear();
      commandListeners.clear();
      autocompleteListeners.clear();
      buttonListeners.clear();
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
