// The bot's emoji at start (BOT-11, BOT-15, BOT-14): the bot uploads its own application emoji from `assets/`
// when one is missing or its picture changed (the picture's hash is in the emoji's name, core/emoji.ts), then
// deletes the older ones. Never fatal: an emoji that can't be had leaves its name or card without one.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Discord } from "../adapters/discord.js";
import { PostError } from "../adapters/discord.js";
import type { Log } from "../adapters/log.js";
import { BOT_EMOJI, type Emojis, NO_EMOJI, markup, syncPlan } from "../core/emoji.js";

/** The emoji the bot uses now; empty until the sync is done or when it failed. */
export interface EmojiBox {
  current: Emojis;
}

/** Reads a picture under `assets/`; undefined when it isn't there. */
export type ReadEmoji = (file: string) => Promise<Uint8Array | undefined>;

// From dist/app/ (and src/app/ in tests) to the repo's (the image's) assets/.
const ASSETS = new URL("../../assets/", import.meta.url);

export const readEmojiFile: ReadEmoji = async (file) => {
  try {
    return new Uint8Array(await readFile(new URL(file, ASSETS)));
  } catch {
    return undefined;
  }
};

/** Makes Discord's application emoji match the pictures; resolves the emoji to use. */
export async function syncEmoji(discord: Discord, log: Log, read: ReadEmoji = readEmojiFile): Promise<Emojis> {
  const files = new Map<string, Uint8Array>();
  const hashes: Record<string, string> = {};
  for (const { key, file } of BOT_EMOJI) {
    const data = await read(file);
    if (data === undefined) continue;
    files.set(key, data);
    hashes[key] = createHash("sha256").update(data).digest("hex");
  }
  if (files.size < BOT_EMOJI.length) log.error(`emoji: ${BOT_EMOJI.length - files.size} pictures missing`);
  let existing;
  try {
    existing = await discord.emojis();
  } catch (error) {
    log.error(`discord: reading the bot's emoji failed (${codeOf(error)}); names show without icons`);
    return NO_EMOJI;
  }
  const plan = syncPlan(hashes, existing);
  const icons: Record<string, string> = { ...plan.icons };
  for (const { key, name } of plan.upload) {
    try {
      icons[key] = markup(await discord.createEmoji(name, files.get(key) as Uint8Array));
    } catch (error) {
      log.error(`discord: uploading the ${key.toLowerCase()} emoji failed (${codeOf(error)})`);
    }
  }
  // The older emoji only after the new ones are there; one that stays only takes a slot.
  for (const old of plan.remove) {
    try {
      await discord.deleteEmoji(old.id);
    } catch (error) {
      log.error(`discord: deleting an old emoji failed (${codeOf(error)})`);
    }
  }
  const uploaded = plan.upload.filter((u) => icons[u.key] !== undefined).length;
  log.info(`emoji: ${Object.keys(icons).length} of ${BOT_EMOJI.length} ready (${uploaded} uploaded)`);
  return icons;
}

function codeOf(error: unknown): string {
  return error instanceof PostError ? `code ${error.code ?? "none"}` : "no answer";
}
