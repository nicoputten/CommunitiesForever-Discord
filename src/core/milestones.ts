// Milestone posts (BOT-03, board `bot-posts` part 1): one message per upload. Pure: the event comes in as read from
// the site, the message goes out as Discord's JSON. Only what the event carries is shown (DESIGN-NOTES "Deviations").

export interface Character {
  guid: string;
  name?: string;
  classFile?: string;
  level?: number;
  ownerName?: string;
}

export type Milestone =
  | { kind: "level" | "maxLevel"; character: Character; level?: number; from?: number }
  | { kind: "professionCap"; character: Character; skillLine?: number; profession?: string; rank?: number }
  | { kind: "newCharacter"; character: Character };

export interface Embed {
  title?: string;
  url?: string;
  description?: string;
  color: number;
}

export interface MessageContent {
  embeds: Embed[];
  allowed_mentions: { parse: never[] };
}

/** The gold embed border (web token `--gold`). */
export const GOLD = 0xd4af6a;

/** Class colours (web tokens). */
export const CLASS_COLOURS: Readonly<Record<string, number>> = {
  WARRIOR: 0xc69b6d,
  PALADIN: 0xf48cba,
  HUNTER: 0xaad372,
  ROGUE: 0xfff468,
  PRIEST: 0xffffff,
  SHAMAN: 0x0070dd,
  MAGE: 0x3fc7eb,
  WARLOCK: 0x8788ee,
  DRUID: 0xff7c0a,
};

const CLASS_NAMES: Readonly<Record<string, string>> = {
  WARRIOR: "Warrior",
  PALADIN: "Paladin",
  HUNTER: "Hunter",
  ROGUE: "Rogue",
  PRIEST: "Priest",
  SHAMAN: "Shaman",
  MAGE: "Mage",
  WARLOCK: "Warlock",
  DRUID: "Druid",
};

/** At most this many milestones in one message; the rest is "and N more" (Discord limits embed length). */
export const MAX_LINES = 10;

/** The character page on the site. */
export function characterUrl(siteUrl: string, guid: string): string {
  return `${siteUrl}/character/${encodeURIComponent(guid)}`;
}

/** The marker that says a post belongs to an event: a fragment on the first character link, ignored by the site. */
export function marker(eventId: number): string {
  return `#e${eventId}`;
}

export interface PostedMessage {
  id: string;
  /** The message's embed links and descriptions. */
  texts: string[];
}

/** Event id → message id for the bot's posts that carry a marker linking to this site. */
export function markedEvents(siteUrl: string, messages: readonly PostedMessage[]): Map<number, string> {
  const pattern = new RegExp(`${escapeRegExp(siteUrl)}/character/[^\\s)#]+#e(\\d+)`, "g");
  const found = new Map<number, string>();
  for (const message of messages) {
    for (const text of message.texts) {
      for (const match of text.matchAll(pattern)) {
        const id = Number(match[1]);
        if (!found.has(id)) found.set(id, message.id);
      }
    }
  }
  return found;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** One upload's milestones as one message, or undefined when none can be shown. */
export function milestoneMessage(
  eventId: number,
  milestones: readonly Milestone[],
  siteUrl: string,
  siteHost: string,
): MessageContent | undefined {
  const shown = milestones.filter((m) => m.character.name).slice(0, MAX_LINES);
  const hidden = milestones.filter((m) => m.character.name).length - shown.length;
  if (shown.length === 0) return undefined;
  let marked = false;
  const link = (character: Character) => {
    const url = characterUrl(siteUrl, character.guid) + (marked ? "" : marker(eventId));
    marked = true;
    return url;
  };

  const embeds: Embed[] = [];
  for (const milestone of shown.filter((m) => m.kind === "maxLevel")) {
    embeds.push({
      title: headline(milestone),
      url: link(milestone.character),
      description: [
        owner(milestone.character),
        detail(milestone),
        `[Open character ↗](${characterUrl(siteUrl, milestone.character.guid)})`,
      ]
        .filter(Boolean)
        .join("\n"),
      color: classColour(milestone.character.classFile),
    });
  }

  const lines = shown
    .filter((m) => m.kind !== "maxLevel")
    .map((milestone) => {
      const name = milestone.character.name as string;
      const title = headline(milestone).replace(name, `[${escapeMarkdown(name)}](${link(milestone.character)})`);
      const by = owner(milestone.character);
      const sub = detail(milestone);
      return `**${title}**${by ? ` · ${by}` : ""}${sub ? `\n${sub}` : ""}`;
    });
  if (hidden > 0) lines.push(`and ${hidden} more on ${siteHost}`);
  if (lines.length > 0) embeds.push({ description: lines.join("\n\n"), color: GOLD });

  return { embeds, allowed_mentions: { parse: [] } };
}

function headline(milestone: Milestone): string {
  const name = milestone.character.name as string;
  switch (milestone.kind) {
    case "maxLevel":
      return `${name} reached level ${milestone.level ?? 60}`;
    case "level":
      return milestone.level ? `${name} hit level ${milestone.level}` : `${name} levelled up`;
    case "professionCap":
      return `${name} maxed ${milestone.profession ?? "a profession"}${milestone.rank ? ` at ${milestone.rank}` : ""}`;
    case "newCharacter":
      return `New character: ${name}`;
  }
}

function detail(milestone: Milestone): string | undefined {
  const { level, classFile } = milestone.character;
  const className = classFile ? CLASS_NAMES[classFile] : undefined;
  if (milestone.kind === "maxLevel") return className;
  if (milestone.kind !== "newCharacter") return undefined;
  const parts = [level !== undefined ? `Level ${level}` : undefined, className].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

function owner(character: Character): string | undefined {
  return character.ownerName ? escapeMarkdown(character.ownerName) : undefined;
}

function classColour(classFile: string | undefined): number {
  return (classFile && CLASS_COLOURS[classFile]) || GOLD;
}

/** Names come from players: no Discord markdown from them (mentions are off through allowed_mentions too). */
export function escapeMarkdown(text: string): string {
  return text.replace(/[\\*_~`|>[\]()<@#:]/g, "\\$&");
}
