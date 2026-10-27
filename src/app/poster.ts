// The poster (BOT-03): reads the site's settings, long-polls its events, posts each one once and acknowledges it
// (CLAUDE.md rule 9). Posts carry a marker (core/milestones.ts), so after a restart the bot finds what it already
// posted in the channel and only acknowledges it. Never fatal: the site and Discord may be away for a while.
// Milestones of uploads within 5 minutes of a post are added to that post by editing it (BOT-09).
import type { Discord } from "../adapters/discord.js";
import { PostError } from "../adapters/discord.js";
import type { Log } from "../adapters/log.js";
import type { Site, SiteAnswer } from "../adapters/site.js";
import { MAX_BACKOFF_SECONDS, backoffSeconds } from "../core/connection.js";
import { decide, readEvents } from "../core/events.js";
import { type Group, type MessageContent, groupedMessage, joinsPost, markedEvents } from "../core/milestones.js";
import { type SiteSettings, readSettings, settingsText } from "../core/settings.js";

/** How often the settings are read again, so the admin's changes apply without a restart. */
export const SETTINGS_EVERY_MS = 5 * 60_000;

export interface PosterDeps {
  siteUrl: string;
  site: Site;
  discord: Discord;
  log: Log;
  now(): number;
}

export async function runPoster(deps: PosterDeps, signal: AbortSignal): Promise<void> {
  const { siteUrl, site, discord, log } = deps;
  const host = new URL(siteUrl).host;
  let settings: SiteSettings | undefined;
  let settingsAt = 0;
  let lastSettingsText: string | undefined;
  let attempt = 0;
  let cursor = "0";
  let channel: string | undefined;
  let posted = new Map<number, string>();
  // The post that still takes milestones (BOT-09); at most MAX_LINES milestones, so bounded.
  let open: { id: string; channel: string; at: number; groups: Group[] } | undefined;

  const retry = async (text: string, seconds = backoffSeconds(++attempt)) => {
    log.error(`${text}; trying again in ${seconds} s`);
    await sleep(seconds * 1000, signal);
  };
  const siteProblem = (answer: Extract<SiteAnswer, { ok: false }>) =>
    answer.status === 401
      ? `site: ${siteUrl} refuses BOT_API_TOKEN (docs/DISCORD-SETUP.md)`
      : `site: ${siteUrl} ${answer.status ? `answers ${answer.status}` : "is not reachable"}`;

  while (!signal.aborted) {
    if (settings === undefined || deps.now() - settingsAt >= SETTINGS_EVERY_MS) {
      const answer = await site.settings(signal);
      if (signal.aborted) return;
      if (answer.ok) {
        settings = readSettings(answer.body);
        const text = settingsText(siteUrl, settings);
        if (text !== lastSettingsText) log.info(text);
        lastSettingsText = text;
      } else if (settings === undefined) {
        await retry(siteProblem(answer), answer.status === 401 ? MAX_BACKOFF_SECONDS : undefined);
        continue;
      }
      // With an old answer the bot keeps going and asks again after the next interval.
      settingsAt = deps.now();
    }

    const wanted = settings.postsChannel ?? undefined;
    if (wanted === undefined) {
      channel = undefined;
      await sleep(SETTINGS_EVERY_MS - (deps.now() - settingsAt), signal);
      continue;
    }
    if (wanted !== channel) {
      try {
        posted = markedEvents(siteUrl, await discord.recentPosts(wanted));
      } catch (error) {
        await retry(`discord: reading the posts channel failed (${codeOf(error)})`);
        continue;
      }
      channel = wanted;
      cursor = "0";
      open = undefined;
    }

    const answer = await site.events(cursor, signal);
    if (signal.aborted) return;
    if (!answer.ok) {
      await retry(siteProblem(answer));
      continue;
    }
    const { events, cursor: next } = readEvents(answer.body);
    let failed = false;
    for (const event of events) {
      const action = decide(event, settings, posted);
      if (action.do === "leave") continue;
      let messageId: string | undefined;
      if (action.do === "ack") {
        messageId = action.messageId;
      } else {
        const group: Group = { eventId: event.id, milestones: action.milestones };
        const shownInOpen = open?.groups.reduce((n, g) => n + g.milestones.length, 0) ?? 0;
        if (open?.channel === channel && joinsPost(open.at, shownInOpen, group.milestones.length, deps.now())) {
          const groups = [...open.groups, group];
          try {
            await discord.edit(channel, open.id, groupedMessage(groups, siteUrl, host) as MessageContent);
            open.groups = groups;
            messageId = open.id;
            log.info(`added event ${event.id} to the post of event ${groups[0]?.eventId}`);
          } catch (error) {
            // Deleted or not editable: a new post instead.
            log.error(`discord: adding event ${event.id} to the open post failed (${codeOf(error)}); posting it`);
            open = undefined;
          }
        }
        if (messageId === undefined) {
          try {
            messageId = await discord.post(channel, groupedMessage([group], siteUrl, host) as MessageContent);
          } catch (error) {
            failed = true;
            await retry(`discord: posting event ${event.id} failed (${codeOf(error)})`);
            break;
          }
          open = { id: messageId, channel, at: deps.now(), groups: [group] };
          log.info(`posted event ${event.id}`);
        }
        posted.set(event.id, messageId);
      }
      const ack = await site.posted(event.id, messageId, signal);
      if (signal.aborted) return;
      // 409: acknowledged before with another message; 410: expired. Either way the site is done with it.
      if (!ack.ok && ack.status !== 409 && ack.status !== 410) {
        failed = true;
        await retry(`site: acknowledging event ${event.id} failed`);
        break;
      }
      posted.delete(event.id);
    }
    if (failed) {
      // From the start again: what wasn't acknowledged comes again, and the markers prevent a second post.
      cursor = "0";
    } else {
      attempt = 0;
      cursor = next ?? cursor;
    }
  }
}

function codeOf(error: unknown): string {
  return error instanceof PostError ? `code ${error.code ?? "none"}` : "no answer";
}

/** Waits `ms`, or less when `signal` aborts. */
export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, Math.max(0, ms));
    signal.addEventListener("abort", done, { once: true });
  });
}
