// The site's settings answer (web repo docs/BOT-API.md "Settings"), read defensively: every field may be missing
// (CLAUDE.md rule 10).

export interface SiteSettings {
  siteName?: string;
  apiVersion?: number;
  /** posts.milestones; undefined when the site doesn't say. */
  milestones?: boolean;
  /** channels.posts: the channel id for milestones, null until the admin picked one, undefined on older sites. */
  postsChannel?: string | null;
}

export function readSettings(body: unknown): SiteSettings {
  if (!isObject(body)) return {};
  const posts = isObject(body.posts) ? body.posts : {};
  const channels = isObject(body.channels) ? body.channels : {};
  return {
    siteName: typeof body.siteName === "string" && body.siteName.trim() ? body.siteName.trim() : undefined,
    apiVersion: typeof body.apiVersion === "number" ? body.apiVersion : undefined,
    milestones: typeof posts.milestones === "boolean" ? posts.milestones : undefined,
    postsChannel: channels.posts === null ? null : isSnowflake(channels.posts) ? (channels.posts as string) : undefined,
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
  return `site: ${siteUrl} answers as ${settings.siteName ?? "(no name)"}; posts channel ${channel}`;
}
