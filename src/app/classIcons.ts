// The class icons (BOT-11) and the Doomsday boxes (BOT-15) at start: the bot uploads its own application emoji from `assets/class-icons/` (the boxes too) when one is
// missing or its picture changed (the picture's hash is in the emoji's name, core/classIcons.ts), then deletes the
// older ones. Never fatal: an icon that can't be had leaves its class without one.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Discord } from "../adapters/discord.js";
import { PostError } from "../adapters/discord.js";
import type { Log } from "../adapters/log.js";
import { BOT_EMOJI, type ClassIcons, NO_ICONS, markup, syncPlan } from "../core/classIcons.js";

/** The icons the bot uses now; empty until the sync is done or when it failed. */
export interface IconBox {
  current: ClassIcons;
}

/** Reads an icon file; undefined when it isn't there. */
export type ReadIcon = (file: string) => Promise<Uint8Array | undefined>;

// From dist/app/ (and src/app/ in tests) to the repo's (the image's) assets/class-icons/.
const ICON_DIR = new URL("../../assets/class-icons/", import.meta.url);

export const readIconFile: ReadIcon = async (file) => {
  try {
    return new Uint8Array(await readFile(new URL(file, ICON_DIR)));
  } catch {
    return undefined;
  }
};

/** Makes Discord's application emoji match the icon files; resolves the icons to use. */
export async function syncClassIcons(discord: Discord, log: Log, read: ReadIcon = readIconFile): Promise<ClassIcons> {
  const files = new Map<string, Uint8Array>();
  const hashes: Record<string, string> = {};
  for (const { classFile, file } of BOT_EMOJI) {
    const data = await read(file);
    if (data === undefined) continue;
    files.set(classFile, data);
    hashes[classFile] = createHash("sha256").update(data).digest("hex");
  }
  if (files.size < BOT_EMOJI.length) log.error(`class icons: ${BOT_EMOJI.length - files.size} icon files missing`);
  let existing;
  try {
    existing = await discord.emojis();
  } catch (error) {
    log.error(`discord: reading the class icons failed (${codeOf(error)}); names show without icons`);
    return NO_ICONS;
  }
  const plan = syncPlan(hashes, existing);
  const icons: Record<string, string> = { ...plan.icons };
  for (const { classFile, name } of plan.upload) {
    try {
      icons[classFile] = markup(await discord.createEmoji(name, files.get(classFile) as Uint8Array));
    } catch (error) {
      log.error(`discord: uploading the ${classFile.toLowerCase()} icon failed (${codeOf(error)})`);
    }
  }
  // The older icons only after the new ones are there; one that stays only takes a slot.
  for (const old of plan.remove) {
    try {
      await discord.deleteEmoji(old.id);
    } catch (error) {
      log.error(`discord: deleting an old class icon failed (${codeOf(error)})`);
    }
  }
  const uploaded = plan.upload.filter((u) => icons[u.classFile] !== undefined).length;
  log.info(`class icons: ${Object.keys(icons).length} of ${BOT_EMOJI.length} ready (${uploaded} uploaded)`);
  return icons;
}

function codeOf(error: unknown): string {
  return error instanceof PostError ? `code ${error.code ?? "none"}` : "no answer";
}
