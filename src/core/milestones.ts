// Feat posts (BOT-14, BOT-20; boards `bot-doomsday-feats`, `bot-visual-feats`; before them milestone posts, BOT-03):
// every milestone is a feat (web WEB-56) and the post says "Feat unlocked". One message per upload, later uploads added
// by editing (BOT-09), one card image per post, the site's (big or strip, web WEB-66). The post starts with the
// character; new characters aren't feats but one line. Pure: the event comes in as read from the site, the message
// goes out as Discord's JSON. The site's `headline` and `line` when it sends them (WEB-66), else the bot's own words
// per kind (core/feats.ts).

import { type Emojis, NO_EMOJI, icon } from "./emoji.js";
import { featLine, featSentence } from "./feats.js";
import {
  CLASS_COLOURS,
  type Embed,
  type FileSource,
  GOLD,
  type MessageContent,
  characterUrl,
  classIconFile,
  escapeMarkdown,
  marker,
} from "./message.js";

export interface Character {
  guid: string;
  name?: string;
  classFile?: string;
  level?: number;
  ownerName?: string;
}

/** An item of a feat (web WEB-56): `slot` as text ("Two-Hand"), `level` the character's level when it was looted. */
export interface FeatItem {
  id?: number;
  name?: string;
  slot?: string;
  level?: number;
}

/**
 * `index`: its place in the event's list. `text`: the site's finished line, `firstInGroup` its badge and `card` its
 * card image id (WEB-56); `headline` ("Stone Guard") and `line` (what happened) the site's words for the visual post
 * (WEB-66). All optional, an older site sends none.
 */
export type Milestone = {
  index?: number;
  text?: string;
  firstInGroup?: boolean;
  card?: string;
  headline?: string;
  line?: string;
} & (
  | { kind: "level" | "maxLevel"; character: Character; level?: number; from?: number }
  | {
      kind: "professionCap";
      character: Character;
      skillLine?: number;
      profession?: string;
      rank?: number;
      /** At 300: Cooking "Head Chef", First Aid "Field Medic", Fishing "Fish Whisperer". */
      title?: string;
    }
  | { kind: "newCharacter" | "firstCatch"; character: Character }
  | { kind: "honorKills"; character: Character; kills?: number }
  | { kind: "pvpRank"; character: Character; rank?: number; rankName?: string; title?: string }
  | { kind: "duelWins"; character: Character; wins?: number }
  | { kind: "bgFirstWin"; character: Character; battleground?: string }
  | { kind: "deaths100"; character: Character; deaths?: number }
  | { kind: "firstEpic"; character: Character; item?: FeatItem }
  | { kind: "mount" | "epicMount"; character: Character; riding?: number; level?: number; place?: number }
  | { kind: "jackOfAllTrades"; character: Character; professions: string[] }
  | { kind: "notableItem"; character: Character; notable?: string; item?: FeatItem }
  /** A kind this bot doesn't know, posted with the site's `text` (Nico, 2026-10-28). */
  | { kind: "other"; character: Character; text: string }
);

/** Before WEB-56 the site sent no `card`; it drew one for level 60, a new character at 60 and a profession at 300. */
function legacyCard(m: Milestone): boolean {
  return (
    m.kind === "maxLevel" ||
    (m.kind === "newCharacter" && (m.character.level ?? 0) >= 60) ||
    (m.kind === "professionCap" && (m.rank ?? 0) >= 300)
  );
}

const CARD_ID = /^[a-z0-9][a-z0-9-]{0,80}$/i;

/**
 * The one card image of an upload's post (`cards/<id>.png` on the site), with the feat it shows: the event's `card`
 * (the most special feat's, WEB-56), else the first feat with a card, else (an older site) the first that had one.
 */
export function postCard(group: Group): { name: string; feat?: Milestone } | undefined {
  const feats = showable(group.milestones);
  const id =
    group.card ??
    feats.find((m) => m.card !== undefined)?.card ??
    feats
      .filter((m) => m.card === undefined && legacyCard(m) && m.index !== undefined)
      .map((m) => `milestone-${group.eventId}-${m.index}`)[0];
  if (id === undefined || !CARD_ID.test(id)) return undefined;
  const feat = feats.find((m) => m.card === id) ?? feats.find((m) => `milestone-${group.eventId}-${m.index}` === id);
  return { name: `${id}.png`, ...(feat !== undefined ? { feat } : {}) };
}

/** The border of a post whose card is a first epic (board `bot-doomsday-feats`, the epic purple). */
export const EPIC_PURPLE = 0xc27bff;

/** At most this many milestones in one message; the rest is "and N more" (Discord limits embed length). */
export const MAX_LINES = 10;

/**
 * The feats a post can show: those with a character name that the bot can word, or that carry the site's words. New
 * characters count too (they become the "+N new characters" line).
 */
export function showable(milestones: readonly Milestone[]): Milestone[] {
  return milestones.filter(
    (m) => m.character.name && (featLine(m) !== undefined || m.text !== undefined || m.headline !== undefined),
  );
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
  /** The event's card image id (WEB-56): the most special feat's. */
  card?: string;
}

/**
 * The files a post of these groups attaches (fetched by the poster): the first upload's card, and for a post about one
 * character its class icon for the author line (BOT-20).
 */
export function milestoneFiles(groups: readonly Group[]): FileSource[] {
  const card = groups[0] !== undefined ? postCard(groups[0]) : undefined;
  const files: FileSource[] = card === undefined ? [] : [{ name: card.name, path: `cards/${card.name}` }];
  const feats = groups.flatMap((g) => showable(g.milestones)).filter((m) => m.kind !== "newCharacter");
  const one = feats[0]?.character;
  const icon =
    one !== undefined && feats.every((m) => m.character.guid === one.guid) ? classIconFile(one.classFile) : undefined;
  if (icon !== undefined) files.push(icon);
  return files;
}

/** "Stone Guard": the site's headline, else the bot's short line (core/feats.ts), else the site's text. */
function headlineOf(m: Milestone): string {
  return m.headline !== undefined ? escapeMarkdown(m.headline) : (featLine(m) ?? escapeMarkdown(m.text as string));
}

/**
 * The feats of one or more uploads as one message (BOT-09: later uploads are added by editing it; BOT-20, board
 * `bot-visual-feats`). It starts with the character: for one character the author line (its class icon when attached)
 * and the bar in its class colour. One feat: "Feat unlocked · <headline>" and what happened. Several: "Feats unlocked ·
 * N" and the list grouped by character. New characters: one line "+3 new characters: …". One card image, the first
 * upload's; added uploads go without one. Each upload's first character link carries its marker. Undefined when
 * nothing can be shown.
 */
export function groupedMessage(
  groups: readonly Group[],
  siteUrl: string,
  siteHost: string,
  attached: readonly string[] = [],
  icons: Emojis = NO_EMOJI,
): MessageContent | undefined {
  const all = groups.flatMap((g) => showable(g.milestones).map((milestone) => ({ eventId: g.eventId, milestone })));
  const feats = all.filter((x) => x.milestone.kind !== "newCharacter").slice(0, MAX_LINES);
  const newcomers = all.filter((x) => x.milestone.kind === "newCharacter");
  const hidden = all.filter((x) => x.milestone.kind !== "newCharacter").length - feats.length;
  if (feats.length === 0 && newcomers.length === 0) return undefined;
  const marked = new Set<number>();
  const link = (eventId: number, character: Character) => {
    const url = characterUrl(siteUrl, character.guid) + (marked.has(eventId) ? "" : marker(eventId));
    marked.add(eventId);
    return url;
  };
  const name = (c: Character) => escapeMarkdown(c.name as string);
  const who = (eventId: number, c: Character) => `${icon(icons, c.classFile)}**[${name(c)}](${link(eventId, c)})**`;

  const card = groups[0] !== undefined ? postCard(groups[0]) : undefined;
  const image =
    card !== undefined && attached.includes(card.name) ? { image: { url: `attachment://${card.name}` } } : {};
  const badge = "**First in the group**";
  const newLine = (): string | undefined => {
    if (newcomers.length === 0) return undefined;
    const list = newcomers.map(({ eventId, milestone: m }) => {
      const level = m.character.level !== undefined ? ` ${m.character.level}` : "";
      return `[${name(m.character)}](${link(eventId, m.character)})${level}`;
    });
    return `+${newcomers.length} new ${newcomers.length === 1 ? "character" : "characters"}: ${list.join(", ")}`;
  };

  const one = feats[0]?.milestone.character;
  const oneCharacter = one !== undefined && feats.every((x) => x.milestone.character.guid === one.guid);
  const iconFile = oneCharacter ? classIconFile(one.classFile) : undefined;
  const author: Pick<Embed, "author"> =
    oneCharacter && feats.length === 1
      ? {
          author: {
            name: one.name as string,
            ...(iconFile !== undefined && attached.includes(iconFile.name)
              ? { icon_url: `attachment://${iconFile.name}` }
              : {}),
          },
        }
      : {};
  const color = oneCharacter
    ? (one.classFile && CLASS_COLOURS[one.classFile]) || GOLD
    : card?.feat?.kind === "firstEpic"
      ? EPIC_PURPLE
      : GOLD;

  if (feats.length === 1 && newcomers.length === 0) {
    const { eventId, milestone } = feats[0] as (typeof feats)[number];
    const url = link(eventId, milestone.character);
    // The site's words (WEB-66), else the bot's sentence with the "First in the group" line.
    const text =
      milestone.line !== undefined
        ? escapeMarkdown(milestone.line)
        : [
            featSentence(milestone, `**${name(milestone.character)}**`) ?? escapeMarkdown(milestone.text as string),
            milestone.firstInGroup ? badge : undefined,
          ]
            .filter(Boolean)
            .join("\n");
    return {
      embeds: [
        {
          ...author,
          title:
            milestone.headline !== undefined
              ? `Feat unlocked · ${escapeMarkdown(milestone.headline)}`
              : "Feat unlocked",
          url,
          description: text,
          color,
          ...image,
        },
      ],
      allowed_mentions: { parse: [] },
    };
  }

  // One block per character and upload, so every upload's marker is in the post.
  const blocks: { eventId: number; character: Character; lines: string[] }[] = [];
  for (const { eventId, milestone } of feats) {
    let block = blocks.find((x) => x.eventId === eventId && x.character.guid === milestone.character.guid);
    if (block === undefined) {
      block = { eventId, character: milestone.character, lines: [] };
      blocks.push(block);
    }
    block.lines.push(`- ${headlineOf(milestone)}${milestone.firstInGroup ? ` · ${badge}` : ""}`);
  }
  const text = blocks.map((x) => [who(x.eventId, x.character), ...x.lines].join("\n"));
  if (hidden > 0) text.push(`and ${hidden} more on ${siteHost}`);
  const added = newLine();
  if (added !== undefined) text.push(added);
  const count = feats.length + hidden;
  return {
    embeds: [
      {
        ...(count > 0 ? { title: `Feats unlocked · ${count}` } : {}),
        description: text.join("\n\n"),
        color,
        ...image,
        ...(groups.length === 1 && count > 1 ? { footer: { text: `${count} feats from one upload` } } : {}),
      },
    ],
    allowed_mentions: { parse: [] },
  };
}
