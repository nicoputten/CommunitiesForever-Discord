// Feat wording (BOT-14, board `bot-doomsday-feats`): every milestone is a feat (web WEB-56). Pure. Each kind the bot
// knows has two forms: the sentence of a post with one feat ("**Ada Nightshade** is now a **Stone Guard**, a.k.a.
// **Mailbox Menace**.") and the short line under a character in a post with several ("**Stone Guard**, a.k.a.
// **Mailbox Menace** · rank 6"). Words only: which feats exist, "First in the group" and the card are the site's
// (CLAUDE.md rule 2). A kind the bot doesn't know is posted with the site's `text` (Nico, 2026-10-28).
import { className, escapeMarkdown } from "./message.js";
import type { Milestone } from "./milestones.js";

/** 1000 → "1,000", the same on every machine. */
export function thousands(n: number): string {
  return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** 1 → "1st", 3 → "3rd", 11 → "11th". */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

function article(word: string): string {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

const b = (text: string) => `**${escapeMarkdown(text)}**`;

/** Ranks below this have no card image on the site; the post says so (board `bot-doomsday-feats`). */
export const FIRST_CARD_RANK = 6;

/** The watch list's items (CF-53 `notable`): the sentence and the short line, given the item's bold name. */
const NOTABLE: Readonly<Record<string, { sentence(item?: string): string; line(item?: string): string }>> = {
  arcaniteReaper: {
    sentence: (item) => `made ${item ? `an ${item}` : `an ${b("Arcanite Reaper")}`}.`,
    line: () => "Arcanite Reaper made",
  },
  arcaniteTransmute: {
    sentence: () => `did a first Arcanite transmute.`,
    line: () => "First Arcanite transmute",
  },
  mooncloth: { sentence: () => `made a first ${b("Mooncloth")}.`, line: () => "First Mooncloth" },
  devilsaur: {
    sentence: (item) => `made ${item ?? "a Devilsaur piece"}.`,
    line: (item) => `Devilsaur set${item ? ` · ${item}` : ""}`,
  },
  extravaganzaJoined: {
    sentence: () => "joined the Stranglethorn Fishing Extravaganza.",
    line: () => "Joined the Fishing Extravaganza",
  },
  extravaganzaWon: {
    sentence: (item) => `won the Stranglethorn Fishing Extravaganza${item ? `: ${item}` : ""}.`,
    line: (item) => `Won the Fishing Extravaganza${item ? ` · ${item}` : ""}`,
  },
};

/**
 * What a feat says after the character's name in a post of one feat (with a capital where it starts the line), or
 * undefined when the bot can't word it (then the site's `text` is used). `who` is the character's name as markdown.
 */
export function featSentence(m: Milestone, who: string): string | undefined {
  switch (m.kind) {
    case "maxLevel":
      return `${who} reached level ${m.level ?? 60}.`;
    case "level":
      return m.level ? `${who} hit level ${m.level}.` : `${who} levelled up.`;
    case "professionCap": {
      const what = `${m.profession ? escapeMarkdown(m.profession) : "a profession"}${m.rank ? ` at ${m.rank}` : ""}`;
      return m.title ? `${who} is now ${article(m.title)} ${b(m.title)}: maxed ${what}.` : `${who} maxed ${what}.`;
    }
    case "newCharacter": {
      const about = [
        m.character.level !== undefined ? `level ${m.character.level}` : undefined,
        className(m.character.classFile),
      ]
        .filter(Boolean)
        .join(" ");
      return `New character: ${who}${about ? `, ${about}` : ""}.`;
    }
    case "honorKills":
      if (m.kills === undefined) return undefined;
      return m.kills <= 1 ? `First blood: ${who}.` : `${who} reached ${b(thousands(m.kills))} honorable kills.`;
    case "pvpRank": {
      if (m.rank === undefined) return undefined;
      const rank = m.rankName ? b(m.rankName) : `rank ${m.rank}`;
      const aka = m.title ? `, a.k.a. ${b(m.title)}` : "";
      const keepGoing = m.rank < FIRST_CARD_RANK ? ` Cards start at rank ${FIRST_CARD_RANK}, keep going.` : "";
      return m.rankName
        ? `${who} is now ${article(m.rankName)} ${rank}${aka}.${keepGoing}`
        : `${who} reached ${rank}${aka}.${keepGoing}`;
    }
    case "duelWins":
      return m.wins === undefined ? undefined : `${who} won ${b(thousands(m.wins))} duels.`;
    case "bgFirstWin":
      return m.battleground ? `${who} won ${b(m.battleground)} for the first time.` : undefined;
    case "deaths100":
      return `${who} died ${thousands(m.deaths ?? 100)} times. A spirit healer's best friend.`;
    case "firstEpic":
      return m.item?.name ? `First epic for ${who}: ${epic(m.item)}.` : undefined;
    case "mount":
    case "epicMount": {
      const what = m.kind === "mount" ? "a mount" : "an epic mount";
      const at = m.level !== undefined ? ` at level ${m.level}` : "";
      return `${who} got ${what}${at}${m.place !== undefined ? `, ${place(m)}` : ""}.`;
    }
    case "firstCatch":
      return `${who} caught a first fish.`;
    case "jackOfAllTrades":
      return `${who} is a ${b("Jack of all trades")}${m.professions.length > 0 ? `: ${list(m.professions)} at 300` : ""}.`;
    case "notableItem": {
      const words = m.notable !== undefined ? NOTABLE[m.notable] : undefined;
      const item = m.item?.name ? b(m.item.name) : undefined;
      if (words !== undefined) return `${who} ${words.sentence(item)}`;
      return item ? `${who} got ${item}.` : undefined;
    }
    case "other":
      return undefined;
  }
}

/** A feat as a short line under its character (board `bot-doomsday-feats`, several feats), or undefined. */
export function featLine(m: Milestone): string | undefined {
  switch (m.kind) {
    case "maxLevel":
      return `Level ${m.level ?? 60}`;
    case "level":
      return m.level ? `Level ${m.level}` : "Levelled up";
    case "professionCap": {
      const what = [m.profession ? escapeMarkdown(m.profession) : "A profession", m.rank].filter(Boolean).join(" ");
      return m.title ? `${b(m.title)} · ${what}` : `${what}, maxed`;
    }
    case "newCharacter": {
      const about = [
        m.character.level !== undefined ? `level ${m.character.level}` : undefined,
        className(m.character.classFile),
      ]
        .filter(Boolean)
        .join(" ");
      return `New character${about ? ` · ${about}` : ""}`;
    }
    case "honorKills":
      if (m.kills === undefined) return undefined;
      return m.kills <= 1 ? "First blood" : `${thousands(m.kills)} honorable kills`;
    case "pvpRank":
      if (m.rank === undefined) return undefined;
      return [m.rankName ? b(m.rankName) : `Rank ${m.rank}`, m.title ? `a.k.a. ${b(m.title)}` : undefined]
        .filter(Boolean)
        .join(", ")
        .concat(m.rankName ? ` · rank ${m.rank}` : "");
    case "duelWins":
      return m.wins === undefined ? undefined : `${thousands(m.wins)} duel wins`;
    case "bgFirstWin":
      return m.battleground ? `First win in ${escapeMarkdown(m.battleground)}` : undefined;
    case "deaths100":
      return `${thousands(m.deaths ?? 100)} deaths · a spirit healer's best friend`;
    case "firstEpic":
      return m.item?.name ? `**First epic:** ${epic(m.item)}` : undefined;
    case "mount":
    case "epicMount": {
      const parts = [
        m.kind === "mount" ? "Mount" : "Epic mount",
        m.riding !== undefined ? `riding ${m.riding}` : undefined,
        m.place !== undefined ? place(m) : undefined,
      ];
      return parts.filter(Boolean).join(" · ");
    }
    case "firstCatch":
      return "First catch";
    case "jackOfAllTrades":
      return `${b("Jack of all trades")}${m.professions.length > 0 ? ` · ${list(m.professions)} at 300` : ""}`;
    case "notableItem": {
      const words = m.notable !== undefined ? NOTABLE[m.notable] : undefined;
      const item = m.item?.name ? b(m.item.name) : undefined;
      if (words !== undefined) return words.line(item);
      return item;
    }
    case "other":
      return undefined;
  }
}

/** The epic item in bold (Discord can't colour it purple, DESIGN-NOTES "Deviations"), its slot and the level. */
function epic(item: NonNullable<Extract<Milestone, { kind: "firstEpic" }>["item"]>): string {
  return [
    b(item.name as string),
    item.slot ? escapeMarkdown(item.slot.toLowerCase()) : undefined,
    item.level !== undefined ? `looted at level ${item.level}` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** "the 3rd mount in the group" (board `bot-doomsday-feats`); "the first epic mount in the group". */
function place(m: Extract<Milestone, { kind: "mount" | "epicMount" }>): string {
  const what = m.kind === "mount" ? "mount" : "epic mount";
  const n = m.place ?? 1;
  return `the ${n <= 1 ? "first" : ordinal(n)} ${what} in the group`;
}

function list(names: readonly string[]): string {
  const escaped = names.map(escapeMarkdown);
  return escaped.length <= 1 ? escaped.join("") : `${escaped.slice(0, -1).join(", ")} and ${escaped.at(-1)}`;
}
