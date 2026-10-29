// The look-up commands' answers (BOT-06, board `bot-commands-runs`): the site's look-up data (web BOT-API.md
// "Look-ups") as embeds. Pure: the site's answer and "now" come in, Discord's JSON goes out. Full character names,
// display names for friends; names from players never become Discord markdown (escapeMarkdown). Discord can't colour
// text in an embed, so every character name is bold with its class written next to it (Nico, 2026-10-28).
import { type Emojis, NO_EMOJI, icon } from "./emoji.js";
import { CLASS_COLOURS, type Embed, GOLD, type MessageContent, characterUrl, escapeMarkdown } from "./message.js";
import { count, isObject, list, names, number, opt, text } from "./read.js";

export interface LookupCharacter {
  guid: string;
  name: string;
  owner?: string;
  classFile?: string;
  className?: string;
  race?: string;
  level?: number;
  role?: string;
  spec?: string;
  ilvl?: number;
  talents?: number[];
  professions: { name: string; rank: number; max?: number }[];
  seen?: { zone: string; at: number };
}

/** A character from the site, read defensively (CLAUDE.md rule 10); undefined without a GUID or name. */
export function readCharacter(value: unknown): LookupCharacter | undefined {
  if (!isObject(value)) return undefined;
  const guid = text(value.guid);
  const name = text(value.name);
  if (guid === undefined || name === undefined) return undefined;
  const c: LookupCharacter = {
    guid,
    name,
    professions: Array.isArray(value.professions)
      ? value.professions.flatMap((p) =>
          isObject(p) && text(p.name) && number(p.rank) !== undefined
            ? [
                {
                  name: text(p.name)!,
                  rank: number(p.rank)!,
                  ...(number(p.max) !== undefined ? { max: number(p.max)! } : {}),
                },
              ]
            : [],
        )
      : [],
  };
  for (const key of ["owner", "classFile", "className", "race", "role", "spec"] as const) {
    const v = text(value[key]);
    if (v !== undefined) c[key] = v;
  }
  for (const key of ["level", "ilvl"] as const) {
    const v = number(value[key]);
    if (v !== undefined) c[key] = v;
  }
  if (Array.isArray(value.talents) && value.talents.every((t) => typeof t === "number")) c.talents = value.talents;
  if (isObject(value.seen) && text(value.seen.zone) && number(value.seen.at) !== undefined) {
    c.seen = { zone: text(value.seen.zone)!, at: number(value.seen.at)! };
  }
  return c;
}

export function readCharacters(value: unknown): LookupCharacter[] {
  return Array.isArray(value) ? value.flatMap((c) => readCharacter(c) ?? []) : [];
}

/** A crafter of `whocancraft`: a character with its rank, the cap and whether it is the best. */
export type Crafter = LookupCharacter & { rank: number; max?: number; best?: boolean };

/** The look-up answers (web BOT-API.md "Look-ups"), read defensively; a missing body reads as empty. */
export function readWhereis(body: unknown): { friend?: string; characters: LookupCharacter[]; card?: string } {
  const b = isObject(body) ? body : {};
  return { ...opt("friend", text(b.friend)), characters: readCharacters(b.characters), ...opt("card", text(b.card)) };
}

export function readWho(body: unknown): { total: number; characters: LookupCharacter[] } {
  const b = isObject(body) ? body : {};
  const characters = readCharacters(b.characters);
  return { total: count(b.total) ?? characters.length, characters };
}

export function readCrafters(body: unknown): { profession?: string; crafters: Crafter[] } {
  const b = isObject(body) ? body : {};
  const crafters = list(b.crafters).flatMap((c): Crafter[] => {
    const read = readCharacter(c);
    const rank = number(c.rank);
    if (read === undefined || rank === undefined) return [];
    return [{ ...read, rank, ...opt("max", number(c.max)), best: c.best === true }];
  });
  return { ...opt("profession", text(b.profession)), crafters };
}

/** `alts` and `me`; `week` only when all three numbers are there (`me` of a friend who shares their activity). */
export function readAlts(body: unknown): {
  friend?: string;
  characters: LookupCharacter[];
  week?: { levels: number; quests: number; runs: number };
} {
  const b = isObject(body) ? body : {};
  const w = isObject(b.week) ? b.week : {};
  const [levels, quests, runs] = [number(w.levels), number(w.quests), number(w.runs)];
  return {
    ...opt("friend", text(b.friend)),
    characters: readCharacters(b.characters),
    ...(levels !== undefined && quests !== undefined && runs !== undefined ? { week: { levels, quests, runs } } : {}),
  };
}

/** The asker's display name, for "Shared by …" (with a linked asker only). */
export function readAsker(body: unknown): string | undefined {
  return isObject(body) ? text(body.asker) : undefined;
}

/** `professions`: every profession anyone has. */
export function readProfessions(body: unknown): string[] {
  return isObject(body) ? names(body.professions) : [];
}

/** `names`: the autocomplete's choices. */
export function readNames(body: unknown): { name: string; value: string }[] {
  return list(isObject(body) ? body.names : undefined).flatMap((n) => {
    const name = typeof n.name === "string" ? n.name : undefined;
    const value = typeof n.value === "string" ? n.value : undefined;
    return name !== undefined && value !== undefined ? [{ name, value }] : [];
  });
}

/** How old a sighting is, short, as on the board: "now", "12 min", "5 h", "1 d". */
export function age(at: number, now: number): string {
  const s = Math.max(0, now - at);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return `${Math.floor(s / 86400)} d`;
}

const ROLE_NAMES: Record<string, string> = { tank: "Tank", heal: "Healer", dps: "Damage" };

function colour(classFile: string | undefined): number {
  return (classFile && CLASS_COLOURS[classFile]) || GOLD;
}

const bold = (name: string) => `**${escapeMarkdown(name)}**`;
const line = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(" · ");

function message(embed: Embed): MessageContent {
  return { embeds: [embed], allowed_mentions: { parse: [] } };
}

/** "Link your Discord first" (board `bot-commands-runs`), for `/me` without a link. */
export function notLinkedMessage(siteUrl: string, siteHost: string, siteName: string | undefined): MessageContent {
  return message({
    title: "Link your Discord first",
    description:
      `The bot only knows your characters once your Discord is linked${siteName ? ` to ${escapeMarkdown(siteName)}` : ""}. ` +
      `Sign in on the site with Battle.net and click **Link Discord**; it takes 20 seconds.\n[Link on ${siteHost} ↗](${siteUrl}/discord)`,
    color: 0xe08a4a,
  });
}

/** A look-up that found nothing, or a site that can't answer. */
export function nothingMessage(title: string, text: string): MessageContent {
  return message({ title, description: text, color: GOLD });
}

/** `/whereis`: the characters by last sighting, with the card image of the newest (attached as `card`). */
export function whereisMessage(
  title: string,
  chars: readonly LookupCharacter[],
  now: number,
  siteUrl: string,
  siteHost: string,
  card?: string,
  icons: Emojis = NO_EMOJI,
): MessageContent {
  const rows = chars.map((c) =>
    line(
      `${icon(icons, c.classFile)}${bold(c.name)} ${[c.level, c.className].filter((x) => x !== undefined).join(" ")}`.trim(),
      c.seen?.zone ?? "not seen yet",
      c.seen ? age(c.seen.at, now) : undefined,
    ),
  );
  return message({
    title: escapeMarkdown(title),
    description: `${rows.join("\n")}\n-# Seen by the addon · [${siteHost}/map ↗](${siteUrl}/)`,
    color: colour(chars[0]?.classFile),
    ...(card !== undefined ? { image: { url: `attachment://${card}` } } : {}),
  });
}

/** `/who`: matching characters, with the filters as the title ("2 healers between 30 and 40"). */
export function whoMessage(
  total: number,
  chars: readonly LookupCharacter[],
  filter: { level?: string; role?: string; className?: string; recent?: boolean },
  now: number,
  icons: Emojis = NO_EMOJI,
): MessageContent {
  const noun =
    { tank: ["tank", "tanks"], healer: ["healer", "healers"], damage: ["damage dealer", "damage dealers"] }[
      filter.role ?? ""
    ] ?? (filter.className ? [filter.className, `${filter.className}s`] : ["character", "characters"]);
  const range = filter.level?.includes("-")
    ? `between ${filter.level.replace(/\s*-\s*/, " and ")}`
    : filter.level
      ? `at level ${filter.level}`
      : "";
  const title = [`${total} ${total === 1 ? noun[0] : noun[1]}`, range, filter.recent ? "seen today" : ""]
    .filter(Boolean)
    .join(" ");
  const rows = chars.map((c) =>
    line(
      `${icon(icons, c.classFile)}${bold(c.name)} ${[c.level, c.className].filter((x) => x !== undefined).join(" ")}`,
      c.owner ? escapeMarkdown(c.owner) : undefined,
      c.seen ? age(c.seen.at, now) : undefined,
    ),
  );
  if (total > chars.length) rows.push(`and ${total - chars.length} more`);
  return message({ title, description: rows.join("\n") || "Nobody matches.", color: GOLD });
}

/** Covered ≥ 225, thin 175–224, gap below (the site's professions page, DESIGN.md §8). */
export function coverage(best: number | undefined): string {
  if (best === undefined || best < 175) return "gap";
  return best >= 225 ? "covered" : "thin";
}

/** `/whocancraft`: everyone with the profession, best first, the best starred. */
export function craftMessage(
  profession: string,
  crafters: readonly Crafter[],
  icons: Emojis = NO_EMOJI,
): MessageContent {
  const rows = crafters.map((c) =>
    line(
      `${c.best ? "★ " : ""}${icon(icons, c.classFile)}${bold(c.name)} ${c.rank}${c.max !== undefined ? ` / ${c.max}` : ""}`,
      c.className,
      c.owner ? escapeMarkdown(c.owner) : undefined,
    ),
  );
  return message({
    title: `${escapeMarkdown(profession)} · ${coverage(crafters[0]?.rank)}`,
    description: rows.join("\n") || "Nobody has it yet.",
    color: GOLD,
  });
}

/** `/character`: the character card. */
export function characterMessage(
  c: LookupCharacter,
  now: number,
  siteUrl: string,
  icons: Emojis = NO_EMOJI,
): MessageContent {
  const fields = [
    { name: "Item level", value: c.ilvl !== undefined ? String(c.ilvl) : "—", inline: true },
    { name: "Talents", value: c.talents ? c.talents.join("/") : "—", inline: true },
    { name: "Seen", value: c.seen ? `${escapeMarkdown(c.seen.zone)} · ${age(c.seen.at, now)}` : "—", inline: true },
  ];
  const profs = c.professions.map((p) => `${escapeMarkdown(p.name)} ${p.rank}`).join(" · ");
  return message({
    title: escapeMarkdown(c.name),
    url: characterUrl(siteUrl, c.guid),
    description: [
      line(
        `${icon(icons, c.classFile)}${[c.level, c.race, c.className].filter((x) => x !== undefined).join(" ")}`,
        c.spec ? escapeMarkdown(c.spec) : undefined,
        c.owner ? escapeMarkdown(c.owner) : undefined,
      ),
      profs,
    ]
      .filter(Boolean)
      .join("\n"),
    fields,
    color: colour(c.classFile),
  });
}

/** `/alts` and `/me`: a friend's characters; `/me` adds the week line. */
export function altsMessage(
  friend: string,
  chars: readonly LookupCharacter[],
  now: number,
  week?: { levels: number; quests: number; runs: number },
  icons: Emojis = NO_EMOJI,
): MessageContent {
  const rows = chars.map((c) =>
    line(
      `${icon(icons, c.classFile)}${bold(c.name)} ${[c.level, c.className].filter((x) => x !== undefined).join(" ")}`,
      c.role ? ROLE_NAMES[c.role] : undefined,
      c.seen ? age(c.seen.at, now) : undefined,
    ),
  );
  const weekLine = week
    ? `\n**This week:** +${week.levels} ${week.levels === 1 ? "level" : "levels"} · ${week.quests} ${week.quests === 1 ? "quest" : "quests"} · ${week.runs} dungeon ${week.runs === 1 ? "run" : "runs"}`
    : "";
  return message({
    title: `${escapeMarkdown(friend)} · ${chars.length} ${chars.length === 1 ? "character" : "characters"}`,
    description: (rows.join("\n") || "No characters yet.") + weekLine,
    color: GOLD,
  });
}

/** The shared copy of an answer (Share): the same embeds, "Shared by <display name>" under the last one. */
export function sharedMessage(content: MessageContent, asker: string | undefined): MessageContent {
  if (asker === undefined) return content;
  const embeds = content.embeds.map((e, i) =>
    i === content.embeds.length - 1
      ? { ...e, description: `${e.description ?? ""}\n-# Shared by ${escapeMarkdown(asker)}`.trim() }
      : e,
  );
  return { ...content, embeds };
}
