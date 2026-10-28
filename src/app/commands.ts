// The slash commands' answers (BOT-05 `/recap`, BOT-06 the look-ups in app/lookups.ts, BOT-04 the runs in
// app/runActions.ts). Each answer is only for the asker (the adapter defers it ephemerally). Never fatal: a failed
// answer is logged and the user can ask again.
import type { Attachment, Autocomplete, ButtonPress, SlashCommand } from "../adapters/discord.js";
import type { Log } from "../adapters/log.js";
import type { Site } from "../adapters/site.js";
import { noRecapMessage, readRecap, recapFiles, recapMessage } from "../core/recap.js";
import type { SiteSettings } from "../core/settings.js";
import { LOOKUPS, SharedAnswers, answerAutocomplete, answerLookup, answerShare } from "./lookups.js";
import { RUN_COMMANDS, RunActions } from "./runActions.js";

export interface CommandDeps {
  siteUrl: string;
  site: Site;
  log: Log;
  /** Milliseconds, for the Share buttons' lifetime and the sightings' ages. */
  now(): number;
  /** BOT-04: the latest settings, as the poster read them. */
  settings?(): SiteSettings | undefined;
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

export interface Handlers {
  command(command: SlashCommand): void;
  autocomplete(request: Autocomplete): void;
  button(press: ButtonPress): void;
}

/** Routes slash commands, autocomplete and buttons to their answers. */
export function commandHandlers(deps: CommandDeps, signal: AbortSignal): Handlers {
  const lookups = { ...deps, shares: new SharedAnswers() };
  const runs = new RunActions({ ...deps, settings: () => deps.settings?.() });
  const failed = (what: string) => () => deps.log.error(`discord: answering ${what} failed`);
  return {
    command(command) {
      if (command.name === "recap") answerRecap(deps, command, signal).catch(failed("/recap"));
      else if ((RUN_COMMANDS as readonly string[]).includes(command.name)) {
        runs.command(command, signal).catch(failed(`/${command.name}`));
      } else if ((LOOKUPS as readonly string[]).includes(command.name)) {
        answerLookup(lookups, command, signal).catch(failed(`/${command.name}`));
      }
    },
    autocomplete(request) {
      if ((RUN_COMMANDS as readonly string[]).includes(request.command)) {
        runs.autocomplete(request, signal).catch(failed(`/${request.command} autocomplete`));
        return;
      }
      answerAutocomplete(lookups, request, signal).catch(failed(`/${request.command} autocomplete`));
    },
    button(press) {
      if (RunActions.handles(press.customId)) {
        runs.press(press, signal).catch(failed("a run button"));
        return;
      }
      answerShare(lookups, press).catch(failed("Share"));
    },
  };
}
