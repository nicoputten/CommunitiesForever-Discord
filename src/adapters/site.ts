// The site's bot API (web repo docs/BOT-API.md): only `settings` so far (BOT-02 checks the token with it). Thin:
// the answer is read in src/core/settings.ts.

export type SiteAnswer = { ok: true; body: unknown } | { ok: false; status?: number };

export interface SiteConfig {
  siteUrl: string;
  botApiToken: string;
}

const TIMEOUT_MS = 15_000;

export async function getSettings(config: SiteConfig, signal: AbortSignal): Promise<SiteAnswer> {
  try {
    const response = await fetch(`${config.siteUrl}/api/bot/v1/settings`, {
      headers: { Authorization: `Bearer ${config.botApiToken}`, Accept: "application/json" },
      signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
    });
    if (!response.ok) return { ok: false, status: response.status };
    return { ok: true, body: await response.json() };
  } catch {
    return { ok: false };
  }
}
