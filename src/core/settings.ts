// The site's settings answer (web repo docs/BOT-API.md "Settings"), read defensively: every field may be missing
// (CLAUDE.md rule 10).

export interface SiteSettings {
  siteName?: string;
  apiVersion?: number;
}

export function readSettings(body: unknown): SiteSettings {
  if (typeof body !== "object" || body === null) return {};
  const raw = body as Record<string, unknown>;
  return {
    siteName: typeof raw.siteName === "string" && raw.siteName.trim() ? raw.siteName.trim() : undefined,
    apiVersion: typeof raw.apiVersion === "number" ? raw.apiVersion : undefined,
  };
}

/** The log line for a settings answer: the site's name, never the token. */
export function settingsText(siteUrl: string, settings: SiteSettings): string {
  return `site: ${siteUrl} answers as ${settings.siteName ?? "(no name)"}`;
}
