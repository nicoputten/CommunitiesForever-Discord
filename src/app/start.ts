// Wiring: reads the configuration, connects to Discord, registers the slash commands, checks the site's token and
// keeps the heartbeat while connected (BOT-02). Runs until `stop` aborts (exit 0) or Discord refuses the bot (1).
import type { Discord, DiscordConfig } from "../adapters/discord.js";
import type { Heartbeat } from "../adapters/heartbeat.js";
import type { Log } from "../adapters/log.js";
import type { SiteAnswer, SiteConfig } from "../adapters/site.js";
import { COMMANDS } from "../core/commands.js";
import { type Config, type Env, problemText, readConfig } from "../core/config.js";
import {
  type ConnectionEvent,
  HEARTBEAT_MS,
  MAX_BACKOFF_SECONDS,
  backoffSeconds,
  isConnected,
  stateText,
} from "../core/connection.js";
import { readSettings, settingsText } from "../core/settings.js";

export interface Deps {
  discord(config: DiscordConfig, report: (event: ConnectionEvent) => void): Discord;
  settings(config: SiteConfig, signal: AbortSignal): Promise<SiteAnswer>;
  heartbeat: Heartbeat;
  now(): number;
}

/** Runs the bot. Resolves the exit code: 0 without a token or when stopped, 1 for a broken configuration or login. */
export async function start(env: Env, log: Log, deps: Deps, stop: AbortSignal): Promise<number> {
  const result = readConfig(env);
  if (!result.ok) {
    if (result.reason === "no token") {
      log.info(problemText(result));
      return 0;
    }
    log.error(problemText(result));
    return 1;
  }
  const { config } = result;

  let connected = false;
  let registered = false;
  const beat = () => {
    if (connected) deps.heartbeat.write(deps.now());
  };
  const heartbeat = setInterval(beat, HEARTBEAT_MS);

  const discord = deps.discord(config, (event) => {
    log.info(stateText(event));
    connected = isConnected(event) ?? connected;
    beat();
    if (event.kind === "ready" && !registered) {
      registered = true;
      void register(discord, log);
    }
  });

  const siteStop = new AbortController();
  const site = checkSite(config, log, deps, siteStop.signal);

  log.info(stateText({ kind: "connecting" }));
  const code = await new Promise<number>((resolve) => {
    if (stop.aborted) return resolve(0);
    stop.addEventListener("abort", () => resolve(0), { once: true });
    void discord.login().then((reason) => {
      if (reason !== undefined) {
        log.error(stateText({ kind: "failed", reason }));
        resolve(1);
      }
    });
  });

  log.info("stopping");
  clearInterval(heartbeat);
  siteStop.abort();
  await site;
  await discord.destroy();
  deps.heartbeat.remove();
  log.info("stopped");
  return code;
}

async function register(discord: Discord, log: Log): Promise<void> {
  try {
    const count = await discord.registerCommands(COMMANDS);
    log.info(`discord: registered ${count} slash commands`);
  } catch {
    log.error("discord: registering the slash commands failed; they are registered again at the next start");
  }
}

/** Asks the site for its settings until it answers, to check BOT_API_TOKEN. Never fatal: the site may be down. */
async function checkSite(config: Config, log: Log, deps: Deps, signal: AbortSignal): Promise<void> {
  for (let attempt = 1; !signal.aborted; attempt++) {
    const answer = await deps.settings(config, signal);
    if (signal.aborted) return;
    if (answer.ok) {
      log.info(settingsText(config.siteUrl, readSettings(answer.body)));
      return;
    }
    const refused = answer.status === 401;
    const seconds = refused ? MAX_BACKOFF_SECONDS : backoffSeconds(attempt);
    log.error(
      refused
        ? `site: ${config.siteUrl} refuses BOT_API_TOKEN (docs/DISCORD-SETUP.md); trying again in ${seconds} s`
        : `site: ${config.siteUrl} ${answer.status ? `answers ${answer.status}` : "is not reachable"}; trying again in ${seconds} s`,
    );
    await sleep(seconds * 1000, signal);
  }
}

/** Waits `ms`, or less when `signal` aborts. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}
