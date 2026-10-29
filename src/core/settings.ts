import { isObject } from "./read.js";
// The site's settings answer (web repo docs/BOT-API.md "Settings"), read defensively: every field may be missing
// (CLAUDE.md rule 10).

export interface SiteSettings {
  siteName?: string;
  apiVersion?: number;
  /** posts.milestones; undefined when the site doesn't say. */
  milestones?: boolean;
  /** channels.posts: the channel id for milestones, null until the admin picked one, undefined on older sites. */
  postsChannel?: string | null;
  /** posts.recap (BOT-05): the weekly recap on or off; undefined when the site doesn't say. */
  recap?: boolean;
  /** channels.recap (BOT-05): the recap's channel; null or undefined means the posts channel. */
  recapChannel?: string | null;
  /** posts.runs (BOT-04): planned runs on or off; undefined when the site doesn't say. */
  runs?: boolean;
  /** channels.runs (BOT-04): the runs channel; null or undefined means the posts channel. */
  runsChannel?: string | null;
  /** mentionRole (BOT-04): the role mentioned on a new run, or null. */
  mentionRole?: string | null;
  /** runs.reminderMinutes (BOT-04): when "starting soon" begins; 30 when the site doesn't say. */
  reminderMinutes?: number;
  /** posts.doomsdayBoard (BOT-15): the daily board on or off; undefined when the site doesn't say. */
  doomsdayBoard?: boolean;
  /** posts.doomsdayLadder (BOT-16): the weekly ladder on or off; undefined when the site doesn't say. */
  doomsdayLadder?: boolean;
  /** channels.doomsday (BOT-15): the Doomsday channel; null or undefined means the posts channel. */
  doomsdayChannel?: string | null;
  /** channels.feats (BOT-17): the feats' channel (the `milestones` event); null or undefined means the posts channel. */
  featsChannel?: string | null;
  /** doomsday.url (BOT-15): the site's Doomsday page, for "Open the board ↗". */
  doomsdayUrl?: string;
}

export function readSettings(body: unknown): SiteSettings {
  if (!isObject(body)) return {};
  const posts = isObject(body.posts) ? body.posts : {};
  const channels = isObject(body.channels) ? body.channels : {};
  const runs = isObject(body.runs) ? body.runs : {};
  const doomsday = isObject(body.doomsday) ? body.doomsday : {};
  const minutes = runs.reminderMinutes;
  return {
    siteName: typeof body.siteName === "string" && body.siteName.trim() ? body.siteName.trim() : undefined,
    apiVersion: typeof body.apiVersion === "number" ? body.apiVersion : undefined,
    milestones: typeof posts.milestones === "boolean" ? posts.milestones : undefined,
    postsChannel: channels.posts === null ? null : isSnowflake(channels.posts) ? (channels.posts as string) : undefined,
    recap: typeof posts.recap === "boolean" ? posts.recap : undefined,
    recapChannel: channels.recap === null ? null : isSnowflake(channels.recap) ? (channels.recap as string) : undefined,
    runs: typeof posts.runs === "boolean" ? posts.runs : undefined,
    runsChannel: channels.runs === null ? null : isSnowflake(channels.runs) ? (channels.runs as string) : undefined,
    mentionRole:
      body.mentionRole === null ? null : isSnowflake(body.mentionRole) ? (body.mentionRole as string) : undefined,
    reminderMinutes:
      typeof minutes === "number" && Number.isInteger(minutes) && minutes > 0 && minutes <= 1440 ? minutes : undefined,
    doomsdayBoard: typeof posts.doomsdayBoard === "boolean" ? posts.doomsdayBoard : undefined,
    doomsdayLadder: typeof posts.doomsdayLadder === "boolean" ? posts.doomsdayLadder : undefined,
    doomsdayChannel:
      channels.doomsday === null ? null : isSnowflake(channels.doomsday) ? (channels.doomsday as string) : undefined,
    featsChannel: channels.feats === null ? null : isSnowflake(channels.feats) ? (channels.feats as string) : undefined,
    doomsdayUrl: typeof doomsday.url === "string" && /^https?:\/\/\S+$/.test(doomsday.url) ? doomsday.url : undefined,
  };
}

/** A Discord id as text: digits only. */
export function isSnowflake(value: unknown): boolean {
  return typeof value === "string" && /^\d{1,20}$/.test(value);
}

/** The log line for a settings answer: the site's name, never the token or channel ids. */
export function settingsText(siteUrl: string, settings: SiteSettings): string {
  const channel = settings.postsChannel ? "set" : "not set";
  const recap = settings.recapChannel ? "; recap channel set" : "";
  const runs = settings.runsChannel ? "; runs channel set" : "";
  const doomsday = `${settings.doomsdayChannel ? "; Doomsday channel set" : ""}${settings.featsChannel ? "; feats channel set" : ""}`;
  return `site: ${siteUrl} answers as ${settings.siteName ?? "(no name)"}; posts channel ${channel}${recap}${runs}${doomsday}`;
}
