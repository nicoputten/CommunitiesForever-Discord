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
}

export function readSettings(body: unknown): SiteSettings {
  if (!isObject(body)) return {};
  const posts = isObject(body.posts) ? body.posts : {};
  const channels = isObject(body.channels) ? body.channels : {};
  const runs = isObject(body.runs) ? body.runs : {};
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
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
  return `site: ${siteUrl} answers as ${settings.siteName ?? "(no name)"}; posts channel ${channel}${recap}${runs}`;
}
