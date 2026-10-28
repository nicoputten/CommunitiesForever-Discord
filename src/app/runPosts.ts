// The run posts (BOT-04, board `bot-posts-runs`) in the runs channel: one message per run, edited in every state and
// found again after a restart by its marker (core/runs.ts `markedRuns`); the reminder, Starting now, a ping and an ask
// from the game as new messages, marked with their event id so a restart never posts them twice (CLAUDE.md rule 9);
// the quiet notices as direct messages.
import type { Discord } from "../adapters/discord.js";
import { PostError } from "../adapters/discord.js";
import type { Log } from "../adapters/log.js";
import type { RunEvent } from "../core/events.js";
import type { IconBox } from "./classIcons.js";
import type { MessageContent, PostedMessage } from "../core/message.js";
import {
  type PostContext,
  type Run,
  type Ask,
  askMessage,
  cancelledNotice,
  markedAsks,
  markedRuns,
  movedNotice,
  movedTimeNotice,
  movedUpNotice,
  pingMessage,
  reminderMessage,
  runMessage,
  startingMessage,
} from "../core/runs.js";
import type { SiteSettings } from "../core/settings.js";
import { opt } from "../core/read.js";

/** "Starting soon" from this many minutes before the start when the site doesn't say (BOT-API.md "Settings"). */
export const DEFAULT_REMINDER_MINUTES = 30;
/** Run posts remembered at most; the oldest is forgotten first (it is found again by its marker if still recent). */
export const KEEP_RUNS = 500;
// Discord: 10008 unknown message (deleted). A run post that is gone is posted again.
const UNKNOWN_MESSAGE = 10008;

export interface RunPostDeps {
  siteUrl: string;
  discord: Discord;
  log: Log;
  now(): number;
  /** BOT-11: the class icons, once the start-up sync has them. */
  icons?: IconBox;
}

export class RunPosts {
  private readonly posts = new Map<number, string>();
  /** BOT-12: ask id → its post. */
  private readonly asks = new Map<number, string>();

  constructor(private readonly deps: RunPostDeps) {}

  /** Learns the run posts among a channel's messages (after a restart or a new runs channel). */
  learn(messages: readonly PostedMessage[]): void {
    for (const [run, message] of markedRuns(this.deps.siteUrl, messages)) this.remember(run, message);
    for (const [ask, message] of markedAsks(this.deps.siteUrl, messages)) this.rememberAsk(ask, message);
  }

  forget(): void {
    this.posts.clear();
    this.asks.clear();
  }

  /** The run's post, when the bot knows it (`/plan`'s "Posted in" and the notices' acknowledgement). */
  postOf(runId: number): string | undefined {
    return this.posts.get(runId);
  }

  /**
   * Does what a run event asks in `channel`; resolves the message id to acknowledge it with, or undefined to leave it
   * (nothing could be posted). `posted`: the event's own message, found by its marker. Throws a PostError to retry.
   */
  async handle(event: RunEvent, eventId: number, channel: string, settings: SiteSettings, posted?: string) {
    const { discord, siteUrl } = this.deps;
    const ctx = this.context(settings);
    switch (event.type) {
      case "runCreated":
      case "runChanged":
      case "runEnded": {
        if (event.test) return posted ?? discord.post(channel, runMessage(event.run, { ...ctx, test: { eventId } }));
        const id = await this.upsert(event.run, ctx, channel);
        // A new time (board `bot-commands-runs` `/run edit`): those in and maybe keep their answers and get a notice.
        if (event.type === "runChanged" && event.changed.includes("startsAt")) {
          const told = new Set<string>();
          for (const a of event.run.answers) {
            const user = a.discordId;
            if (a.answer === "cant" || user === undefined || user === event.run.organiser.discordId || told.has(user)) {
              continue;
            }
            told.add(user);
            await this.notice(user, movedTimeNotice(event.run, siteUrl));
          }
        }
        return id;
      }
      case "runCancelled": {
        const id = await this.upsert(event.run, { ...ctx, ...opt("cancelledBy", event.by) }, channel);
        // The organiser who cancelled it needs no notice.
        const self = event.by === event.run.organiser.name ? event.run.organiser.discordId : undefined;
        for (const user of event.mention.filter((u) => u !== self)) {
          await this.notice(user, cancelledNotice(event.run, event.by, siteUrl));
        }
        return id;
      }
      case "runReminder":
      case "runStarting": {
        // The post shows "starting soon" or "started"; the reminder itself is a new message, once.
        await this.upsert(event.run, ctx, channel);
        if (posted !== undefined) return posted;
        const content =
          event.type === "runReminder"
            ? reminderMessage(
                event.run,
                event.minutes ?? ctx.reminderMinutes,
                event.mention,
                eventId,
                siteUrl,
                ctx.icons,
              )
            : startingMessage(event.run, event.mention, eventId, siteUrl, ctx.icons);
        return discord.post(channel, content);
      }
      case "ping":
        return posted ?? discord.post(channel, pingMessage(event.run, event.ping, eventId, siteUrl, ctx.icons));
      case "askNow":
      case "askChanged":
      case "askExpired":
        return this.ask(event.type, event.ask, eventId, channel, ctx, posted);
      case "runMovedUp":
      case "runMoved": {
        if (event.who === undefined) return this.posts.get(event.run.id);
        const content =
          event.type === "runMovedUp"
            ? movedUpNotice(event.run, event.who, siteUrl)
            : movedNotice(event.run, event.to, event.by, siteUrl);
        return (await this.notice(event.who, content)) ?? this.posts.get(event.run.id);
      }
    }
  }

  private context(settings: SiteSettings): PostContext {
    return {
      siteUrl: this.deps.siteUrl,
      siteHost: new URL(this.deps.siteUrl).host,
      now: Math.floor(this.deps.now() / 1000),
      reminderMinutes: settings.reminderMinutes ?? DEFAULT_REMINDER_MINUTES,
      ...opt("icons", this.deps.icons?.current),
      ...opt("mentionRole", settings.mentionRole ?? undefined),
    };
  }

  /** Edits the run's post, or posts it when there is none (or it was deleted). */
  private async upsert(run: Run, ctx: PostContext, channel: string): Promise<string> {
    const content = runMessage(run, ctx);
    const known = this.posts.get(run.id);
    if (known !== undefined) {
      try {
        await this.deps.discord.edit(channel, known, content);
        return known;
      } catch (error) {
        if (!(error instanceof PostError) || error.code !== UNKNOWN_MESSAGE) throw error;
        this.posts.delete(run.id);
      }
    }
    const id = await this.deps.discord.post(channel, content);
    this.remember(run.id, id);
    this.deps.log.info(`posted run ${run.id}`);
    return id;
  }

  /** A quiet notice; a closed inbox or a user who left is logged, not retried. */
  private async notice(user: string, content: MessageContent): Promise<string | undefined> {
    try {
      return await this.deps.discord.dm(user, content);
    } catch (error) {
      const code = error instanceof PostError ? (error.code ?? "none") : "none";
      this.deps.log.error(`discord: a run notice could not be sent (code ${code})`);
      return undefined;
    }
  }

  /**
   * An ask's post (BOT-12): posted once, edited as answers come in, ended ("Expired", no buttons) when it expires;
   * found again after a restart by its `#a<id>` marker. An ask without an id (a site from before WEB-51) is posted
   * once, marked with its event.
   */
  private async ask(
    type: "askNow" | "askChanged" | "askExpired",
    ask: Ask,
    eventId: number,
    channel: string,
    ctx: PostContext,
    posted: string | undefined,
  ): Promise<string | undefined> {
    const content = askMessage(ask, {
      siteUrl: this.deps.siteUrl,
      now: ctx.now,
      eventId,
      ...opt("mentionRole", ctx.mentionRole),
      ...opt("icons", ctx.icons),
    });
    if (ask.id === undefined) return posted ?? this.deps.discord.post(channel, content);
    const known = this.asks.get(ask.id) ?? posted;
    if (known !== undefined) {
      try {
        await this.deps.discord.edit(channel, known, content);
        this.rememberAsk(ask.id, known);
        return known;
      } catch (error) {
        if (!(error instanceof PostError) || error.code !== UNKNOWN_MESSAGE) throw error;
        this.asks.delete(ask.id);
      }
    }
    // Nothing to end: an expired ask whose post is gone is left (the site lets the event expire).
    if (type === "askExpired") return undefined;
    const id = await this.deps.discord.post(channel, content);
    this.rememberAsk(ask.id, id);
    this.deps.log.info(`posted ask ${ask.id}`);
    return id;
  }

  private rememberAsk(ask: number, message: string): void {
    this.asks.delete(ask);
    this.asks.set(ask, message);
    for (const old of this.asks.keys()) {
      if (this.asks.size <= KEEP_RUNS) break;
      this.asks.delete(old);
    }
  }

  private remember(run: number, message: string): void {
    this.posts.delete(run);
    this.posts.set(run, message);
    for (const old of this.posts.keys()) {
      if (this.posts.size <= KEEP_RUNS) break;
      this.posts.delete(old);
    }
  }
}
