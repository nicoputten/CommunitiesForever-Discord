// The site's event feed (web repo docs/BOT-API.md "Events") read defensively, and what the bot does with each event
// (BOT-03). Pure: settings and what is already posted come in as arguments.
import { type FeatItem, type Milestone, showable } from "./milestones.js";
import { type MessageContent, testMessage } from "./message.js";
import { type Board, readBoard } from "./doomsday.js";
import { type Ladder, readLadder } from "./ladder.js";
import { type Recap, readRecap } from "./recap.js";
import type { TestKind } from "./samples.js";
import { type Ask, type Ping, type Run, readAsk, readMention, readPing, readRun } from "./runs.js";
import type { SiteSettings } from "./settings.js";
import { isObject, number, opt, text } from "./read.js";

export interface SiteEvent {
  id: number;
  type: string;
  data: unknown;
}

export interface EventsAnswer {
  events: SiteEvent[];
  cursor?: string;
}

export function readEvents(body: unknown): EventsAnswer {
  if (!isObject(body)) return { events: [] };
  const events = Array.isArray(body.events) ? body.events : [];
  return {
    events: events.flatMap((e): SiteEvent[] =>
      isObject(e) && Number.isInteger(e.id) && typeof e.type === "string"
        ? [{ id: e.id as number, type: e.type, data: e.data }]
        : [],
    ),
    cursor: typeof body.cursor === "string" && /^\d+$/.test(body.cursor) ? body.cursor : undefined,
  };
}

export function readMilestones(data: unknown): Milestone[] {
  if (!isObject(data) || !Array.isArray(data.milestones)) return [];
  return data.milestones.flatMap((m, index): Milestone[] => {
    if (!isObject(m) || !isObject(m.character) || typeof m.character.guid !== "string") return [];
    const c = m.character;
    const character = {
      guid: c.guid as string,
      name: text(c.name),
      classFile: text(c.classFile),
      level: number(c.level),
      ownerName: text(c.ownerName),
    };
    // WEB-56, on every kind: the site's line, the badge and the card image.
    const feat = {
      index,
      ...opt("text", text(m.text)),
      ...(m.firstInGroup === true ? { firstInGroup: true } : {}),
      ...opt("card", text(m.card)),
      // WEB-66: the site's words for the visual post.
      ...opt("headline", text(m.headline)),
      ...opt("line", text(m.line)),
    };
    switch (m.kind) {
      case "level":
      case "maxLevel":
        return [{ ...feat, kind: m.kind, character, level: number(m.level), from: number(m.from) }];
      case "professionCap":
        return [
          {
            ...feat,
            kind: m.kind,
            character,
            skillLine: number(m.skillLine),
            profession: text(m.profession),
            rank: number(m.rank),
            ...opt("title", text(m.title)),
          },
        ];
      case "newCharacter":
      case "firstCatch":
        return [{ ...feat, kind: m.kind, character }];
      case "honorKills":
        return [{ ...feat, kind: m.kind, character, ...opt("kills", number(m.kills)) }];
      case "pvpRank":
        return [
          {
            ...feat,
            kind: m.kind,
            character,
            ...opt("rank", number(m.rank)),
            ...opt("rankName", text(m.rankName)),
            ...opt("title", text(m.title)),
          },
        ];
      case "duelWins":
        return [{ ...feat, kind: m.kind, character, ...opt("wins", number(m.wins)) }];
      case "bgFirstWin":
        return [{ ...feat, kind: m.kind, character, ...opt("battleground", text(m.battleground)) }];
      case "deaths100":
        return [{ ...feat, kind: m.kind, character, ...opt("deaths", number(m.deaths)) }];
      case "firstEpic":
        return [{ ...feat, kind: m.kind, character, ...opt("item", item(m.item)) }];
      case "mount":
      case "epicMount":
        return [
          {
            ...feat,
            kind: m.kind,
            character,
            ...opt("riding", number(m.riding)),
            ...opt("level", number(m.level)),
            ...opt("place", number(m.place)),
          },
        ];
      case "jackOfAllTrades":
        return [
          {
            ...feat,
            kind: m.kind,
            character,
            professions: (Array.isArray(m.professions) ? m.professions : []).flatMap((p) => text(p) ?? []),
          },
        ];
      case "notableItem":
        return [
          {
            ...feat,
            kind: m.kind,
            character,
            ...opt("notable", text(m.notable)),
            ...opt("item", item(m.item)),
          },
        ];
      default:
        // A kind from a newer site: posted with its text, skipped without one (Nico, 2026-10-28).
        return feat.text !== undefined || feat.headline !== undefined
          ? [{ ...feat, kind: "other", character, text: feat.text ?? feat.headline ?? "" }]
          : [];
    }
  });
}

function item(value: unknown): FeatItem | undefined {
  if (!isObject(value)) return undefined;
  return {
    ...opt("id", number(value.id)),
    ...opt("name", text(value.name)),
    ...opt("slot", text(value.slot)),
    ...opt("level", number(value.level)),
  };
}

/** The event's one card image for a post of several feats (WEB-56), when the site sent one. */
export function readFeatCard(data: unknown): string | undefined {
  return isObject(data) ? text(data.card) : undefined;
}

export type Action =
  /** Post (or add to the open post, BOT-09): the feats that can be shown and the event's card image (BOT-14). */
  | { do: "post"; milestones: Milestone[]; card?: string }
  /** Post this message on its own (the test post). */
  | { do: "send"; content: MessageContent }
  /** BOT-17: a test of a kind: its made-up sample, in that kind's channel. */
  | { do: "sample"; kind: TestKind }
  /** Post the weekly recap with its card images, in the recap channel (BOT-05). */
  | { do: "recap"; recap: Recap }
  /** A run event (BOT-04), for the runs channel; `posted`: its own message, when one was found by its marker. */
  | { do: "run"; event: RunEvent; posted?: string }
  /**
   * BOT-15: the daily Doomsday board, or an update of it (`board.update`), for the Doomsday channel. `posted`: the
   * board's message found by its marker, when known.
   */
  | { do: "board"; board: Board; posted?: string }
  /** BOT-16: the weekly Doomsday ladder, for the Doomsday channel. */
  | { do: "ladder"; ladder: Ladder }
  /** Already in the channel (found by its marker): only acknowledge it. */
  | { do: "ack"; messageId: string }
  /** Nothing to post: leave it; the site lets it expire. */
  | { do: "leave" };

/** The run events (web BOT-API.md "Run events"), each with what the bot needs of it. */
export type RunEvent =
  | { type: "runCreated" | "runChanged" | "runEnded"; run: Run; test: boolean; changed: string[] }
  | { type: "runCancelled"; run: Run; by?: string; mention: string[] }
  | { type: "runReminder"; run: Run; minutes?: number; mention: string[] }
  | { type: "runStarting"; run: Run; mention: string[] }
  | { type: "runMovedUp"; run: Run; who?: string }
  | { type: "runMoved"; run: Run; who?: string; to: string; by?: string }
  | { type: "ping"; run: Run; ping: Ping }
  | { type: "askNow" | "askChanged" | "askExpired"; ask: Ask };

const RUN_TYPES = new Set([
  "runCreated",
  "runChanged",
  "runEnded",
  "runCancelled",
  "runReminder",
  "runStarting",
  "runMovedUp",
  "runMoved",
  "ping",
  "askNow",
  "askChanged",
  "askExpired",
]);

/** A run event as read; undefined for another type or one without what it needs. */
export function readRunEvent(event: SiteEvent): RunEvent | undefined {
  if (!RUN_TYPES.has(event.type) || !isObject(event.data)) return undefined;
  const data = event.data;
  if (event.type === "askNow" || event.type === "askChanged" || event.type === "askExpired") {
    const ask = readAsk(data);
    return ask === undefined ? undefined : { type: event.type, ask };
  }
  const run = readRun(data.run);
  if (run === undefined) return undefined;
  const mention = readMention(data.mention);
  const discordId = (value: unknown) => {
    const id = isObject(value) ? value.discordId : undefined;
    return typeof id === "string" && /^\d{1,20}$/.test(id) ? id : undefined;
  };
  switch (event.type) {
    case "runCreated":
    case "runChanged":
    case "runEnded":
      return {
        type: event.type,
        run,
        test: data.test === true,
        changed: (Array.isArray(data.changed) ? data.changed : []).filter((c): c is string => typeof c === "string"),
      };
    case "runCancelled":
      return { type: "runCancelled", run, ...opt("by", text(data.by)), mention };
    case "runReminder":
      return { type: "runReminder", run, ...opt("minutes", number(data.minutes)), mention };
    case "runStarting":
      return { type: "runStarting", run, mention };
    case "runMovedUp":
      return { type: "runMovedUp", run, ...opt("who", discordId(data.who)) };
    case "runMoved":
      return {
        type: "runMoved",
        run,
        ...opt("who", discordId(data.who)),
        to: text(data.to) ?? "removed",
        ...opt("by", text(data.by)),
      };
    default: {
      const ping = readPing(data);
      return ping === undefined ? undefined : { type: "ping", run, ping };
    }
  }
}

export function decide(
  event: SiteEvent,
  settings: SiteSettings,
  posted: ReadonlyMap<number, string>,
  siteUrl: string,
  siteHost: string,
): Action {
  const messageId = posted.get(event.id);
  if (event.type === "test") {
    // The posts channel's plain test; BOT-17: feats, the recap and Doomsday get a sample of their own, and a kind the
    // bot doesn't know the plain test in the posts channel (BOT-API.md "test").
    const kind = isObject(event.data) ? event.data.kind : undefined;
    if (messageId !== undefined) return { do: "ack", messageId };
    if (kind === "feats" || kind === "recap" || kind === "doomsday") return { do: "sample", kind };
    return { do: "send", content: testMessage(event.id, siteUrl, siteHost) };
  }
  if (event.type === "recap") {
    // Off on the site's Discord page: left, and the site lets it expire (BOT-API.md "recap").
    if (settings.recap === false) return { do: "leave" };
    if (messageId !== undefined) return { do: "ack", messageId };
    const recap = readRecap(event.data);
    return recap !== undefined ? { do: "recap", recap } : { do: "leave" };
  }
  if (event.type === "doomsdayLadder") {
    // Off on the site's Discord page: left (BOT-API.md "Doomsday").
    if (settings.doomsdayLadder === false) return { do: "leave" };
    if (messageId !== undefined) return { do: "ack", messageId };
    const ladder = readLadder(event.data);
    return ladder !== undefined ? { do: "ladder", ladder } : { do: "leave" };
  }
  if (event.type === "doomsdayBoard" || event.type === "doomsdayBoardUpdate") {
    // Off on the site's Discord page: left (BOT-API.md "Doomsday").
    if (settings.doomsdayBoard === false) return { do: "leave" };
    const board = readBoard(event.data, event.type === "doomsdayBoardUpdate");
    if (board === undefined) return { do: "leave" };
    if (board.update === undefined && messageId !== undefined) return { do: "ack", messageId };
    const known = board.update !== undefined ? posted.get(board.update.boardEvent) : undefined;
    return { do: "board", board, ...(known !== undefined ? { posted: known } : {}) };
  }
  if (RUN_TYPES.has(event.type)) {
    // Off on the site's Discord page: left (BOT-API.md "Run events").
    if (settings.runs === false) return { do: "leave" };
    const run = readRunEvent(event);
    if (run === undefined) return { do: "leave" };
    return { do: "run", event: run, ...(messageId !== undefined ? { posted: messageId } : {}) };
  }
  if (event.type !== "milestones" || settings.milestones === false) return { do: "leave" };
  if (messageId !== undefined) return { do: "ack", messageId };
  const milestones = showable(readMilestones(event.data));
  if (milestones.length === 0) return { do: "leave" };
  const card = readFeatCard(event.data);
  return { do: "post", milestones, ...(card !== undefined ? { card } : {}) };
}
