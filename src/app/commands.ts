// The slash commands' answers (BOT-05 `/recap`, BOT-06 the look-ups in app/lookups.ts, BOT-04 the runs in
// app/runActions.ts). Each answer is only for the asker (the adapter defers it ephemerally). Never fatal: a failed
// answer is logged and the user can ask again.
import { type Autocomplete, type ButtonPress, type SlashCommand, problemOf } from "../adapters/discord.js";
import type { Log } from "../adapters/log.js";
import type { Site } from "../adapters/site.js";
import { MY_GOALS, boardUrl } from "../core/doomsday.js";
import { noRecapMessage, readRecap, recapFiles, recapMessage } from "../core/recap.js";
import type { SiteSettings } from "../core/settings.js";
import type { EmojiBox } from "./emoji.js";
import { answerMyGoals } from "./doomsdayPosts.js";
import { loadFiles } from "./files.js";
import { LOOKUPS, SharedAnswers, answerAutocomplete, answerLookup, answerShare } from "./lookups.js";
import { failedMessage } from "../core/lookups.js";
import { RUN_COMMANDS, RunActions } from "./runActions.js";

export interface CommandDeps {
  siteUrl: string;
  site: Site;
  log: Log;
  /** Milliseconds, for the Share buttons' lifetime and the sightings' ages. */
  now(): number;
  /** BOT-04: the latest settings, as the poster read them. */
  settings?(): SiteSettings | undefined;
  /** BOT-11: the bot's emoji, once the start-up sync has them. */
  icons?: EmojiBox;
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
  const files = await loadFiles(recapFiles(recap), deps.site, deps.log, signal, "the recap");
  await command.reply(
    recapMessage(
      recap,
      deps.siteUrl,
      files.map((f) => f.name),
      undefined,
      boardUrl(deps.siteUrl, deps.settings?.()?.doomsdayUrl),
      deps.icons?.current,
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
  const lookups = { ...deps, shares: new SharedAnswers(), doomsdayUrl: () => deps.settings?.()?.doomsdayUrl };
  const runs = new RunActions({ ...deps, settings: () => deps.settings?.() });
  // A failed answer is logged and, where there is one to give, the asker gets "Something went wrong" instead of
  // waiting until Discord gives up.
  const failed = (what: string, tell?: () => Promise<void>) => (error: unknown) => {
    deps.log.error(`discord: answering ${what} failed (${problemOf(error)})`);
    tell?.().catch(() => undefined);
  };
  return {
    command(command) {
      const tell = () => command.reply(failedMessage());
      if (command.name === "recap") answerRecap(deps, command, signal).catch(failed("/recap", tell));
      else if ((RUN_COMMANDS as readonly string[]).includes(command.name)) {
        runs.command(command, signal).catch(failed(`/${command.name}`, tell));
      } else if ((LOOKUPS as readonly string[]).includes(command.name)) {
        answerLookup(lookups, command, signal).catch(failed(`/${command.name}`, tell));
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
      const tell = () => press.reply(failedMessage());
      if (RunActions.handles(press.customId)) {
        runs.press(press, signal).catch(failed("a run button", tell));
        return;
      }
      if (press.customId === MY_GOALS) {
        answerMyGoals({ ...deps, pageUrl: () => deps.settings?.()?.doomsdayUrl }, press, signal).catch(
          failed("My goals", tell),
        );
        return;
      }
      answerShare(lookups, press).catch(failed("Share", tell));
    },
  };
}
