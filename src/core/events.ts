// The site's event feed (web repo docs/BOT-API.md "Events") read defensively, and what the bot does with each event
// (BOT-03). Pure: settings and what is already posted come in as arguments.
import { type MessageContent, type Milestone, milestoneMessage } from "./milestones.js";
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
  return data.milestones.flatMap((m): Milestone[] => {
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
        return [{ kind: m.kind, character, level: number(m.level), from: number(m.from) }];
      case "professionCap":
        return [
          {
            kind: m.kind,
            character,
            skillLine: number(m.skillLine),
            profession: text(m.profession),
            rank: number(m.rank),
          },
        ];
      case "newCharacter":
        return [{ kind: m.kind, character }];
      default:
        return [];
    }
  });
}

export type Action =
  | { do: "post"; content: MessageContent }
  /** Already in the channel (found by its marker): only acknowledge it. */
  | { do: "ack"; messageId: string }
  /** Nothing to post: leave it; the site lets it expire. */
  | { do: "leave" };

export function decide(
  event: SiteEvent,
  settings: SiteSettings,
  posted: ReadonlyMap<number, string>,
  siteUrl: string,
  siteHost: string,
): Action {
  if (event.type !== "milestones" || settings.milestones === false) return { do: "leave" };
  const messageId = posted.get(event.id);
  if (messageId !== undefined) return { do: "ack", messageId };
  const content = milestoneMessage(event.id, readMilestones(event.data), siteUrl, siteHost);
  return content ? { do: "post", content } : { do: "leave" };
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
