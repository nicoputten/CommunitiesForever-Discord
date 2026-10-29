// Fakes for the adapters: a site that serves events like BOT-API.md, and a Discord that keeps the channel's posts.
import {
  type Attachment,
  type Autocomplete,
  type ButtonPress,
  type Discord,
  PostError,
  type SlashCommand,
} from "../../src/adapters/discord.js";
import type { Site, SiteAnswer } from "../../src/adapters/site.js";
import type { Emoji } from "../../src/core/emoji.js";
import type { CommandDefinition } from "../../src/core/commands.js";
import type { ConnectionEvent, FailReason } from "../../src/core/connection.js";
import type { GuildSnapshot } from "../../src/core/guild.js";
import type { MessageContent, PostedMessage } from "../../src/core/message.js";

// Made-up values only (CLAUDE.md rule 1).
export const CHANNEL = "100000000000000002";

export function logger() {
  const lines: { level: string; text: string }[] = [];
  return {
    lines,
    texts: () => lines.map((l) => l.text),
    log: {
      info: (text: string) => lines.push({ level: "info", text }),
      error: (text: string) => lines.push({ level: "error", text }),
    },
  };
}

export function milestonesEvent(id: number, name = "Mira Sunstrider") {
  return {
    id,
    type: "milestones",
    createdAt: 1793112000,
    data: {
      uploadId: id,
      milestones: [
        { kind: "level", character: { guid: `Player-1-${id}`, name, classFile: "MAGE", ownerName: "Mira" }, level: 40 },
      ],
    },
  };
}

/** The site: events stay until acknowledged, like BOT-API.md "Events". */
export class FakeSite implements Site {
  settingsBody: unknown = { siteName: "Doombringers", posts: { milestones: true }, channels: { posts: CHANNEL } };
  settingsDown = 0;
  eventsDown = 0;
  ackDown = 0;
  events_: { id: number; type: string; data: unknown }[] = [];
  acked = new Map<number, string>();
  waiting: (() => void)[] = [];
  guildReports: unknown[] = [];
  guildStatus: number | undefined;

  async settings(): Promise<SiteAnswer> {
    if (this.settingsDown > 0) {
      this.settingsDown--;
      return { ok: false };
    }
    return { ok: true, body: this.settingsBody };
  }

  async events(after: string, signal: AbortSignal): Promise<SiteAnswer> {
    if (this.eventsDown > 0) {
      this.eventsDown--;
      return { ok: false, status: 502 };
    }
    let open = this.events_.filter((e) => e.id > Number(after) && !this.acked.has(e.id));
    if (open.length === 0) {
      // The long poll: held until an event arrives or the bot stops.
      await new Promise<void>((resolve) => {
        this.waiting.push(resolve);
        signal.addEventListener("abort", () => resolve(), { once: true });
      });
      open = this.events_.filter((e) => e.id > Number(after) && !this.acked.has(e.id));
    }
    const cursor = String(open.at(-1)?.id ?? after);
    return { ok: true, body: { events: open, cursor } };
  }

  async posted(eventId: number, messageId: string): Promise<SiteAnswer> {
    if (this.ackDown > 0) {
      this.ackDown--;
      return { ok: false, status: 500 };
    }
    if (this.acked.has(eventId) && this.acked.get(eventId) !== messageId) return { ok: false, status: 409 };
    this.acked.set(eventId, messageId);
    return { ok: true, body: { id: eventId, messageId } };
  }

  /** Card images by path (BOT-05); a missing one is "unavailable". */
  images = new Map<string, Uint8Array>();
  recap: unknown;

  async image(path: string): Promise<Uint8Array | undefined> {
    return this.images.get(path);
  }

  /** Look-up answers by `<what>` (BOT-06); `lookups` records each request's parameters. */
  lookupAnswers = new Map<string, SiteAnswer>();
  lookups: { what: string; params: Record<string, string> }[] = [];

  async lookup(what: string, params: Readonly<Record<string, string>>): Promise<SiteAnswer> {
    this.lookups.push({ what, params: { ...params } });
    return this.lookupAnswers.get(what) ?? { ok: false, status: 404 };
  }

  /**
   * Run actions (BOT-04): answers by `<METHOD> <path without query>`, e.g. `POST runs/7/answers`; `runCalls` records
   * each call.
   */
  runAnswers = new Map<string, SiteAnswer>();
  runCalls: { method: string; path: string; body: unknown }[] = [];

  async runs(method: string, path: string, body: unknown): Promise<SiteAnswer> {
    this.runCalls.push({ method, path, body });
    return this.runAnswers.get(`${method} ${path.split("?")[0]}`) ?? { ok: false, status: 404, error: "unknown_run" };
  }

  async recapLatest(): Promise<SiteAnswer> {
    return this.recap === undefined ? { ok: false, status: 404 } : { ok: true, body: this.recap };
  }

  async guild(report: unknown): Promise<SiteAnswer> {
    if (this.guildStatus !== undefined) return { ok: false, status: this.guildStatus };
    this.guildReports.push(report);
    return { ok: true, body: {} };
  }

  add(event: { id: number; type: string; data: unknown }) {
    this.events_.push(event);
    this.waiting.splice(0).forEach((resolve) => resolve());
  }
}

export class FakeDiscord implements Discord {
  report: (event: ConnectionEvent) => void = () => undefined;
  registered: (readonly CommandDefinition[])[] = [];
  destroyed = false;
  loginResult: Promise<FailReason | undefined> = new Promise(() => undefined);
  registerError = false;
  postFailures = 0;
  messages: (PostedMessage & { channel: string; content: MessageContent; files: string[] })[] = [];
  private next = 1100000000000000001n;

  login = () => this.loginResult;
  registerCommands = async (commands: readonly CommandDefinition[]) => {
    if (this.registerError) throw new Error("rest");
    this.registered.push(commands);
    return commands.length;
  };
  post = async (channel: string, content: MessageContent, files: readonly Attachment[] = []) => {
    if (this.postFailures > 0) {
      this.postFailures--;
      throw new PostError(50013);
    }
    const id = String(this.next++);
    this.messages.push({
      id,
      channel,
      content,
      files: files.map((f) => f.name),
      texts: content.embeds.flatMap((e) => [e.url ?? "", e.description ?? ""]),
    });
    return id;
  };
  editFailures = 0;
  edits = 0;
  edit = async (channel: string, id: string, content: MessageContent, files?: readonly Attachment[]) => {
    const message = this.messages.find((m) => m.id === id && m.channel === channel);
    if (this.editFailures > 0 || message === undefined) {
      this.editFailures = Math.max(0, this.editFailures - 1);
      throw new PostError(10008);
    }
    this.edits++;
    message.content = content;
    if (files !== undefined) message.files = files.map((f) => f.name);
    message.texts = content.embeds.flatMap((e) => [e.url ?? "", e.description ?? ""]);
  };
  snapshot: GuildSnapshot | undefined = {
    channels: [{ id: CHANNEL, name: "doombringers", kind: "text", position: 1, canPost: true }],
    roles: [],
  };
  guildListeners = new Set<() => void>();
  guild = () => this.snapshot;
  onGuildChange = (listener: () => void) => {
    this.guildListeners.add(listener);
    return () => this.guildListeners.delete(listener);
  };
  autocompleteListeners: ((request: Autocomplete) => void)[] = [];
  buttonListeners: ((press: ButtonPress) => void)[] = [];
  onAutocomplete = (listener: (request: Autocomplete) => void) => {
    this.autocompleteListeners.push(listener);
    return () => undefined;
  };
  onButton = (listener: (press: ButtonPress) => void) => {
    this.buttonListeners.push(listener);
    return () => undefined;
  };
  commandListeners: ((command: SlashCommand) => void)[] = [];
  onCommand = (listener: (command: SlashCommand) => void) => {
    this.commandListeners.push(listener);
    return () => undefined;
  };
  /** BOT-11: the bot's application emoji. */
  emojiList: Emoji[] = [];
  emojiFailures = 0;
  emojiReadFails = false;
  deletedEmoji: string[] = [];
  emojis = async () => {
    if (this.emojiReadFails) throw new PostError(50001);
    return [...this.emojiList];
  };
  createEmoji = async (name: string) => {
    if (this.emojiFailures > 0) {
      this.emojiFailures--;
      throw new PostError(50035);
    }
    const emoji = { id: String(this.next++), name };
    this.emojiList.push(emoji);
    return emoji;
  };
  deleteEmoji = async (id: string) => {
    this.deletedEmoji.push(id);
    this.emojiList = this.emojiList.filter((e) => e.id !== id);
  };
  dms: { user: string; content: MessageContent }[] = [];
  dmFailures = 0;
  dm = async (user: string, content: MessageContent) => {
    if (this.dmFailures > 0) {
      this.dmFailures--;
      throw new PostError(50007);
    }
    this.dms.push({ user, content });
    return String(this.next++);
  };
  recentPosts = async (channel: string) => this.messages.filter((m) => m.channel === channel).slice(-50);
  destroy = async () => {
    this.destroyed = true;
  };
}
