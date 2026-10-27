// The heartbeat file the container's health check reads (BOT-02): the bot needs no inbound port for it.
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const HEARTBEAT_FILE = join(tmpdir(), "communitiesforever-bot.alive");

export interface Heartbeat {
  write(nowMs: number): void;
  remove(): void;
}

export function heartbeatFile(path = HEARTBEAT_FILE): Heartbeat {
  return {
    write: (nowMs) => writeFileSync(path, String(nowMs)),
    remove: () => rmSync(path, { force: true }),
  };
}

/** The last heartbeat in ms since the epoch; undefined without a readable one. */
export function readHeartbeat(path = HEARTBEAT_FILE): number | undefined {
  try {
    const value = Number(readFileSync(path, "utf8").trim());
    return Number.isFinite(value) ? value : undefined;
  } catch {
    return undefined;
  }
}
