// The poster (BOT-03): reads the site's settings, long-polls its events, posts each one once and acknowledges it
// (CLAUDE.md rule 9). Posts carry a marker (core/message.ts), so after a restart the bot finds what it already posted
// in its channels and only acknowledges it. Never fatal: the site and Discord may be away for a while. Each kind of
// event has its channel (the posts channel when none is set) and its handler:
// - feats (the `milestones` event): app/featPosts.ts, grouped by editing (BOT-09, BOT-14), the feats channel (BOT-17)
// - the weekly recap with its card images (BOT-05): the recap channel. A recap missed while the bot was away comes
//   when it is back, since the site keeps it until it is acknowledged.
// - planned runs and asks (BOT-04, BOT-12): app/runPosts.ts, the runs channel
// - the daily Doomsday board (BOT-15): app/doomsdayPosts.ts; the weekly ladder (BOT-16): the Doomsday channel
// - test posts (WEB-39, BOT-17): the plain one in the posts channel, a sample per kind in that kind's channel
import type { Discord } from "../adapters/discord.js";
import { PostError } from "../adapters/discord.js";
import type { Log } from "../adapters/log.js";
import type { Site, SiteAnswer } from "../adapters/site.js";
import { MAX_BACKOFF_SECONDS, backoffSeconds } from "../core/connection.js";
import { boardUrl } from "../core/doomsday.js";
import { type Action, decide, readEvents } from "../core/events.js";
import { ladderMessage } from "../core/ladder.js";
import { markedEvents } from "../core/message.js";
import { opt } from "../core/read.js";
import { recapFiles, recapMessage } from "../core/recap.js";
import { testFiles, testSample } from "../core/samples.js";
import { type SiteSettings, readSettings, settingsText } from "../core/settings.js";
import { DoomsdayBoards } from "./doomsdayPosts.js";
import type { EmojiBox } from "./emoji.js";
import { FeatPosts } from "./featPosts.js";
import { loadFiles } from "./files.js";
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
  /** BOT-11: the bot's emoji, once the start-up sync has them. */
  icons?: EmojiBox;
  /** BOT-04: the latest settings, for the run commands. */
  shared?: { settings?: SiteSettings };
}

/** The channel of each kind of post: its own when set, else the posts channel. */
interface Channels {
  posts: string;
  recap: string;
  runs: string;
  doomsday: string;
  feats: string;
}

type Handled = Exclude<Action, { do: "leave" }>;

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
  // The other channels whose posts were read for markers.
  let scanned = new Set<string>();
  const icons = opt("icons", deps.icons);
  const runs = deps.runPosts ?? new RunPosts({ siteUrl, discord, log, now: deps.now, ...icons });
  const boards = new DoomsdayBoards(
    { siteUrl, site, discord, log, now: deps.now, ...icons, pageUrl: () => settings?.doomsdayUrl },
    signal,
  );
  const feats = new FeatPosts({ siteUrl, site, discord, log, now: deps.now, ...icons }, signal);

  const retry = async (text: string, seconds = backoffSeconds(++attempt)) => {
    log.error(`${text}; trying again in ${seconds} s`);
    await sleep(seconds * 1000, signal);
  };
  const siteProblem = (answer: Extract<SiteAnswer, { ok: false }>) =>
    answer.status === 401
      ? `site: ${siteUrl} refuses BOT_API_TOKEN (docs/DISCORD-SETUP.md)`
      : `site: ${siteUrl} ${answer.status ? `answers ${answer.status}` : "is not reachable"}`;

  /** Posts (or edits) what an event asks; resolves the message id to acknowledge it with, or undefined to leave it. */
  const handle = async (action: Handled, eventId: number, s: SiteSettings, ch: Channels) => {
    const page = boardUrl(siteUrl, s.doomsdayUrl);
    switch (action.do) {
      case "ack":
        return action.messageId;
      case "post":
        return feats.handle(eventId, action.milestones, action.card, ch.feats);
      case "run":
        // Undefined: nothing to acknowledge with (a notice to someone unreachable); the site lets it expire.
        return runs.handle(action.event, eventId, ch.runs, s, action.posted);
      case "board":
        // Undefined: waiting for the edit throttle, acknowledged once shown.
        return boards.handle(eventId, action.board, ch.doomsday, action.posted);
      case "ladder": {
        const id = await discord.post(ch.doomsday, ladderMessage(action.ladder, eventId, siteUrl, host, page));
        log.info(`posted event ${eventId} (Doomsday ladder)`);
        return id;
      }
      case "send": {
        const id = await discord.post(ch.posts, action.content);
        log.info(`posted event ${eventId} (test)`);
        return id;
      }
      case "sample": {
        const files = await loadFiles(testFiles(action.kind), site, log, signal);
        const names = files.map((f) => f.name);
        const content = testSample(action.kind, eventId, siteUrl, host, Math.floor(deps.now() / 1000), page, names);
        const id = await discord.post(ch[action.kind], content, files);
        log.info(`posted event ${eventId} (test of ${action.kind})`);
        return id;
      }
      case "recap": {
        // The images and icons; one that can't be had is left out, the post goes out anyway (never twice, rule 9).
        const files = await loadFiles(recapFiles(action.recap), site, log, signal, "the recap");
        if (signal.aborted) return undefined;
        const content = recapMessage(
          action.recap,
          siteUrl,
          files.map((f) => f.name),
          eventId,
          page,
        );
        const id = await discord.post(ch.recap, content, files);
        log.info(`posted event ${eventId} (recap of week ${action.recap.week})`);
        return id;
      }
    }
  };

  /** Reads the settings from the site; the refusal when that failed (the cached settings stay). */
  const loadSettings = async (): Promise<Extract<SiteAnswer, { ok: false }> | undefined> => {
    const answer = await site.settings(signal);
    if (!answer.ok) return answer;
    settings = readSettings(answer.body);
    if (deps.shared !== undefined) deps.shared.settings = settings;
    const text = settingsText(siteUrl, settings);
    if (text !== lastSettingsText) log.info(text);
    lastSettingsText = text;
    settingsAt = deps.now();
    return undefined;
  };
  // BOT-19: the test events whose settings were just read again, so a test right after a channel change goes there.
  let freshFor = new Set<number>();

  while (!signal.aborted) {
    if (settings === undefined || deps.now() - settingsAt >= SETTINGS_EVERY_MS) {
      const refused = await loadSettings();
      if (signal.aborted) return;
      if (refused !== undefined) {
        if (settings === undefined) {
          await retry(siteProblem(refused), refused.status === 401 ? MAX_BACKOFF_SECONDS : undefined);
          continue;
        }
        // With an old answer the bot keeps going and asks again after the next interval.
        settingsAt = deps.now();
      }
    }

    // Set by loadSettings by now; TypeScript can't see that through the closure.
    if (settings === undefined) continue;
    // Without a posts channel the runs, Doomsday and feats channels still take theirs; the other posts wait.
    const wanted =
      settings.postsChannel ?? settings.runsChannel ?? settings.doomsdayChannel ?? settings.featsChannel ?? undefined;
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
      feats.forget();
      scanned = new Set([wanted]);
    }
    const ch: Channels = {
      posts: channel,
      recap: settings.recapChannel ?? channel,
      runs: settings.runsChannel ?? channel,
      doomsday: settings.doomsdayChannel ?? channel,
      feats: settings.featsChannel ?? channel,
    };
    let unread: string | undefined;
    for (const what of ["recap", "runs", "doomsday", "feats"] as const) {
      if (scanned.has(ch[what])) continue;
      try {
        const recent = await discord.recentPosts(ch[what]);
        for (const [id, message] of markedEvents(siteUrl, recent)) posted.set(id, message);
        runs.learn(recent);
        scanned.add(ch[what]);
      } catch (error) {
        unread = `discord: reading the ${what === "doomsday" ? "Doomsday" : what} channel failed (${codeOf(error)})`;
        break;
      }
    }
    if (unread !== undefined) {
      await retry(unread);
      continue;
    }

    const answer = await site.events(cursor, signal);
    if (signal.aborted) return;
    if (!answer.ok) {
      await retry(siteProblem(answer));
      continue;
    }
    const { events, cursor: next } = readEvents(answer.body);
    let failed = false;
    let changed = false;
    for (const event of events) {
      if (event.type === "test" && !freshFor.has(event.id)) {
        // BOT-19: the admin may have picked a channel just before pressing the test button; read the settings again
        // first. A new channel is read for markers before anything is posted in it, so the round starts again.
        freshFor = new Set(events.filter((e) => e.type === "test").map((e) => e.id));
        const before = channelsOf(settings);
        const refused = await loadSettings();
        if (signal.aborted) return;
        if (refused !== undefined) {
          log.error(`${siteProblem(refused)}; posting test event ${event.id} with the settings read before`);
        } else if (channelsOf(settings) !== before) {
          changed = true;
          break;
        }
      }
      const action = decide(event, settings, posted, siteUrl, host);
      if (action.do === "leave" || waits(action, settings)) continue;
      let messageId: string | undefined;
      try {
        messageId = await handle(action, event.id, settings, ch);
      } catch (error) {
        failed = true;
        await retry(`${failure(action, event.id)} (${codeOf(error)})`);
        break;
      }
      if (signal.aborted) return;
      if (messageId === undefined) continue;
      posted.set(event.id, messageId);
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
    if (failed || changed) {
      // From the start again: what wasn't acknowledged comes again, and the markers prevent a second post.
      cursor = "0";
    } else {
      attempt = 0;
      cursor = next ?? cursor;
    }
  }
}

/** The channel settings as one text, to see whether the admin changed any (BOT-19). */
function channelsOf(settings: SiteSettings | undefined): string {
  const s = settings ?? {};
  return JSON.stringify([s.postsChannel, s.recapChannel, s.runsChannel, s.doomsdayChannel, s.featsChannel]);
}

/**
 * Whether an event waits for its channel: without a posts channel, a kind whose own channel isn't set either is left
 * until the admin picks one. Runs always have one (the poster runs only with some channel set).
 */
function waits(action: Handled, settings: SiteSettings): boolean {
  if (typeof settings.postsChannel === "string") return false;
  const own = (value: string | null | undefined) => typeof value !== "string";
  switch (action.do) {
    case "post":
      return own(settings.featsChannel);
    case "send":
      return true;
    case "sample":
      return own(
        { feats: settings.featsChannel, recap: settings.recapChannel, doomsday: settings.doomsdayChannel }[action.kind],
      );
    case "recap":
      return own(settings.recapChannel);
    case "board":
    case "ladder":
      return own(settings.doomsdayChannel);
    default:
      return false;
  }
}

/** The log line when posting an event failed (before the error code). */
function failure(action: Handled, eventId: number): string {
  switch (action.do) {
    case "run":
      return `discord: run event ${eventId} failed`;
    case "board":
      return `discord: Doomsday board event ${eventId} failed`;
    case "ladder":
      return `discord: posting the Doomsday ladder (event ${eventId}) failed`;
    case "recap":
      return `discord: posting the recap (event ${eventId}) failed`;
    default:
      return `discord: posting event ${eventId} failed`;
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
