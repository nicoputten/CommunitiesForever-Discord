// The files a post attaches (BOT-05, BOT-20): images the site renders, fetched with the bot token, and pictures of the
// bot's own from `assets/`. A file that can't be had is left out; the post goes out without it.
import type { Attachment } from "../adapters/discord.js";
import type { Log } from "../adapters/log.js";
import type { Site } from "../adapters/site.js";
import type { FileSource } from "../core/message.js";
import { type ReadEmoji, readEmojiFile } from "./emoji.js";

export async function loadFiles(
  sources: readonly FileSource[],
  site: Site,
  log: Log,
  signal: AbortSignal,
  what = "the post",
  readAsset: ReadEmoji = readEmojiFile,
): Promise<Attachment[]> {
  const files: Attachment[] = [];
  for (const source of sources) {
    const data = "path" in source ? await site.image(source.path, signal) : await readAsset(source.asset);
    if (data !== undefined) files.push({ name: source.name, data });
    else if ("path" in source) log.error(`site: card image ${source.name} unavailable; posting ${what} without it`);
  }
  return files;
}
