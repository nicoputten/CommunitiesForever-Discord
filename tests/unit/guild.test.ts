import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guildReporter } from "../../src/app/guildReporter.js";
import { type GuildSnapshot, guildReport, reportText } from "../../src/core/guild.js";
import { FakeDiscord, FakeSite, logger } from "./fakes.js";

// Made-up ids and names (CLAUDE.md rule 1).
const snapshot: GuildSnapshot = {
  channels: [
    { id: "100000000000000013", name: "runs", kind: "text", position: 2, canPost: true },
    { id: "100000000000000011", name: "news", kind: "announcement", position: 0, canPost: true },
    { id: "100000000000000012", name: "general", kind: "text", position: 1, canPost: true },
    { id: "100000000000000014", name: "staff", kind: "text", position: 3, canPost: false },
    { id: "100000000000000015", name: "Voice", kind: "other", position: 4, canPost: true },
  ],
  roles: [
    { id: "100000000000000001", name: "@everyone", position: 0, mentionable: true, managed: false, everyone: true },
    { id: "100000000000000021", name: "Raiders", position: 2, mentionable: true, managed: false, everyone: false },
    { id: "100000000000000022", name: "Quiet", position: 3, mentionable: false, managed: false, everyone: false },
    { id: "100000000000000023", name: "DoomBot", position: 4, mentionable: true, managed: true, everyone: false },
    {
      id: "100000000000000024",
      name: "Dungeon\u0007 crew ",
      position: 5,
      mentionable: true,
      managed: false,
      everyone: false,
    },
  ],
};

describe("guildReport", () => {
  it("keeps text and announcement channels the bot can post in, in order, and roles it can mention", () => {
    expect(guildReport(snapshot)).toEqual({
      channels: [
        { id: "100000000000000011", name: "news" },
        { id: "100000000000000012", name: "general" },
        { id: "100000000000000013", name: "runs" },
      ],
      roles: [
        { id: "100000000000000024", name: "Dungeon crew" },
        { id: "100000000000000021", name: "Raiders" },
      ],
    });
    expect(reportText(guildReport(snapshot))).toBe("site: reported 3 channels and 2 roles");
  });

  it("keeps within the site's limits", () => {
    const many: GuildSnapshot = {
      channels: Array.from({ length: 600 }, (_, i) => ({
        id: String(100000000000000000n + BigInt(i)),
        name: "x".repeat(150),
        kind: "text" as const,
        position: i,
        canPost: true,
      })),
      roles: [],
    };
    const report = guildReport(many);
    expect(report.channels).toHaveLength(500);
    expect(report.channels[0]?.name).toHaveLength(100);
  });
});

describe("guildReporter", () => {
  let site: FakeSite;
  let discord: FakeDiscord;
  let log: ReturnType<typeof logger>;

  beforeEach(() => {
    vi.useFakeTimers();
    site = new FakeSite();
    discord = new FakeDiscord();
    discord.snapshot = snapshot;
    log = logger();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("bundles changes within 5 s into one report, and reports again on a later change", async () => {
    const reporter = guildReporter(site, discord, log.log);
    reporter.changed();
    discord.guildListeners.forEach((l) => l());
    await vi.advanceTimersByTimeAsync(4_000);
    discord.guildListeners.forEach((l) => l());
    await vi.advanceTimersByTimeAsync(4_999);
    expect(site.guildReports).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(site.guildReports).toEqual([guildReport(snapshot)]);
    expect(log.texts()).toEqual(["site: reported 3 channels and 2 roles"]);

    discord.guildListeners.forEach((l) => l());
    await vi.advanceTimersByTimeAsync(5_000);
    expect(site.guildReports).toHaveLength(2);
    reporter.stop();
    expect(discord.guildListeners.size).toBe(0);
  });

  it("says once that an older site has no endpoint, and doesn't retry until a change", async () => {
    site.guildStatus = 404;
    const reporter = guildReporter(site, discord, log.log);
    reporter.changed();
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.advanceTimersByTimeAsync(600_000);
    reporter.changed();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(log.texts()).toEqual(["site: has no guild endpoint yet (an older site); channels and roles not reported"]);
    site.guildStatus = undefined;
    reporter.changed();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(site.guildReports).toHaveLength(1);
    reporter.stop();
  });

  it("retries other failures with backoff", async () => {
    site.guildStatus = 502;
    const reporter = guildReporter(site, discord, log.log);
    reporter.changed();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(log.texts()).toEqual(["site: reporting channels and roles failed; trying again in 5 s"]);
    site.guildStatus = undefined;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(site.guildReports).toHaveLength(1);
    reporter.stop();
  });

  it("reports nothing when the bot is in no server, and nothing after stop", async () => {
    discord.snapshot = undefined;
    const reporter = guildReporter(site, discord, log.log);
    reporter.changed();
    await vi.advanceTimersByTimeAsync(5_000);
    discord.snapshot = snapshot;
    reporter.stop();
    reporter.changed();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(site.guildReports).toHaveLength(0);
  });
});
