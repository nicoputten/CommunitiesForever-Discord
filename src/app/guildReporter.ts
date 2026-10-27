// Reports the server's channels and roles to the site (BOT-08, BOT-API.md "Guild"), so the admin picks them from a
// list. On connect and on every change, bundled: changes within 5 s give one report. A site without the endpoint
// (404) is told again only at the next connect or change; other failures are retried with backoff.
import type { Discord } from "../adapters/discord.js";
import type { Log } from "../adapters/log.js";
import type { Site } from "../adapters/site.js";
import { backoffSeconds } from "../core/connection.js";
import { guildReport, reportText } from "../core/guild.js";

export const BUNDLE_MS = 5_000;

export interface GuildReporter {
  /** Report soon (after BUNDLE_MS); a pending report absorbs it. */
  changed(): void;
  stop(): void;
}

export function guildReporter(site: Site, discord: Discord, log: Log): GuildReporter {
  const stop = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  let saidNoEndpoint = false;

  const schedule = (ms: number) => {
    if (stop.signal.aborted) return;
    clearTimeout(timer);
    timer = setTimeout(() => void send(), ms);
  };

  const send = async () => {
    timer = undefined;
    const snapshot = discord.guild();
    if (snapshot === undefined) return;
    const report = guildReport(snapshot);
    const answer = await site.guild(report, stop.signal);
    if (stop.signal.aborted) return;
    if (answer.ok) {
      attempt = 0;
      saidNoEndpoint = false;
      log.info(reportText(report));
    } else if (answer.status === 404) {
      if (!saidNoEndpoint) log.info("site: has no guild endpoint yet (an older site); channels and roles not reported");
      saidNoEndpoint = true;
    } else {
      const seconds = backoffSeconds(++attempt);
      log.error(`site: reporting channels and roles failed; trying again in ${seconds} s`);
      // A change before then replaces this retry with a fresh, bundled one.
      schedule(seconds * 1000);
    }
  };

  const unsubscribe = discord.onGuildChange(() => schedule(BUNDLE_MS));
  return {
    changed: () => schedule(BUNDLE_MS),
    stop: () => {
      stop.abort();
      clearTimeout(timer);
      unsubscribe();
    },
  };
}
