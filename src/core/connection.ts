// The Discord connection's states as log lines, the retry delays and the health rule (BOT-02). Pure: the adapters
// report what happened, the time comes in as an argument.

export type FailReason = "invalid token" | "disallowed intents" | "other";

export type ConnectionEvent =
  | { kind: "connecting" }
  | { kind: "ready"; servers: number }
  | { kind: "joined"; servers: number }
  | { kind: "left"; servers: number }
  | { kind: "disconnected"; code: number }
  | { kind: "reconnecting" }
  | { kind: "resumed" }
  | { kind: "failed"; reason: FailReason };

/** The log line for a state change. Counts and codes only, never names or ids (docs/ARCHITECTURE.md "Privacy"). */
export function stateText(event: ConnectionEvent): string {
  switch (event.kind) {
    case "connecting":
      return "discord: connecting";
    case "ready":
      return `discord: ready in ${servers(event.servers)}${event.servers > 1 ? ONE_SERVER : ""}`;
    case "joined":
      return `discord: added to a server, now in ${servers(event.servers)}${event.servers > 1 ? ONE_SERVER : ""}`;
    case "left":
      return `discord: removed from a server, now in ${servers(event.servers)}`;
    case "disconnected":
      return `discord: disconnected (close code ${event.code})`;
    case "reconnecting":
      return "discord: reconnecting";
    case "resumed":
      return "discord: resumed";
    case "failed":
      return event.reason === "invalid token"
        ? "discord: the token was refused; check DISCORD_TOKEN (docs/DISCORD-SETUP.md); exiting"
        : event.reason === "disallowed intents"
          ? "discord: the bot asked for an intent the portal doesn't allow (docs/DISCORD-SETUP.md); exiting"
          : "discord: could not connect; exiting";
  }
}

const ONE_SERVER = "; warning: the bot is meant for one server";

function servers(count: number): string {
  return count === 1 ? "1 server" : `${count} servers`;
}

/** Whether the state means the gateway is up (the heartbeat is written only then). */
export function isConnected(event: ConnectionEvent): boolean | undefined {
  if (event.kind === "ready" || event.kind === "resumed") return true;
  if (event.kind === "disconnected" || event.kind === "reconnecting") return false;
  return undefined;
}

/** Seconds before retry `attempt` (1-based): 5, 10, 20 … at most 300. */
export function backoffSeconds(attempt: number): number {
  return Math.min(5 * 2 ** Math.max(0, attempt - 1), MAX_BACKOFF_SECONDS);
}

export const MAX_BACKOFF_SECONDS = 300;

/** How long an event Discord refuses for good waits before it is tried again, while the others go on. */
export const HOLD_MS = 5 * 60_000;

/**
 * Discord's codes that won't change by trying again soon: 10003 unknown channel, 20062 a channel linked to WoW guild
 * chat (Discord lets no bot post there, by design), 40005 too large, 50001 missing access, 50006 empty message, 50008
 * not a text channel, 50013 missing permissions, 50035 invalid form body (e.g. too long). Only someone changing the
 * server, or a newer bot, fixes them.
 */
const LASTING = new Set([10003, 20062, 40005, 50001, 50006, 50008, 50013, 50035]);

/**
 * Whether a refusal won't change by trying again soon: one of Discord's lasting codes, or any other 4xx answer (a code
 * the bot doesn't know yet) except 429, the rate limit. 5xx and no answer at all are passing.
 */
export function isLasting(code: number | string | undefined, status?: number): boolean {
  if (LASTING.has(Number(code))) return true;
  return status !== undefined && status >= 400 && status < 500 && status !== 429;
}

/** After this many lasting refusals of one event in the same channels, the bot gives it up (the others go on). */
export const GIVE_UP_AFTER = 3;

/** Discord's code for a channel linked to WoW guild chat: bots may not post there (discord-api-docs issue 8628). */
export const LINKED_CHANNEL = 20062;

/** What the admin can do about a lasting refusal, for the log; empty when there's nothing specific to say. */
export function refusalHint(code: number | string | undefined): string {
  return Number(code) === LINKED_CHANNEL
    ? "; the channel is linked to WoW guild chat, where Discord lets no bot post: pick another channel on the site's Discord page"
    : "";
}

/** How often the connected bot writes its heartbeat, and how old it may be for the health check. */
export const HEARTBEAT_MS = 15_000;
export const HEARTBEAT_MAX_AGE_MS = 60_000;

/** The health rule: a heartbeat younger than HEARTBEAT_MAX_AGE_MS. */
export function isHealthy(heartbeatMs: number | undefined, nowMs: number): boolean {
  return heartbeatMs !== undefined && nowMs - heartbeatMs >= 0 && nowMs - heartbeatMs < HEARTBEAT_MAX_AGE_MS;
}
