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

/** How often the connected bot writes its heartbeat, and how old it may be for the health check. */
export const HEARTBEAT_MS = 15_000;
export const HEARTBEAT_MAX_AGE_MS = 60_000;

/** The health rule: a heartbeat younger than HEARTBEAT_MAX_AGE_MS. */
export function isHealthy(heartbeatMs: number | undefined, nowMs: number): boolean {
  return heartbeatMs !== undefined && nowMs - heartbeatMs >= 0 && nowMs - heartbeatMs < HEARTBEAT_MAX_AGE_MS;
}
