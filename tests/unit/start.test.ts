import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Discord } from "../../src/adapters/discord.js";
import { heartbeatFile, readHeartbeat } from "../../src/adapters/heartbeat.js";
import type { SiteAnswer } from "../../src/adapters/site.js";
import { type Deps, start } from "../../src/app/start.js";
import type { CommandDefinition } from "../../src/core/commands.js";
import type { ConnectionEvent, FailReason } from "../../src/core/connection.js";

// Made-up values only (CLAUDE.md rule 1).
const FULL = {
  DISCORD_TOKEN: "test-discord-token",
  DISCORD_APP_ID: "100000000000000001",
  SITE_URL: "https://example.com/",
  BOT_API_TOKEN: "test-bot-api-token",
};

function logger() {
  const lines: { level: string; text: string }[] = [];
  return {
    lines,
    texts: () => lines.map((l) => l.text),
    log: {
      info: (text: string) => lines.push({ level: "info", text }),
      error: (text: string) => lines.push({ level: "error", text }),
    },
  };
}

class FakeDiscord implements Discord {
  report: (event: ConnectionEvent) => void = () => undefined;
  registered: (readonly CommandDefinition[])[] = [];
  destroyed = false;
  loginResult: Promise<FailReason | undefined> = new Promise(() => undefined);
  registerError = false;
  login = () => this.loginResult;
  registerCommands = async (commands: readonly CommandDefinition[]) => {
    if (this.registerError) throw new Error("rest");
    this.registered.push(commands);
    return commands.length;
  };
  destroy = async () => {
    this.destroyed = true;
  };
}

describe("start", () => {
  let folder: string;
  let file: string;
  let discord: FakeDiscord;
  let answers: SiteAnswer[];
  let deps: Deps;
  let now: number;

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), "cf-bot-test-"));
    file = join(folder, "alive");
    discord = new FakeDiscord();
    answers = [{ ok: true, body: { siteName: "Doombringers" } }];
    now = 1_793_112_000_000;
    deps = {
      discord: (_config, report) => {
        discord.report = report;
        return discord;
      },
      settings: async () => answers.shift() ?? { ok: true, body: {} },
      heartbeat: heartbeatFile(file),
      now: () => now,
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(folder, { recursive: true, force: true });
  });

  it("logs no token and exits cleanly without env", async () => {
    const { lines, log } = logger();
    expect(await start({}, log, deps, new AbortController().signal)).toBe(0);
    expect(lines).toEqual([{ level: "info", text: "no token: set DISCORD_TOKEN (see .env.example); exiting" }]);
  });

  it("fails on an incomplete configuration, without logging any value", async () => {
    const { lines, log } = logger();
    expect(await start({ DISCORD_TOKEN: "test-discord-token" }, log, deps, new AbortController().signal)).toBe(1);
    expect(lines[0]?.level).toBe("error");
    expect(JSON.stringify(lines)).not.toContain("test-discord-token");
  });

  it("connects, registers the commands once, beats while connected and stops gracefully", async () => {
    const { lines, texts, log } = logger();
    const stop = new AbortController();
    const running = start(FULL, log, deps, stop.signal);
    await vi.waitFor(() => expect(texts()).toContain("site: https://example.com answers as Doombringers"));

    discord.report({ kind: "ready", servers: 1 });
    await vi.waitFor(() => expect(discord.registered).toEqual([[]]));
    expect(readHeartbeat(file)).toBe(now);

    discord.report({ kind: "disconnected", code: 1006 });
    now += 20_000;
    discord.report({ kind: "reconnecting" });
    expect(readHeartbeat(file)).toBe(now - 20_000);
    discord.report({ kind: "resumed" });
    expect(readHeartbeat(file)).toBe(now);
    discord.report({ kind: "ready", servers: 1 });
    expect(discord.registered).toHaveLength(1);

    stop.abort();
    expect(await running).toBe(0);
    expect(discord.destroyed).toBe(true);
    expect(readHeartbeat(file)).toBeUndefined();
    expect(texts()).toEqual(
      expect.arrayContaining([
        "discord: connecting",
        "discord: ready in 1 server",
        "discord: registered 0 slash commands",
        "discord: disconnected (close code 1006)",
        "discord: resumed",
        "stopping",
        "stopped",
      ]),
    );
    expect(JSON.stringify(lines)).not.toContain("test-");
  });

  it("exits 1 when Discord refuses the token", async () => {
    const { texts, log } = logger();
    discord.loginResult = Promise.resolve("invalid token");
    expect(await start(FULL, log, deps, new AbortController().signal)).toBe(1);
    expect(texts().some((t) => t.includes("check DISCORD_TOKEN"))).toBe(true);
    expect(discord.destroyed).toBe(true);
  });

  it("keeps running when registering the commands fails", async () => {
    const { texts, log } = logger();
    discord.registerError = true;
    const stop = new AbortController();
    const running = start(FULL, log, deps, stop.signal);
    discord.report({ kind: "ready", servers: 1 });
    await vi.waitFor(() => expect(texts().some((t) => t.includes("registering the slash commands failed"))).toBe(true));
    stop.abort();
    expect(await running).toBe(0);
  });

  it("retries the site with backoff, a refused token at the longest wait, and stops waiting on stop", async () => {
    vi.useFakeTimers();
    const { lines, texts, log } = logger();
    answers = [{ ok: false }, { ok: false, status: 401 }, { ok: true, body: { siteName: "Doombringers" } }];
    const stop = new AbortController();
    const running = start(FULL, log, deps, stop.signal);

    await vi.advanceTimersByTimeAsync(0);
    expect(texts()).toContain("site: https://example.com is not reachable; trying again in 5 s");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(texts()).toContain(
      "site: https://example.com refuses BOT_API_TOKEN (docs/DISCORD-SETUP.md); trying again in 300 s",
    );
    await vi.advanceTimersByTimeAsync(300_000);
    expect(texts()).toContain("site: https://example.com answers as Doombringers");

    stop.abort();
    expect(await running).toBe(0);
    expect(JSON.stringify(lines)).not.toContain("test-");
  });
});
