// Wiring: reads the configuration and starts the bot. BOT-01 is the empty bot: it checks its configuration and
// stops; the Discord connection comes with BOT-02.
import type { Log } from "../adapters/log.js";
import { type Env, problemText, readConfig } from "../core/config.js";

/** Starts the bot. Returns the exit code: 0 without a token (nothing to do), 1 for a broken configuration. */
export function start(env: Env, log: Log): number {
  const result = readConfig(env);
  if (!result.ok) {
    if (result.reason === "no token") {
      log.info(problemText(result));
      return 0;
    }
    log.error(problemText(result));
    return 1;
  }
  log.info(`configuration complete for ${result.config.siteUrl}; the Discord connection comes with BOT-02`);
  return 0;
}
