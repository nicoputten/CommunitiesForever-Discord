// The slash commands' answers (BOT-05: `/recap`). Each answer is only for the asker (the adapter defers it
// ephemerally). Never fatal: a failed answer is logged and the user can ask again.
import type { Attachment, SlashCommand } from "../adapters/discord.js";
import type { Log } from "../adapters/log.js";
import type { Site } from "../adapters/site.js";
import { noRecapMessage, readRecap, recapFiles, recapMessage } from "../core/recap.js";

export interface CommandDeps {
  siteUrl: string;
  site: Site;
  log: Log;
}

/** `/recap`: the last weekly recap as it was posted, with its card images (without the post's marker). */
export async function answerRecap(deps: CommandDeps, command: SlashCommand, signal: AbortSignal): Promise<void> {
  const host = new URL(deps.siteUrl).host;
  const answer = await deps.site.recapLatest(signal);
  const recap = answer.ok ? readRecap(answer.body) : undefined;
  if (recap === undefined) {
    // 404 before the first recap; anything else means the site is away.
    await command.reply(noRecapMessage(deps.siteUrl, host, answer.ok || answer.status === 404));
    return;
  }
  const files: Attachment[] = [];
  for (const file of recapFiles(recap)) {
    const data = await deps.site.image(file.path, signal);
    if (data !== undefined) files.push({ name: file.name, data });
  }
  await command.reply(
    recapMessage(
      recap,
      deps.siteUrl,
      host,
      files.map((f) => f.name),
    ),
    files,
  );
}

/** Routes a slash command to its answer. */
export function commandHandler(deps: CommandDeps, signal: AbortSignal): (command: SlashCommand) => void {
  return (command) => {
    if (command.name !== "recap") return;
    answerRecap(deps, command, signal).catch(() => deps.log.error(`discord: answering /${command.name} failed`));
  };
}
