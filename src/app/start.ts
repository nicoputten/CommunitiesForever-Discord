// Wiring: reads the configuration, connects to Discord, registers the slash commands and keeps the heartbeat while
// connected (BOT-02), and runs the poster (BOT-03), the channel and role reports (BOT-08) and the answers to the
// slash commands (BOT-05) once Discord is ready. Runs until `stop` aborts (exit 0) or Discord refuses the bot (1).
import type { Discord, DiscordConfig } from "../adapters/discord.js";
import type { Heartbeat } from "../adapters/heartbeat.js";
import type { Log } from "../adapters/log.js";
import type { Site, SiteConfig } from "../adapters/site.js";
import { COMMANDS } from "../core/commands.js";
import { type Env, problemText, readConfig } from "../core/config.js";
import { type ConnectionEvent, HEARTBEAT_MS, isConnected, stateText } from "../core/connection.js";
import { NO_ICONS } from "../core/classIcons.js";
import type { SiteSettings } from "../core/settings.js";
import { type IconBox, type ReadIcon, syncClassIcons } from "./classIcons.js";
import { commandHandlers } from "./commands.js";
import { type GuildReporter, guildReporter } from "./guildReporter.js";
import { runPoster } from "./poster.js";

export interface Deps {
  discord(config: DiscordConfig, report: (event: ConnectionEvent) => void): Discord;
  site(config: SiteConfig): Site;
  heartbeat: Heartbeat;
  now(): number;
  /** BOT-11: reads a class icon file (tests give their own). */
  readIcon?: ReadIcon;
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
  let reporter: GuildReporter | undefined;
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
      const site = deps.site(config);
      // The poster's latest settings, for the run commands (BOT-04).
      const shared: { settings?: SiteSettings } = {};
      // The class icons (BOT-11): names show without them until the sync is done, or when it fails.
      const icons: IconBox = { current: NO_ICONS };
      void syncClassIcons(discord, log, deps.readIcon).then((found) => (icons.current = found));
      poster = runPoster(
        { siteUrl: config.siteUrl, site, discord, log, now: deps.now, shared, icons },
        posterStop.signal,
      );
      reporter = guildReporter(site, discord, log);
      const handlers = commandHandlers(
        { siteUrl: config.siteUrl, site, log, now: deps.now, settings: () => shared.settings, icons },
        posterStop.signal,
      );
      discord.onCommand(handlers.command);
      discord.onAutocomplete(handlers.autocomplete);
      discord.onButton(handlers.button);
    }
    // After a reconnect the server may have changed while the bot was away.
    if (event.kind === "ready" || event.kind === "resumed") reporter?.changed();
  });

  // The image sets APP_VERSION to the release tag (Dockerfile); "dev" when run from the repo.
  log.info(`version ${env.APP_VERSION?.trim() || "dev"}`);
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
  reporter?.stop();
  await poster;
  await discord.destroy();
  deps.heartbeat.remove();
  log.info("stopped");
  return code;
}

async function register(discord: Discord, log: Log): Promise<void> {
  try {
    const count = await discord.registerCommands(COMMANDS);
    log.info(`discord: registered ${count} slash command${count === 1 ? "" : "s"}`);
  } catch {
    log.error("discord: registering the slash commands failed; they are registered again at the next start");
  }
}
