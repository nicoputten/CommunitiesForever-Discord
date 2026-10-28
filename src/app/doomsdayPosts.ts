// The daily Doomsday board (BOT-15, board `bot-doomsday-daily`): posted at the reset in the Doomsday channel, then
// edited for each `doomsdayBoardUpdate` of that day, never a new message, until the final one. Edits are throttled to
// one per message per 30 s: a newer update within that time waits and replaces the waiting one (the site does the
// same: only the newest update stays, BOT-API.md "Latest only"), and is acknowledged once it is shown. A board whose
// message is gone is posted again and acknowledged with the new message. "My goals" answers like `/doomsday`.
import type { ButtonPress, Discord } from "../adapters/discord.js";
import { PostError } from "../adapters/discord.js";
import type { Log } from "../adapters/log.js";
import type { Site } from "../adapters/site.js";
import { NO_ICONS } from "../core/classIcons.js";
import {
  type Board,
  boardMessage,
  boardUrl,
  boxes,
  doomsdayReply,
  notAvailableMessage,
  readLookup,
} from "../core/doomsday.js";
import { notLinkedMessage } from "../core/lookups.js";
import type { IconBox } from "./classIcons.js";

/** At most one edit per board message in this time (BOT-15). */
export const EDIT_EVERY_MS = 30_000;
/** How many boards (days) the bot remembers its message for: today's and a few before. */
const KEEP_BOARDS = 7;
/** Discord's "unknown message" and "unknown channel": the board's message is gone. */
const GONE = new Set([10003, 10008]);

export interface DoomsdayDeps {
  siteUrl: string;
  site: Site;
  discord: Discord;
  log: Log;
  now(): number;
  icons?: IconBox;
  /** The site's Doomsday page (settings `doomsday.url`), when it sent one. */
  pageUrl?(): string | undefined;
}

interface Shown {
  channel: string;
  id: string;
  /** When it was last posted or edited, ms; 0 when found after a restart. */
  at: number;
}

interface Waiting {
  eventId: number;
  board: Board;
  channel: string;
  timer: ReturnType<typeof setTimeout>;
}

export class DoomsdayBoards {
  /** Board event id → its message. */
  private readonly shown = new Map<number, Shown>();
  /** Board event id → the newest update waiting for the throttle. */
  private readonly waiting = new Map<number, Waiting>();

  constructor(
    private readonly deps: DoomsdayDeps,
    private readonly signal: AbortSignal,
  ) {
    signal.addEventListener("abort", () => {
      for (const w of this.waiting.values()) clearTimeout(w.timer);
      this.waiting.clear();
    });
  }

  /**
   * Posts a board, or edits its message for an update; resolves the message id to acknowledge the event with, or
   * undefined when the update waits for the throttle (it is acknowledged when shown). `posted`: the board's message
   * found by its marker. Throws a PostError to retry.
   */
  async handle(eventId: number, board: Board, channel: string, posted?: string): Promise<string | undefined> {
    const update = board.update;
    if (update === undefined) {
      const id = await this.post(eventId, board, channel);
      this.deps.log.info(`posted event ${eventId} (Doomsday board ${board.label})`);
      return id;
    }
    const shown =
      this.shown.get(update.boardEvent) ?? this.found(update.boardEvent, channel, posted ?? update.messageId);
    const old = this.waiting.get(update.boardEvent);
    if (old !== undefined) {
      // Replaced by this newer one; the site never hands the older one out again.
      clearTimeout(old.timer);
      this.waiting.delete(update.boardEvent);
    }
    const wait = shown === undefined ? 0 : shown.at + EDIT_EVERY_MS - this.deps.now();
    if (wait > 0) {
      const timer = setTimeout(() => void this.flush(update.boardEvent), wait);
      this.waiting.set(update.boardEvent, { eventId, board, channel, timer });
      return undefined;
    }
    return this.show(eventId, board, channel, shown);
  }

  /** Shows a waiting update and acknowledges it. */
  private async flush(boardEvent: number): Promise<void> {
    const w = this.waiting.get(boardEvent);
    this.waiting.delete(boardEvent);
    if (w === undefined || this.signal.aborted) return;
    try {
      const id = await this.show(w.eventId, w.board, w.channel, this.shown.get(boardEvent));
      const ack = await this.deps.site.posted(w.eventId, id, this.signal);
      // 409 and 410: the site is done with it anyway.
      if (!ack.ok && ack.status !== 409 && ack.status !== 410) {
        this.deps.log.error(`site: acknowledging event ${w.eventId} failed; it comes again`);
      }
    } catch (error) {
      // The next update shows the newest board anyway.
      this.deps.log.error(`discord: updating the Doomsday board (event ${w.eventId}) failed (${codeOf(error)})`);
    }
  }

  /** Edits the board's message, or posts it again when it is gone (or never known). */
  private async show(eventId: number, board: Board, channel: string, shown: Shown | undefined): Promise<string> {
    const boardEvent = board.update?.boardEvent ?? eventId;
    if (shown !== undefined) {
      try {
        await this.deps.discord.edit(shown.channel, shown.id, this.content(boardEvent, board));
        shown.at = this.deps.now();
        this.deps.log.info(`updated the Doomsday board of event ${boardEvent} (event ${eventId})`);
        return shown.id;
      } catch (error) {
        if (!(error instanceof PostError) || !GONE.has(Number(error.code))) throw error;
        this.deps.log.error(`discord: the Doomsday board of event ${boardEvent} is gone; posting it again`);
      }
    }
    const id = await this.post(boardEvent, board, channel);
    this.deps.log.info(`posted the Doomsday board of event ${boardEvent} again (event ${eventId})`);
    return id;
  }

  private async post(boardEvent: number, board: Board, channel: string): Promise<string> {
    const id = await this.deps.discord.post(channel, this.content(boardEvent, board));
    this.remember(boardEvent, { channel, id, at: this.deps.now() });
    return id;
  }

  private found(boardEvent: number, channel: string, id: string | undefined): Shown | undefined {
    if (id === undefined) return undefined;
    const shown = { channel, id, at: 0 };
    this.remember(boardEvent, shown);
    return shown;
  }

  private remember(boardEvent: number, shown: Shown): void {
    this.shown.set(boardEvent, shown);
    for (const old of this.shown.keys()) {
      if (this.shown.size <= KEEP_BOARDS) break;
      this.shown.delete(old);
    }
  }

  private content(boardEvent: number, board: Board) {
    const { siteUrl, icons, pageUrl } = this.deps;
    return boardMessage(board, boardEvent, siteUrl, boardUrl(siteUrl, pageUrl?.()), boxes(icons?.current ?? NO_ICONS));
  }
}

/** "My goals" on the board: the presser's Doomsday, only for them, like `/doomsday` (BOT-16). */
export async function answerMyGoals(
  deps: Omit<DoomsdayDeps, "discord">,
  press: ButtonPress,
  signal: AbortSignal,
): Promise<void> {
  press.defer("reply");
  const host = new URL(deps.siteUrl).host;
  const answer = await deps.site.lookup("doomsday", { discordUserId: press.userId }, signal);
  if (!answer.ok) {
    await press.reply(
      answer.status === 403 ? notLinkedMessage(deps.siteUrl, host, undefined) : notAvailableMessage(answer.status),
    );
    return;
  }
  const look = readLookup(answer.body);
  const page = boardUrl(deps.siteUrl, deps.pageUrl?.());
  await press.reply(
    look === undefined
      ? notAvailableMessage(404)
      : doomsdayReply(look, true, page, boxes(deps.icons?.current ?? NO_ICONS)),
  );
}

function codeOf(error: unknown): string {
  return error instanceof PostError ? `code ${error.code ?? "none"}` : "no answer";
}
