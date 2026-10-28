// The site's event feed (web repo docs/BOT-API.md "Events") read defensively, and what the bot does with each event
// (BOT-03). Pure: settings and what is already posted come in as arguments.
import { type MessageContent, type Milestone, showable, testMessage } from "./milestones.js";
import { type Recap, readRecap } from "./recap.js";
import { type Ask, type Ping, type Run, readAsk, readMention, readPing, readRun } from "./runs.js";
import type { SiteSettings } from "./settings.js";

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
    switch (m.kind) {
      case "level":
      case "maxLevel":
        return [{ index, kind: m.kind, character, level: number(m.level), from: number(m.from) }];
      case "professionCap":
        return [
          {
            index,
            kind: m.kind,
            character,
            skillLine: number(m.skillLine),
            profession: text(m.profession),
            rank: number(m.rank),
          },
        ];
      case "newCharacter":
        return [{ index, kind: m.kind, character }];
      default:
        return [];
    }
  });
}

export type Action =
  /** Post (or add to the open post, BOT-09): the milestones that can be shown. */
  | { do: "post"; milestones: Milestone[] }
  /** Post this message on its own (the test post). */
  | { do: "send"; content: MessageContent }
  /** Post the weekly recap with its card images, in the recap channel (BOT-05). */
  | { do: "recap"; recap: Recap }
  /** A run event (BOT-04), for the runs channel; `posted`: its own message, when one was found by its marker. */
  | { do: "run"; event: RunEvent; posted?: string }
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
  | { type: "askNow"; ask: Ask };

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
]);

/** A run event as read; undefined for another type or one without what it needs. */
export function readRunEvent(event: SiteEvent): RunEvent | undefined {
  if (!RUN_TYPES.has(event.type) || !isObject(event.data)) return undefined;
  const data = event.data;
  if (event.type === "askNow") {
    const ask = readAsk(data);
    return ask === undefined ? undefined : { type: "askNow", ask };
  }
  const run = readRun(data.run);
  if (run === undefined) return undefined;
  const mention = readMention(data.mention);
  const discordId = (value: unknown) => {
    const id = isObject(value) ? value.discordId : undefined;
    return typeof id === "string" && /^\d{1,20}$/.test(id) ? id : undefined;
  };
  const optional = <K extends string, V>(key: K, value: V | undefined) =>
    (value === undefined ? {} : { [key]: value }) as { [P in K]?: V };
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
      return { type: "runCancelled", run, ...optional("by", text(data.by)), mention };
    case "runReminder":
      return { type: "runReminder", run, ...optional("minutes", number(data.minutes)), mention };
    case "runStarting":
      return { type: "runStarting", run, mention };
    case "runMovedUp":
      return { type: "runMovedUp", run, ...optional("who", discordId(data.who)) };
    case "runMoved":
      return {
        type: "runMoved",
        run,
        ...optional("who", discordId(data.who)),
        to: text(data.to) ?? "removed",
        ...optional("by", text(data.by)),
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
    // Only the posts channel's test so far (BOT-API.md "test"); kinds for other channels come with their stories.
    const kind = isObject(event.data) ? event.data.kind : undefined;
    if (kind !== undefined && kind !== "posts") return { do: "leave" };
    if (messageId !== undefined) return { do: "ack", messageId };
    return { do: "send", content: testMessage(event.id, siteUrl, siteHost) };
  }
  if (event.type === "recap") {
    // Off on the site's Discord page: left, and the site lets it expire (BOT-API.md "recap").
    if (settings.recap === false) return { do: "leave" };
    if (messageId !== undefined) return { do: "ack", messageId };
    const recap = readRecap(event.data);
    return recap !== undefined ? { do: "recap", recap } : { do: "leave" };
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
  return milestones.length > 0 ? { do: "post", milestones } : { do: "leave" };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
