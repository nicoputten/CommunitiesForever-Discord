// The daily Doomsday board (BOT-15, BOT-20; boards `bot-doomsday-daily`, `bot-visual-daily`): posted at the reset in
// the Doomsday channel, then edited for each `doomsdayBoardUpdate` of that day, never a new message, until the final
// one. Edits are throttled to one per message per 30 s: a newer update within that time waits and replaces the
// waiting one (the site does the same: only the newest update stays, BOT-API.md "Latest only"), and is acknowledged
// once it is shown. BOT-20: the site's picture of the board is attached, and swapped at most every 5 minutes and only
// when the site's picture changed (Nico, 2026-10-29); a change within those 5 minutes is shown once they are over,
// and the final edit always gets the newest picture. A board whose message is gone is posted again and acknowledged
// with the new message. "My goals" answers like `/doomsday`.
import type { Attachment, ButtonPress, Discord } from "../adapters/discord.js";
import { PostError } from "../adapters/discord.js";
import type { Log } from "../adapters/log.js";
import type { Site } from "../adapters/site.js";
import {
  type Board,
  boardMessage,
  boardUrl,
  boxes,
  doomsdayReply,
  notAvailableMessage,
  readLookup,
} from "../core/doomsday.js";
import { NO_EMOJI } from "../core/emoji.js";
import { notLinkedMessage } from "../core/lookups.js";
import type { EmojiBox } from "./emoji.js";

/** At most one edit per board message in this time (BOT-15). */
export const EDIT_EVERY_MS = 30_000;
/** At most one new picture per board message in this time (BOT-20). */
export const IMAGE_EVERY_MS = 5 * 60_000;
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
  icons?: EmojiBox;
  /** The site's Doomsday page (settings `doomsday.url`), when it sent one. */
  pageUrl?(): string | undefined;
}

interface Shown {
  channel: string;
  id: string;
  /** When it was last posted or edited, ms; 0 when found after a restart. */
  at: number;
  /** BOT-20: the site's picture it shows (its id), and when that was attached, ms. */
  image?: string;
  imageAt: number;
  /** The newest board shown, for showing it again with a newer picture. */
  board?: Board;
  eventId?: number;
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
  /** Board event id → the timer that shows a newer picture once the 5 minutes are over (BOT-20). */
  private readonly refresh = new Map<number, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly deps: DoomsdayDeps,
    private readonly signal: AbortSignal,
  ) {
    signal.addEventListener("abort", () => {
      for (const w of this.waiting.values()) clearTimeout(w.timer);
      for (const timer of this.refresh.values()) clearTimeout(timer);
      this.waiting.clear();
      this.refresh.clear();
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
      const id = await this.post(eventId, eventId, board, channel);
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

  /** BOT-20: shows the newest board again once its picture may be swapped (no acknowledgement: it was shown). */
  private async again(boardEvent: number): Promise<void> {
    this.refresh.delete(boardEvent);
    const shown = this.shown.get(boardEvent);
    if (shown?.board === undefined || shown.eventId === undefined || this.signal.aborted) return;
    if (this.waiting.has(boardEvent)) return; // the waiting update shows it
    try {
      await this.show(shown.eventId, shown.board, shown.channel, shown);
    } catch (error) {
      this.deps.log.error(`discord: updating the Doomsday board's picture failed (${codeOf(error)})`);
    }
  }

  /** Edits the board's message, or posts it again when it is gone (or never known). */
  private async show(eventId: number, board: Board, channel: string, shown: Shown | undefined): Promise<string> {
    const boardEvent = board.update?.boardEvent ?? eventId;
    if (shown !== undefined) {
      const now = this.deps.now();
      const final = board.update?.final === true;
      const newer = board.image !== undefined && board.image !== shown.image;
      const due = final || shown.image === undefined || now - shown.imageAt >= IMAGE_EVERY_MS;
      // The picture to show: a newer one when it is due and can be had, else the one attached.
      let files: Attachment[] | undefined;
      let image = shown.image;
      if (newer && due) {
        const fetched = await this.picture(board.image as string);
        if (fetched !== undefined) {
          files = [fetched];
          image = board.image;
        }
      } else if (board.image === undefined && shown.image !== undefined) {
        // The site sends no picture any more: the text board, and the old picture goes.
        files = [];
        image = undefined;
      }
      try {
        await this.deps.discord.edit(shown.channel, shown.id, this.content(boardEvent, board, image), files);
        shown.at = now;
        if (files !== undefined) {
          shown.image = image;
          shown.imageAt = now;
        }
        shown.board = board;
        shown.eventId = eventId;
        if (newer && !due) this.later(boardEvent, shown.imageAt + IMAGE_EVERY_MS - now);
        this.deps.log.info(`updated the Doomsday board of event ${boardEvent} (event ${eventId})`);
        return shown.id;
      } catch (error) {
        if (!(error instanceof PostError) || !GONE.has(Number(error.code))) throw error;
        this.deps.log.error(`discord: the Doomsday board of event ${boardEvent} is gone; posting it again`);
      }
    }
    const id = await this.post(boardEvent, eventId, board, channel);
    this.deps.log.info(`posted the Doomsday board of event ${boardEvent} again (event ${eventId})`);
    return id;
  }

  /** Shows the board again in `ms`, for its newer picture; one timer per board. */
  private later(boardEvent: number, ms: number): void {
    if (this.refresh.has(boardEvent)) return;
    this.refresh.set(
      boardEvent,
      setTimeout(() => void this.again(boardEvent), Math.max(0, ms)),
    );
  }

  private async post(boardEvent: number, eventId: number, board: Board, channel: string): Promise<string> {
    const picture = board.image !== undefined ? await this.picture(board.image) : undefined;
    const image = picture !== undefined ? board.image : undefined;
    const id = await this.deps.discord.post(
      channel,
      this.content(boardEvent, board, image),
      picture !== undefined ? [picture] : [],
    );
    const now = this.deps.now();
    this.remember(boardEvent, {
      channel,
      id,
      at: now,
      ...(image !== undefined ? { image } : {}),
      imageAt: now,
      board,
      eventId,
    });
    return id;
  }

  /** The site's picture of the board; undefined (and logged) when it can't be had: the post shows text instead. */
  private async picture(image: string): Promise<Attachment | undefined> {
    const data = await this.deps.site.image(`cards/${image}.png`, this.signal);
    if (data === undefined) this.deps.log.error(`site: board image ${image} unavailable; showing the text board`);
    return data === undefined ? undefined : { name: `${image}.png`, data };
  }

  private found(boardEvent: number, channel: string, id: string | undefined): Shown | undefined {
    if (id === undefined) return undefined;
    // Found after a restart: which picture it shows isn't known, so the next update attaches the site's.
    const shown: Shown = { channel, id, at: 0, imageAt: 0 };
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

  private content(boardEvent: number, board: Board, image: string | undefined) {
    const { siteUrl, icons, pageUrl } = this.deps;
    return boardMessage(
      board,
      boardEvent,
      siteUrl,
      boardUrl(siteUrl, pageUrl?.()),
      boxes(icons?.current ?? NO_EMOJI),
      image !== undefined ? `${image}.png` : undefined,
    );
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
      : doomsdayReply(look, true, page, boxes(deps.icons?.current ?? NO_EMOJI)),
  );
}

function codeOf(error: unknown): string {
  return error instanceof PostError ? `code ${error.code ?? "none"}` : "no answer";
}
