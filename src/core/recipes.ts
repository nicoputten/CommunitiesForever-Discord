// Recipes (BOT-25, board `bot-recipes` = RC08; web BOT-API.md "Recipes", web WEB-93): the rare-find post and the
// `/craft` answers. Pure: the site's data comes in, Discord's JSON goes out. The site decides what is a rare find and
// who can craft what (CLAUDE.md rule 2); the bot words it. Names only (rule 5); names from players and the game never
// become Discord markdown.
import {
  type Embed,
  type FileSource,
  GOLD,
  type MessageContent,
  characterUrl,
  classIconFile,
  escapeMarkdown,
  marker,
} from "./message.js";
import { isObject, number, opt, text } from "./read.js";

export interface RecipeItem {
  name: string;
  quality: number;
  /** `#rrggbb`. */
  qualityColor?: string;
  /** The icon's path on the site (open without a token, web WEB-91). */
  iconPath?: string;
}

export interface RecipeSource {
  kind: string;
  place?: string;
  npc?: string;
  quest?: string;
  faction?: string;
  rank?: string;
}

export interface RecipeFind {
  recipeId: number;
  item: RecipeItem;
  profession?: { name: string; skill?: number };
  sources: RecipeSource[];
  /** The recipe's drawer on the site, a path. */
  url?: string;
}

export interface RecipeFinds {
  character: { guid: string; name: string; classFile?: string };
  finds: RecipeFind[];
  color?: string;
}

export type Difficulty = "orange" | "yellow" | "green" | "grey";

export interface Craft {
  item: RecipeItem;
  profession?: string;
  /** The skill to learn it (RC08's "Tailoring 300"). */
  skill?: number;
  crafters: { name: string; difficulty?: Difficulty }[];
  reagents: { name: string; count: number }[];
  sources: RecipeSource[];
  url?: string;
}

/** The embed colour from `#rrggbb`; white without one (common quality). */
export function colour(hex: string | undefined): number {
  return hex !== undefined && /^#[0-9a-f]{6}$/i.test(hex) ? Number.parseInt(hex.slice(1), 16) : 0xffffff;
}

function readItem(value: unknown): RecipeItem | undefined {
  if (!isObject(value)) return undefined;
  const name = text(value.name);
  if (name === undefined) return undefined;
  const iconPath = text(value.iconPath);
  return {
    name,
    quality: number(value.quality) ?? 1,
    ...opt("qualityColor", text(value.qualityColor)),
    // Only the site's own icon route (web WEB-91): nothing else becomes a picture URL.
    ...(iconPath !== undefined && /^\/api\/item-icons\/[a-z0-9_-]+\.jpg$/.test(iconPath) ? { iconPath } : {}),
  };
}

function readSources(value: unknown): RecipeSource[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((s): RecipeSource[] => {
    if (!isObject(s) || text(s.kind) === undefined) return [];
    return [
      {
        kind: text(s.kind)!,
        ...opt("place", text(s.place)),
        ...opt("npc", text(s.npc)),
        ...opt("quest", text(s.quest)),
        ...opt("faction", text(s.faction)),
        ...opt("rank", text(s.rank)),
      },
    ];
  });
}

/** A path on the site: only `/` followed by a plain path and query. */
function path(value: unknown): string | undefined {
  const p = text(value);
  return p !== undefined && /^\/[\w\-/]*(\?[\w=&-]*)?$/.test(p) ? p : undefined;
}

/** The `recipeFinds` event's data (web BOT-API.md "Event recipeFinds"); undefined without a character or a find. */
export function readRecipeFinds(data: unknown): RecipeFinds | undefined {
  if (!isObject(data) || !isObject(data.character)) return undefined;
  const guid = text(data.character.guid);
  const name = text(data.character.name);
  if (guid === undefined || name === undefined) return undefined;
  const finds = (Array.isArray(data.finds) ? data.finds : []).flatMap((f): RecipeFind[] => {
    if (!isObject(f)) return [];
    const item = readItem(f.item);
    const recipeId = number(f.recipeId);
    if (item === undefined || recipeId === undefined) return [];
    const profession =
      isObject(f.profession) && text(f.profession.name) !== undefined
        ? { name: text(f.profession.name)!, ...opt("skill", number(f.profession.skill)) }
        : undefined;
    return [
      {
        recipeId,
        item,
        sources: readSources(f.sources),
        ...opt("profession", profession),
        ...opt("url", path(f.url)),
      },
    ];
  });
  if (finds.length === 0) return undefined;
  return {
    character: { guid, name, ...opt("classFile", text(data.character.classFile)) },
    finds,
    ...opt("color", text(data.color)),
  };
}

const DIFFICULTIES = new Set(["orange", "yellow", "green", "grey"]);

/** The `craft` look-up's answer (web BOT-API.md "Look-ups craftable and craft"); undefined without an item. */
export function readCraft(body: unknown): Craft | undefined {
  if (!isObject(body)) return undefined;
  const item = readItem(body.item);
  if (item === undefined) return undefined;
  const recipe = isObject(body.recipe) ? body.recipe : {};
  const crafters = (Array.isArray(body.crafters) ? body.crafters : []).flatMap((c) => {
    if (!isObject(c) || text(c.name) === undefined) return [];
    const d = text(c.difficulty);
    return [
      { name: text(c.name)!, ...(d !== undefined && DIFFICULTIES.has(d) ? { difficulty: d as Difficulty } : {}) },
    ];
  });
  const reagents = (Array.isArray(body.reagents) ? body.reagents : []).flatMap((r) =>
    isObject(r) && text(r.name) !== undefined && number(r.count) !== undefined
      ? [{ name: text(r.name)!, count: number(r.count)! }]
      : [],
  );
  return {
    item,
    crafters,
    reagents,
    sources: readSources(body.sources),
    ...opt("profession", text(recipe.profession)),
    ...opt("skill", number(recipe.skill)),
    ...opt("url", path(body.url)),
  };
}

// --- words ------------------------------------------------------------------------------------------------------

const KIND_WORDS: Readonly<Record<string, string>> = {
  trainer: "Trainer",
  vendor: "Vendor",
  vendor_limited: "Vendor · Limited",
  drop: "Drop",
  rep: "Rep",
  quest: "Quest",
};

/**
 * Where a recipe is learned, as RC08 words it: "Drop · Blackrock Spire", "Rep · Thorium Brotherhood · Honored",
 * "Vendor · Limited". `short` leaves out the standing (a line in a list of finds).
 */
export function sourceText(s: RecipeSource, short = false): string {
  const where = s.kind === "rep" ? s.faction : s.kind === "quest" ? s.quest : (s.place ?? s.npc);
  return [KIND_WORDS[s.kind] ?? "Elsewhere", where, s.kind === "rep" && !short ? s.rank : undefined]
    .filter((x): x is string => x !== undefined && x !== "")
    .map(escapeMarkdown)
    .join(" · ");
}

/** Every source, one after another: "Rep · Thorium Brotherhood · Honored · Drop · Molten Core". */
function sourcesText(sources: readonly RecipeSource[], short = false): string | undefined {
  const words = [...new Set(sources.map((s) => sourceText(s, short)))];
  return words.length > 0 ? words.join(" · ") : undefined;
}

/**
 * The game's item quality names (the client's ITEM_QUALITY<n>_DESC: 0 Poor .. 6 Artifact). Nico (2026-11-07): the
 * quality as a word after the item's name, since Discord can't colour it; left out for Poor and Common, the plain
 * items, so only what stands out says so.
 */
const QUALITY_NAMES: readonly (string | undefined)[] = [
  undefined,
  undefined,
  "Uncommon",
  "Rare",
  "Epic",
  "Legendary",
  "Artifact",
];

/** "Robe of the Archmage — Epic" (escaped), for a title. */
export function itemName(item: RecipeItem): string {
  const quality = QUALITY_NAMES[item.quality];
  return quality !== undefined ? `${escapeMarkdown(item.name)} — ${quality}` : escapeMarkdown(item.name);
}

const DOTS: Readonly<Record<Difficulty, string>> = { orange: "🟠", yellow: "🟡", green: "🟢", grey: "⚪" };

/** How many crafters `/craft` names before "+N more" (RC08). */
export const CRAFTERS_SHOWN = 5;

function iconUrl(siteUrl: string, item: RecipeItem): string | undefined {
  return item.iconPath !== undefined ? `${siteUrl}${item.iconPath}` : undefined;
}

// --- the rare-find post -------------------------------------------------------------------------------------------

/** The class icon the post's author line attaches (BOT-20: an attached picture, not our emoji). */
export function recipeFindsFiles(finds: RecipeFinds): FileSource[] {
  const icon = classIconFile(finds.character.classFile);
  return icon !== undefined ? [icon] : [];
}

/**
 * RC08's rare-find post: one embed, the author line "Mira Sunstrider learned a rare recipe" (with the class icon),
 * the colour bar in the best item's quality. One find: the item as title (linked to its recipe), the profession with
 * the character's skill and "Learned from" as fields, the item's icon as thumbnail. Two or more: "learned N rare
 * recipes" and one line per recipe, the best item's icon. Marked with the event (rule 9) on the title link.
 */
export function recipeFindsMessage(
  data: RecipeFinds,
  eventId: number,
  siteUrl: string,
  attached: readonly string[] = [],
): MessageContent {
  const icon = recipeFindsFiles(data)[0];
  const n = data.finds.length;
  const who = data.character.name;
  const author: NonNullable<Embed["author"]> = {
    name: n === 1 ? `${who} learned a rare recipe` : `${who} learned ${n} rare recipes`,
    ...(icon !== undefined && attached.includes(icon.name) ? { icon_url: `attachment://${icon.name}` } : {}),
  };
  const first = data.finds[0]!;
  const link = (f: RecipeFind) =>
    `${siteUrl}${f.url ?? characterUrl("", data.character.guid)}${f === first ? marker(eventId) : ""}`;
  const thumb = iconUrl(siteUrl, first.item);
  const embed: Embed = {
    author,
    color: colour(data.color ?? first.item.qualityColor),
    ...(thumb !== undefined ? { thumbnail: { url: thumb } } : {}),
  };
  if (n === 1) {
    embed.title = itemName(first.item);
    embed.url = link(first);
    const fields = [];
    if (first.profession !== undefined) {
      fields.push({
        name: escapeMarkdown(first.profession.name),
        value: first.profession.skill !== undefined ? String(first.profession.skill) : "—",
        inline: true,
      });
    }
    const from = sourcesText(first.sources);
    if (from !== undefined) fields.push({ name: "Learned from", value: from, inline: true });
    if (fields.length > 0) embed.fields = fields;
  } else {
    // The marker rides on the first line's link; the title stays the author line's.
    embed.description = data.finds
      .map((f) => {
        const from = sourcesText(f.sources, true);
        const quality = QUALITY_NAMES[f.item.quality];
        return `[**${escapeMarkdown(f.item.name)}**](${link(f)})${quality !== undefined ? ` — ${quality}` : ""}${
          from !== undefined ? ` · ${from}` : ""
        }`;
      })
      .join("\n");
  }
  return { embeds: [embed], allowed_mentions: { parse: [] } };
}

// --- /craft ---------------------------------------------------------------------------------------------------------

/**
 * `/craft`'s card (RC08): the item as title in its quality's colour bar, "Tailoring 300", "Can make it" (up to 5
 * crafters with their dot, then "+N more" linked to the recipe), the reagents on one line and "Open the recipe ›".
 * Nobody knows it: "Nobody can make it yet." and "Learn from". Discord can't colour the title (DESIGN-NOTES).
 */
export function craftCard(craft: Craft, siteUrl: string): MessageContent {
  const url = craft.url !== undefined ? `${siteUrl}${craft.url}` : undefined;
  const thumb = iconUrl(siteUrl, craft.item);
  const embed: Embed = {
    title: itemName(craft.item),
    ...(url !== undefined ? { url } : {}),
    color: colour(craft.item.qualityColor),
    ...(thumb !== undefined ? { thumbnail: { url: thumb } } : {}),
  };
  if (craft.crafters.length === 0) {
    embed.description = "Nobody can make it yet.";
    const from = sourcesText(craft.sources);
    if (from !== undefined) embed.fields = [{ name: "Learn from", value: from }];
    return { embeds: [embed], allowed_mentions: { parse: [] } };
  }
  if (craft.profession !== undefined) {
    embed.description = [escapeMarkdown(craft.profession), craft.skill].filter((x) => x !== undefined).join(" ");
  }
  const shown = craft.crafters.slice(0, CRAFTERS_SHOWN).map((c) => {
    const dot = c.difficulty !== undefined ? `${DOTS[c.difficulty]} ` : "";
    return `${dot}${escapeMarkdown(c.name)}`;
  });
  const more = craft.crafters.length - CRAFTERS_SHOWN;
  if (more > 0) shown.push(url !== undefined ? `[+${more} more](${url})` : `+${more} more`);
  const fields = [{ name: "Can make it", value: shown.join("\n") }];
  if (craft.reagents.length > 0) {
    fields.push({
      name: "Reagents",
      value: craft.reagents.map((r) => `${r.count} × ${escapeMarkdown(r.name)}`).join(" · "),
    });
  }
  if (url !== undefined) fields.push({ name: "​", value: `[Open the recipe ›](${url})` });
  embed.fields = fields;
  return { embeds: [embed], allowed_mentions: { parse: [] } };
}

/** `/craft` for something no recipe makes (RC08). */
export function noRecipeMessage(): MessageContent {
  return { embeds: [{ description: "No recipe makes that.", color: GOLD }], allowed_mentions: { parse: [] } };
}
