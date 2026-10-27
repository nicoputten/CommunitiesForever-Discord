// Wiring: reads the configuration, connects to Discord, registers the slash commands and keeps the heartbeat while
// connected (BOT-02), and runs the poster once Discord is ready (BOT-03). Runs until `stop` aborts (exit 0) or
// Discord refuses the bot (1).
import type { Discord, DiscordConfig } from "../adapters/discord.js";
import type { Heartbeat } from "../adapters/heartbeat.js";
import type { Log } from "../adapters/log.js";
import type { Site, SiteConfig } from "../adapters/site.js";
import { COMMANDS } from "../core/commands.js";
import { type Env, problemText, readConfig } from "../core/config.js";
import { type ConnectionEvent, HEARTBEAT_MS, isConnected, stateText } from "../core/connection.js";
import { runPoster } from "./poster.js";

export interface Deps {
  discord(config: DiscordConfig, report: (event: ConnectionEvent) => void): Discord;
  site(config: SiteConfig): Site;
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
  let poster: Promise<void> | undefined;
  const posterStop = new AbortController();
  const beat = () => {
    if (connected) deps.heartbeat.write(deps.now());
  };
  const heartbeat = setInterval(beat, HEARTBEAT_MS);

  const discord = deps.discord(config, (event) => {
    log.info(stateText(event));
    connected = isConnected(event) ?? connected;
    beat();
    if (event.kind === "ready" && poster === undefined) {
      void register(discord, log);
      poster = runPoster(
        { siteUrl: config.siteUrl, site: deps.site(config), discord, log, now: deps.now },
        posterStop.signal,
      );
    }
  });

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
  posterStop.abort();
  await poster;
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
