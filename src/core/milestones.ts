// Milestone posts (BOT-03, board `bot-posts` part 1): one message per upload. Pure: the event comes in as read from
// the site, the message goes out as Discord's JSON. Only what the event carries is shown (DESIGN-NOTES "Deviations").

export interface Character {
  guid: string;
  name?: string;
  classFile?: string;
  level?: number;
  ownerName?: string;
}

/** `index`: its place in the event's list, which names its card image on the site (BOT-05). */
export type Milestone = { index?: number } & (
  | { kind: "level" | "maxLevel"; character: Character; level?: number; from?: number }
  | { kind: "professionCap"; character: Character; skillLine?: number; profession?: string; rank?: number }
  | { kind: "newCharacter"; character: Character }
);

/**
 * The milestones the site draws a card image for (web BOT-API.md "Card images"): level 60, a new character at 60, a
 * profession at 300. Each gets its own embed with the image.
 */
export function hasCard(m: Milestone): boolean {
  return (
    m.kind === "maxLevel" ||
    (m.kind === "newCharacter" && (m.character.level ?? 0) >= 60) ||
    (m.kind === "professionCap" && (m.rank ?? 0) >= 300)
  );
}

/** The card image's file name for a milestone of an event (`cards/<name>` on the site). */
export function cardName(eventId: number, m: Milestone): string | undefined {
  return hasCard(m) && m.index !== undefined ? `milestone-${eventId}-${m.index}.png` : undefined;
}

export interface Embed {
  title?: string;
  url?: string;
  description?: string;
  color: number;
  /** BOT-05: the recap's cards, `inline` two or three to a row. */
  fields?: { name: string; value: string; inline?: boolean }[];
  /** BOT-05: a card image attached to the message (`attachment://<name>`). */
  image?: { url: string };
  /** BOT-04: the line above the title ("Nico on Ves Doombringer (39 Warlock)") and the small line under the embed. */
  author?: { name: string };
  footer?: { text: string };
}

/** A button (type 2) or, BOT-04, a select menu (type 3) in an action row. */
export interface Component {
  type: 2 | 3;
  style?: number;
  label?: string;
  custom_id?: string;
  url?: string;
  placeholder?: string;
  options?: { label: string; value: string; description?: string }[];
}

export interface MessageContent {
  /** BOT-04: text above the embeds, where mentions notify (the reminder, a new run). */
  content?: string;
  embeds: Embed[];
  /** Nothing is parsed; BOT-04 names the users and the role a message may notify. */
  allowed_mentions: { parse: never[]; users?: string[]; roles?: string[] };
  /** BOT-06: buttons under the message (Discord's action rows), e.g. Share; BOT-04 select menus too. */
  components?: { type: 1; components: Component[] }[];
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

/** Event id → message id for the bot's posts that carry a marker on a link to this site. */
export function markedEvents(siteUrl: string, messages: readonly PostedMessage[]): Map<number, string> {
  const pattern = new RegExp(`${escapeRegExp(siteUrl)}/[^\\s)#]*#e(\\d+)`, "g");
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

/** The milestones a post can show: those with a name. */
export function showable(milestones: readonly Milestone[]): Milestone[] {
  return milestones.filter((m) => m.character.name);
}

/** How long a post keeps taking the milestones of later uploads (BOT-09), counted from the post. */
export const GROUP_WINDOW_MS = 5 * 60_000;

/** Whether an upload's milestones join the open post: within the window and still within MAX_LINES. */
export function joinsPost(postedAt: number, shownInPost: number, adding: number, now: number): boolean {
  return now - postedAt < GROUP_WINDOW_MS && shownInPost + adding <= MAX_LINES;
}

export interface Group {
  eventId: number;
  milestones: readonly Milestone[];
}

/** One upload's milestones as one message, or undefined when none can be shown. */
export function milestoneMessage(
  eventId: number,
  milestones: readonly Milestone[],
  siteUrl: string,
  siteHost: string,
): MessageContent | undefined {
  return groupedMessage([{ eventId, milestones }], siteUrl, siteHost);
}

// Discord allows 10 embeds per message: at most 9 embeds with a card, the gold list is the 10th.
const MAX_LEVEL_EMBEDS = 9;

/** The card images a post of these groups shows: one per milestone with its own embed (fetched by the poster). */
export function milestoneFiles(groups: readonly Group[]): { name: string; path: string }[] {
  return groups
    .flatMap((g) => showable(g.milestones).map((m) => cardName(g.eventId, m)))
    .filter((name): name is string => name !== undefined)
    .slice(0, MAX_LEVEL_EMBEDS)
    .map((name) => ({ name, path: `cards/${name}` }));
}

/**
 * The milestones of one or more uploads as one message (BOT-09: later uploads are added by editing it). Each upload's
 * first character link carries its marker. Undefined when none can be shown.
 */
export function groupedMessage(
  groups: readonly Group[],
  siteUrl: string,
  siteHost: string,
  attached: readonly string[] = [],
): MessageContent | undefined {
  const all = groups.flatMap((g) => showable(g.milestones).map((milestone) => ({ eventId: g.eventId, milestone })));
  const shown = all.slice(0, MAX_LINES);
  const hidden = all.length - shown.length;
  if (shown.length === 0) return undefined;
  const marked = new Set<number>();
  const linkFor = (eventId: number) => (character: Character) => {
    const url = characterUrl(siteUrl, character.guid) + (marked.has(eventId) ? "" : marker(eventId));
    marked.add(eventId);
    return url;
  };

  const top = shown.filter((s) => hasCard(s.milestone)).slice(0, MAX_LEVEL_EMBEDS);
  const embeds: Embed[] = [];
  for (const { eventId, milestone } of top) {
    const link = linkFor(eventId);
    const card = cardName(eventId, milestone);
    embeds.push({
      ...(card !== undefined && attached.includes(card) ? { image: { url: `attachment://${card}` } } : {}),
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
    .filter((s) => !top.includes(s))
    .map(({ eventId, milestone }) => {
      const link = linkFor(eventId);
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

/** The admin's "Send a test post" (web WEB-39, BOT-API.md "test"): a short gold embed, marked like any post. */
export function testMessage(eventId: number, siteUrl: string, siteHost: string): MessageContent {
  return {
    embeds: [
      {
        title: "Test post",
        url: `${siteUrl}/discord${marker(eventId)}`,
        description: `Posts from ${siteHost} arrive in this channel. Sent from the site's Discord page.`,
        color: GOLD,
      },
    ],
    allowed_mentions: { parse: [] },
  };
}
