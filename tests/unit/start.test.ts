import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { heartbeatFile, readHeartbeat } from "../../src/adapters/heartbeat.js";
import { type Deps, start } from "../../src/app/start.js";
import { COMMANDS } from "../../src/core/commands.js";
import { FakeDiscord, FakeSite, logger, milestonesEvent } from "./fakes.js";

// Made-up values only (CLAUDE.md rule 1).
const FULL = {
  DISCORD_TOKEN: "test-discord-token",
  DISCORD_APP_ID: "100000000000000001",
  SITE_URL: "https://example.com/",
  BOT_API_TOKEN: "test-bot-api-token",
};

describe("start", () => {
  let folder: string;
  let file: string;
  let discord: FakeDiscord;
  let site: FakeSite;
  let deps: Deps;
  let now: number;

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), "cf-bot-test-"));
    file = join(folder, "alive");
    discord = new FakeDiscord();
    site = new FakeSite();
    now = 1_793_112_000_000;
    deps = {
      discord: (_config, report) => {
        discord.report = report;
        return discord;
      },
      site: () => site,
      heartbeat: heartbeatFile(file),
      now: () => now,
    };
  });

  afterEach(() => {
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

  it("connects, registers the commands, posts once ready, beats while connected and stops gracefully", async () => {
    const { lines, texts, log } = logger();
    const stop = new AbortController();
    site.add(milestonesEvent(12));
    const running = start({ ...FULL, APP_VERSION: "v0.1.0" }, log, deps, stop.signal);

    discord.report({ kind: "ready", servers: 1 });
    await vi.waitFor(() => expect(site.acked.has(12)).toBe(true));
    expect(texts()[0]).toBe("version v0.1.0");
    expect(discord.registered).toEqual([COMMANDS]);
    expect(texts()).toContain("site: https://example.com answers as Doombringers; posts channel set");
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
        "discord: registered 7 slash commands",
        "posted event 12",
        "stopping",
        "stopped",
      ]),
    );
    expect(JSON.stringify(lines)).not.toContain("test-");
    expect(JSON.stringify(lines)).not.toContain("100000000000000002");
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
});
