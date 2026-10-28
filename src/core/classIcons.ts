// Class icons (BOT-11): Discord can't colour text in an embed, so a class icon stands before every character name
// ("[icon] **Mira Sunstrider** · Mage"). The icons are the bot's own application emoji, uploaded by the bot at start
// from `assets/class-icons/` (Claude Design). Each emoji's name carries a short hash of its picture
// (`cf_mage_3fa9c1`, Nico 2026-10-28), so a changed icon is uploaded again and an unchanged one never. Pure: the
// pictures' hashes and Discord's list come in as arguments.

/** The classes with an icon: the class file (as the site sends it) and the icon's file name. */
export const CLASS_ICONS: readonly { classFile: string; file: string }[] = [
  { classFile: "WARRIOR", file: "warrior.png" },
  { classFile: "PALADIN", file: "paladin.png" },
  { classFile: "HUNTER", file: "hunter.png" },
  { classFile: "ROGUE", file: "rogue.png" },
  { classFile: "PRIEST", file: "priest.png" },
  { classFile: "SHAMAN", file: "shaman.png" },
  { classFile: "MAGE", file: "mage.png" },
  { classFile: "WARLOCK", file: "warlock.png" },
  { classFile: "DRUID", file: "druid.png" },
];

/**
 * BOT-15: the Doomsday board's goal boxes, synced the same way (Nico, 2026-10-28): a PvE goal done (green), a PvP goal
 * done (red) and an open one. Keyed like a class, so `icons.BOX_PVE` is its markup.
 */
export const BOX_ICONS: readonly { classFile: string; file: string }[] = [
  { classFile: "BOX_PVE", file: "box-pve.png" },
  { classFile: "BOX_PVP", file: "box-pvp.png" },
  { classFile: "BOX_OPEN", file: "box-open.png" },
];

/**
 * BOT-14: the recap card icons (board `bot-recap-v2-icons`), in `assets/recap-icons/` (the path is relative to the
 * class icons' folder). Keyed like a class: `icons.RECAP_PVP`.
 */
export const RECAP_ICONS: readonly { classFile: string; file: string }[] = [
  "pvp",
  "deaths",
  "fall",
  "fire",
  "epic",
  "mount",
  "night_owl",
  "early_bird",
  "battleground",
  "marathon",
  "untouchable",
  "group",
].map((name) => ({ classFile: `RECAP_${name.toUpperCase()}`, file: `../recap-icons/recap_${name}.png` }));

/**
 * The recap card ids (web WEB-57) with an icon, as board `bot-recap-v2-icons` maps them; a card not listed shows none.
 */
export const RECAP_CARD_ICONS: Readonly<Record<string, string>> = {
  A11: "RECAP_PVP", // Warmonger
  A14: "RECAP_PVP", // Duelist
  S13: "RECAP_PVP", // Bloodbath zone
  P14: "RECAP_PVP", // Rank race
  F14: "RECAP_PVP", // Revenge
  F15: "RECAP_PVP", // Duel rivals
  S15: "RECAP_DEATHS", // Deadliest zone
  F16: "RECAP_DEATHS", // Most deaths
  F17: "RECAP_FALL", // Fell to their death
  F18: "RECAP_FIRE", // Died by fire
  A13: "RECAP_EPIC", // Loot goblin
  F21: "RECAP_EPIC", // Purple rain
  F20: "RECAP_MOUNT", // Big spender
  F7: "RECAP_NIGHT_OWL", // Night owl
  F8: "RECAP_EARLY_BIRD", // Early bird
  A12: "RECAP_BATTLEGROUND", // Battlemaster
  S14: "RECAP_BATTLEGROUND", // Battleground of the week
  F22: "RECAP_MARATHON", // Marathon
  F19: "RECAP_UNTOUCHABLE", // Untouchable
  A7: "RECAP_GROUP", // Social butterfly
  S11: "RECAP_GROUP", // Biggest group night
};

/** The icon and a space before a recap card's first line, or nothing (an unknown card, or no emoji yet). */
export function cardIcon(icons: ClassIcons, cardId: string): string {
  const key = RECAP_CARD_ICONS[cardId];
  return key === undefined ? "" : icon(icons, key);
}

/** Every emoji the bot keeps as its own: the class icons, the boxes and the recap card icons. */
export const BOT_EMOJI: readonly { classFile: string; file: string }[] = [...CLASS_ICONS, ...BOX_ICONS, ...RECAP_ICONS];

/** Class file → the emoji markup (`<:cf_mage_3fa9c1:123>`); a class without one shows no icon. */
export type ClassIcons = Readonly<Record<string, string>>;

export const NO_ICONS: ClassIcons = {};

const PREFIX = "cf_";

/** The emoji's name: `cf_<class>_<the first 6 hex of the picture's hash>`. */
export function emojiName(classFile: string, hash: string): string {
  return `${PREFIX}${classFile.toLowerCase()}_${hash.slice(0, 6).toLowerCase()}`;
}

export interface Emoji {
  id: string;
  name: string;
}

export interface SyncPlan {
  /** To upload: the class, its emoji name and its file. */
  upload: { classFile: string; name: string; file: string }[];
  /** The bot's own class emoji that no longer match a picture (an older icon), to delete after the upload. */
  remove: Emoji[];
  /** The icons already there. */
  icons: Record<string, string>;
}

/** What to upload and delete so each class has the emoji of its current picture; other emoji are left alone. */
export function syncPlan(hashes: Readonly<Record<string, string>>, existing: readonly Emoji[]): SyncPlan {
  const plan: SyncPlan = { upload: [], remove: [], icons: {} };
  const wanted = new Set<string>();
  for (const { classFile, file } of BOT_EMOJI) {
    const hash = hashes[classFile];
    if (hash === undefined) continue;
    const name = emojiName(classFile, hash);
    wanted.add(name);
    const there = existing.find((e) => e.name === name);
    if (there !== undefined) plan.icons[classFile] = markup(there);
    else plan.upload.push({ classFile, name, file });
  }
  const ours = new RegExp(`^${PREFIX}(${BOT_EMOJI.map((c) => c.classFile.toLowerCase()).join("|")})_[0-9a-f]{6}$`);
  plan.remove = existing.filter((e) => ours.test(e.name) && !wanted.has(e.name));
  return plan;
}

/** An emoji as Discord's message markup. */
export function markup(emoji: Emoji): string {
  return `<:${emoji.name}:${emoji.id}>`;
}

/** The icon and a space before a name, or nothing when the class has no emoji (never a broken one). */
export function icon(icons: ClassIcons, classFile: string | undefined): string {
  const found = classFile === undefined ? undefined : icons[classFile];
  return found === undefined ? "" : `${found} `;
}

/** The icon as a select menu option's emoji (BOT-04's picker), or undefined. */
export function optionEmoji(
  icons: ClassIcons,
  classFile: string | undefined,
): { id: string; name: string } | undefined {
  const found = classFile === undefined ? undefined : icons[classFile];
  const match = found === undefined ? null : /^<:(\w+):(\d+)>$/.exec(found);
  return match === null ? undefined : { name: match[1] as string, id: match[2] as string };
}
