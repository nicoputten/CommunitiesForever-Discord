// The poster (BOT-03): reads the site's settings, long-polls its events, posts each one once and acknowledges it
// (CLAUDE.md rule 9). Posts carry a marker (core/milestones.ts), so after a restart the bot finds what it already
// posted in the channel and only acknowledges it. Never fatal: the site and Discord may be away for a while.
// Milestones of uploads within 5 minutes of a post are added to that post by editing it (BOT-09). The weekly recap
// goes to the recap channel (the posts channel when none is set) with the site's card images attached (BOT-05); a
// recap missed while the bot was away comes when it is back, since the site keeps it until it is acknowledged.
// Planned runs go to the runs channel (the posts channel when none is set): app/runPosts.ts (BOT-04). The daily
// Doomsday board goes to the Doomsday channel (the posts channel when none is set): app/doomsdayPosts.ts (BOT-15).
import type { Attachment, Discord } from "../adapters/discord.js";
import { PostError } from "../adapters/discord.js";
import type { Log } from "../adapters/log.js";
import type { Site, SiteAnswer } from "../adapters/site.js";
import { MAX_BACKOFF_SECONDS, backoffSeconds } from "../core/connection.js";
import { decide, readEvents } from "../core/events.js";
import {
  type Group,
  type MessageContent,
  groupedMessage,
  joinsPost,
  markedEvents,
  milestoneFiles,
} from "../core/milestones.js";
import { boardUrl } from "../core/doomsday.js";
import { ladderMessage } from "../core/ladder.js";
import { recapFiles, recapMessage } from "../core/recap.js";
import { type SiteSettings, readSettings, settingsText } from "../core/settings.js";
import type { IconBox } from "./classIcons.js";
import { DoomsdayBoards } from "./doomsdayPosts.js";
import { RunPosts } from "./runPosts.js";

/**
 * How often the settings are read again, so the admin's changes (a new posts channel, a test post) apply within about
 * a long poll, without a restart. One small request.
 */
export const SETTINGS_EVERY_MS = 30_000;

export interface PosterDeps {
  siteUrl: string;
  site: Site;
  discord: Discord;
  log: Log;
  now(): number;
  /** BOT-04: the run posts, shared with the run commands; made here when not given. */
  runPosts?: RunPosts;
  /** BOT-11: the class icons, once the start-up sync has them. */
  icons?: IconBox;
  /** BOT-04: the latest settings, for the run commands. */
  shared?: { settings?: SiteSettings };
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
  // The recap channel whose posts were read for markers (BOT-05), when it isn't the posts channel.
  let recapScanned: string | undefined;
  // The runs channel whose posts were read for markers (BOT-04), when it isn't the posts channel.
  let runsScanned: string | undefined;
  // The Doomsday channel whose posts were read for markers (BOT-15), when it isn't the posts channel.
  let doomsdayScanned: string | undefined;
  const runs = deps.runPosts ?? new RunPosts({ siteUrl, discord, log, now: deps.now, ...opt("icons", deps.icons) });
  const boards = new DoomsdayBoards(
    { siteUrl, site, discord, log, now: deps.now, ...opt("icons", deps.icons), pageUrl: () => settings?.doomsdayUrl },
    signal,
  );
  // The post that still takes milestones (BOT-09); at most MAX_LINES milestones, so bounded.
  // `attached`: its card images (BOT-05). An edit keeps them; milestones added by an edit go without an image.
  let open: { id: string; channel: string; at: number; groups: Group[]; attached: string[] } | undefined;

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
        if (deps.shared !== undefined) deps.shared.settings = settings;
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

    // Without a posts channel the runs and Doomsday channels still take theirs; the other posts wait for theirs.
    const postsSet = typeof settings.postsChannel === "string";
    const wanted = settings.postsChannel ?? settings.runsChannel ?? settings.doomsdayChannel ?? undefined;
    if (wanted === undefined) {
      channel = undefined;
      await sleep(SETTINGS_EVERY_MS - (deps.now() - settingsAt), signal);
      continue;
    }
    if (wanted !== channel) {
      try {
        const recent = await discord.recentPosts(wanted);
        posted = markedEvents(siteUrl, recent);
        runs.forget();
        runs.learn(recent);
      } catch (error) {
        await retry(`discord: reading the posts channel failed (${codeOf(error)})`);
        continue;
      }
      channel = wanted;
      cursor = "0";
      open = undefined;
      recapScanned = undefined;
      runsScanned = undefined;
      doomsdayScanned = undefined;
    }
    const recapChannel = settings.recapChannel ?? channel;
    if (recapChannel !== channel && recapChannel !== recapScanned) {
      try {
        for (const [id, message] of markedEvents(siteUrl, await discord.recentPosts(recapChannel)))
          posted.set(id, message);
      } catch (error) {
        await retry(`discord: reading the recap channel failed (${codeOf(error)})`);
        continue;
      }
      recapScanned = recapChannel;
    }
    const runsChannel = settings.runsChannel ?? channel;
    if (runsChannel !== channel && runsChannel !== runsScanned) {
      try {
        const recent = await discord.recentPosts(runsChannel);
        for (const [id, message] of markedEvents(siteUrl, recent)) posted.set(id, message);
        runs.learn(recent);
      } catch (error) {
        await retry(`discord: reading the runs channel failed (${codeOf(error)})`);
        continue;
      }
      runsScanned = runsChannel;
    }
    const doomsdayChannel = settings.doomsdayChannel ?? channel;
    if (doomsdayChannel !== channel && doomsdayChannel !== doomsdayScanned) {
      try {
        for (const [id, message] of markedEvents(siteUrl, await discord.recentPosts(doomsdayChannel)))
          posted.set(id, message);
      } catch (error) {
        await retry(`discord: reading the Doomsday channel failed (${codeOf(error)})`);
        continue;
      }
      doomsdayScanned = doomsdayChannel;
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
      const action = decide(event, settings, posted, siteUrl, host);
      if (action.do === "leave") continue;
      if (!postsSet && (action.do === "post" || action.do === "send")) continue;
      if (!postsSet && action.do === "recap" && typeof settings.recapChannel !== "string") continue;
      if (
        !postsSet &&
        (action.do === "board" || action.do === "ladder") &&
        typeof settings.doomsdayChannel !== "string"
      )
        continue;
      let messageId: string | undefined;
      if (action.do === "ack") {
        messageId = action.messageId;
      } else if (action.do === "run") {
        try {
          messageId = await runs.handle(action.event, event.id, runsChannel, settings, action.posted);
        } catch (error) {
          failed = true;
          await retry(`discord: run event ${event.id} failed (${codeOf(error)})`);
          break;
        }
        // Nothing to acknowledge with (a notice to someone unreachable, no post): left, the site lets it expire.
        if (messageId === undefined) continue;
        posted.set(event.id, messageId);
      } else if (action.do === "board") {
        try {
          messageId = await boards.handle(event.id, action.board, doomsdayChannel, action.posted);
        } catch (error) {
          failed = true;
          await retry(`discord: Doomsday board event ${event.id} failed (${codeOf(error)})`);
          break;
        }
        // Waiting for the edit throttle: acknowledged once shown.
        if (messageId === undefined) continue;
        posted.set(event.id, messageId);
      } else if (action.do === "ladder") {
        const content = ladderMessage(action.ladder, event.id, siteUrl, host, boardUrl(siteUrl, settings.doomsdayUrl));
        try {
          messageId = await discord.post(doomsdayChannel, content);
        } catch (error) {
          failed = true;
          await retry(`discord: posting the Doomsday ladder (event ${event.id}) failed (${codeOf(error)})`);
          break;
        }
        posted.set(event.id, messageId);
        log.info(`posted event ${event.id} (Doomsday ladder)`);
      } else if (action.do === "send") {
        try {
          messageId = await discord.post(channel, action.content);
        } catch (error) {
          failed = true;
          await retry(`discord: posting event ${event.id} failed (${codeOf(error)})`);
          break;
        }
        posted.set(event.id, messageId);
        log.info(`posted event ${event.id} (test)`);
      } else if (action.do === "recap") {
        // The card images; one the site can't give is left out, the post goes out anyway (never twice, rule 9).
        const files: Attachment[] = [];
        for (const file of recapFiles(action.recap)) {
          const data = await site.image(file.path, signal);
          if (data !== undefined) files.push({ name: file.name, data });
          else log.error(`site: card image ${file.name} unavailable; posting the recap without it`);
        }
        if (signal.aborted) return;
        const content = recapMessage(
          action.recap,
          siteUrl,
          host,
          files.map((f) => f.name),
          event.id,
          boardUrl(siteUrl, settings.doomsdayUrl),
        );
        try {
          messageId = await discord.post(recapChannel, content, files);
        } catch (error) {
          failed = true;
          await retry(`discord: posting the recap (event ${event.id}) failed (${codeOf(error)})`);
          break;
        }
        posted.set(event.id, messageId);
        log.info(`posted event ${event.id} (recap of week ${action.recap.week})`);
      } else {
        const group: Group = {
          eventId: event.id,
          milestones: action.milestones,
          ...(action.card !== undefined ? { card: action.card } : {}),
        };
        const shownInOpen = open?.groups.reduce((n, g) => n + g.milestones.length, 0) ?? 0;
        if (open?.channel === channel && joinsPost(open.at, shownInOpen, group.milestones.length, deps.now())) {
          const groups = [...open.groups, group];
          try {
            await discord.edit(
              channel,
              open.id,
              groupedMessage(groups, siteUrl, host, open.attached, deps.icons?.current) as MessageContent,
            );
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
          const files: Attachment[] = [];
          for (const file of milestoneFiles([group])) {
            const data = await site.image(file.path, signal);
            if (data !== undefined) files.push({ name: file.name, data });
          }
          if (signal.aborted) return;
          const attached = files.map((f) => f.name);
          try {
            messageId = await discord.post(
              channel,
              groupedMessage([group], siteUrl, host, attached, deps.icons?.current) as MessageContent,
              files,
            );
          } catch (error) {
            failed = true;
            await retry(`discord: posting event ${event.id} failed (${codeOf(error)})`);
            break;
          }
          open = { id: messageId, channel, at: deps.now(), groups: [group], attached };
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

function opt<K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } {
  return (value === undefined ? {} : { [key]: value }) as { [P in K]?: V };
}
