// The site's bot API (web repo docs/BOT-API.md): settings, the event feed and acknowledging. Thin: the answers are
// read in src/core.

export type SiteAnswer = { ok: true; body: unknown } | { ok: false; status?: number };

export interface SiteConfig {
  siteUrl: string;
  botApiToken: string;
}

export interface Site {
  settings(signal: AbortSignal): Promise<SiteAnswer>;
  /** The long poll: the site may hold it for `longPollSeconds` (30). */
  events(after: string, signal: AbortSignal): Promise<SiteAnswer>;
  posted(eventId: number, messageId: string, signal: AbortSignal): Promise<SiteAnswer>;
  /** The server's channels and roles (BOT-08, BOT-API.md "Guild"). */
  guild(report: unknown, signal: AbortSignal): Promise<SiteAnswer>;
  /** A card image (BOT-05, BOT-API.md "Card images"), e.g. `cards/recap-3-header.png`; undefined when it can't be had. */
  image(path: string, signal: AbortSignal): Promise<Uint8Array | undefined>;
  /** The last weekly recap (BOT-05, `GET recap/latest`). */
  recapLatest(signal: AbortSignal): Promise<SiteAnswer>;
  /** A look-up (BOT-06, BOT-API.md "Look-ups"): `lookup/<what>?…`. */
  lookup(what: string, params: Readonly<Record<string, string>>, signal: AbortSignal): Promise<SiteAnswer>;
}

const TIMEOUT_MS = 15_000;
// Longer than the site's 30 s long poll (BOT-API.md "Long poll").
const LONG_POLL_TIMEOUT_MS = 75_000;

export function siteClient(config: SiteConfig): Site {
  const call = async (path: string, signal: AbortSignal, timeout: number, body?: unknown): Promise<SiteAnswer> => {
    try {
      const response = await fetch(`${config.siteUrl}/api/bot/v1/${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Authorization: `Bearer ${config.botApiToken}`,
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.any([signal, AbortSignal.timeout(timeout)]),
      });
      if (!response.ok) return { ok: false, status: response.status };
      return { ok: true, body: await response.json() };
    } catch {
      return { ok: false };
    }
  };
  return {
    settings: (signal) => call("settings", signal, TIMEOUT_MS),
    events: (after, signal) => call(`events?after=${encodeURIComponent(after)}`, signal, LONG_POLL_TIMEOUT_MS),
    posted: (eventId, messageId, signal) => call(`events/${eventId}/posted`, signal, TIMEOUT_MS, { messageId }),
    guild: (report, signal) => call("guild", signal, TIMEOUT_MS, report),
    recapLatest: (signal) => call("recap/latest", signal, TIMEOUT_MS),
    lookup: (what, params, signal) =>
      call(`lookup/${encodeURIComponent(what)}?${new URLSearchParams(params).toString()}`, signal, TIMEOUT_MS),
    async image(path, signal) {
      try {
        const response = await fetch(`${config.siteUrl}/api/bot/v1/${path}`, {
          headers: { Authorization: `Bearer ${config.botApiToken}`, Accept: "image/png" },
          signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
        });
        if (!response.ok || response.headers.get("content-type") !== "image/png") return undefined;
        return new Uint8Array(await response.arrayBuffer());
      } catch {
        return undefined;
      }
    },
  };
}
