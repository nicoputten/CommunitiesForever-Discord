// Feat posts (BOT-14, board `bot-doomsday-feats`; before it milestone posts, BOT-03): every milestone is a feat (web
// WEB-56) and the post says "Feat unlocked". One message per upload, later uploads added by editing (BOT-09), one card
// image per post. Pure: the event comes in as read from the site, the message goes out as Discord's JSON. Only what
// the event carries is shown (DESIGN-NOTES "Deviations"); the words per kind are in core/feats.ts.

import { type Emojis, NO_EMOJI, icon } from "./emoji.js";
import { featLine, featSentence } from "./feats.js";
import { GOLD, type MessageContent, characterUrl, escapeMarkdown, marker } from "./message.js";

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
 * card image id (WEB-56); all optional, an older site sends none.
 */
export type Milestone = { index?: number; text?: string; firstInGroup?: boolean; card?: string } & (
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

/** The feats a post can show: those with a character name that the bot can word, or that carry the site's text. */
export function showable(milestones: readonly Milestone[]): Milestone[] {
  return milestones.filter((m) => m.character.name && (featLine(m) !== undefined || m.text !== undefined));
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

/** One upload's feats as one message, or undefined when none can be shown. */
export function milestoneMessage(
  eventId: number,
  milestones: readonly Milestone[],
  siteUrl: string,
  siteHost: string,
): MessageContent | undefined {
  return groupedMessage([{ eventId, milestones }], siteUrl, siteHost);
}

/** The card image a post of these groups shows (fetched by the poster): the first upload's, one per post. */
export function milestoneFiles(groups: readonly Group[]): { name: string; path: string }[] {
  const card = groups[0] !== undefined ? postCard(groups[0]) : undefined;
  return card === undefined ? [] : [{ name: card.name, path: `cards/${card.name}` }];
}

/**
 * The feats of one or more uploads as one message (BOT-09: later uploads are added by editing it): "Feat unlocked"
 * with a sentence, or "Feats unlocked · N" with a block per character and upload. Each upload's first character link
 * carries its marker. One card image, the first upload's; added uploads go without one (BOT-05). Undefined when none
 * can be shown.
 */
export function groupedMessage(
  groups: readonly Group[],
  siteUrl: string,
  siteHost: string,
  attached: readonly string[] = [],
  icons: Emojis = NO_EMOJI,
): MessageContent | undefined {
  const all = groups.flatMap((g) => showable(g.milestones).map((milestone) => ({ eventId: g.eventId, milestone })));
  const shown = all.slice(0, MAX_LINES);
  const hidden = all.length - shown.length;
  if (shown.length === 0) return undefined;
  const marked = new Set<number>();
  const link = (eventId: number, character: Character) => {
    const url = characterUrl(siteUrl, character.guid) + (marked.has(eventId) ? "" : marker(eventId));
    marked.add(eventId);
    return url;
  };
  const who = (eventId: number, character: Character) =>
    `${icon(icons, character.classFile)}**[${escapeMarkdown(character.name as string)}](${link(eventId, character)})**`;

  const card = groups[0] !== undefined ? postCard(groups[0]) : undefined;
  const image =
    card !== undefined && attached.includes(card.name) ? { image: { url: `attachment://${card.name}` } } : {};
  const color = card?.feat?.kind === "firstEpic" ? EPIC_PURPLE : GOLD;
  const badge = "**First in the group**";

  if (all.length === 1) {
    const { eventId, milestone } = shown[0] as (typeof shown)[number];
    const name = who(eventId, milestone.character);
    const sentence = featSentence(milestone, name) ?? `${escapeMarkdown(milestone.text as string)}\n${name}`;
    return {
      embeds: [
        {
          title: "Feat unlocked",
          description: [sentence, milestone.firstInGroup ? badge : undefined].filter(Boolean).join("\n"),
          color,
          ...image,
          footer: { text: `${siteHost} · feats` },
        },
      ],
      allowed_mentions: { parse: [] },
    };
  }

  // One block per character and upload, so every upload's marker is in the post.
  const blocks: { eventId: number; character: Character; lines: string[] }[] = [];
  for (const { eventId, milestone } of shown) {
    let block = blocks.find((x) => x.eventId === eventId && x.character.guid === milestone.character.guid);
    if (block === undefined) {
      block = { eventId, character: milestone.character, lines: [] };
      blocks.push(block);
    }
    const line = featLine(milestone) ?? escapeMarkdown(milestone.text as string);
    block.lines.push(`- ${line}${milestone.firstInGroup ? ` · ${badge}` : ""}`);
  }
  const text = blocks.map((x) =>
    [`${who(x.eventId, x.character)}${blocks.length === 1 ? " had a big upload." : ""}`, ...x.lines].join("\n"),
  );
  if (hidden > 0) text.push(`and ${hidden} more on ${siteHost}`);
  const oneUpload = groups.length === 1 ? `${all.length} feats from one upload · ` : "";
  return {
    embeds: [
      {
        title: `Feats unlocked · ${all.length}`,
        description: text.join("\n\n"),
        color,
        ...image,
        footer: { text: `${oneUpload}${siteHost} · feats` },
      },
    ],
    allowed_mentions: { parse: [] },
  };
}
