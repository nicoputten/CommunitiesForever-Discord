import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runPoster } from "../../src/app/poster.js";
import { markedEvents } from "../../src/core/message.js";
import { TEST_FOOTER, testSample } from "../../src/core/samples.js";
import { readSettings } from "../../src/core/settings.js";
import { CHANNEL, FakeDiscord, FakeSite, logger, milestonesEvent } from "./fakes.js";

// BOT-17: the feats channel and the test posts per kind (web WEB-58 part 2). Made-up ids (CLAUDE.md rule 1).
const SITE = "https://example.com";
const HOST = "example.com";
const PAGE = "https://example.com/doomsday";
const FEATS = "100000000000000004";
const RECAP = "100000000000000005";
const DOOM = "100000000000000006";
const NOW = 1_793_240_000;

const texts = (m: { embeds: { url?: string; description?: string; fields?: { value: string }[] }[] }) =>
  m.embeds.flatMap((e) => [e.url ?? "", e.description ?? "", ...(e.fields ?? []).map((f) => f.value)]);

describe("test samples (BOT-17)", () => {
  for (const kind of ["feats", "recap", "doomsday"] as const) {
    it(`marks the ${kind} sample as a test, made up, without images, posted once`, () => {
      const sample = testSample(kind, 70, SITE, HOST, NOW, PAGE);
      expect(sample.embeds[0]?.title).toMatch(/^Test · /);
      expect(sample.embeds.at(-1)?.footer).toEqual({ text: TEST_FOOTER });
      expect(sample.embeds.every((e) => e.image === undefined)).toBe(true);
      expect(sample.allowed_mentions).toEqual({ parse: [] });
      expect(markedEvents(SITE, [{ id: "9", texts: texts(sample) }]).get(70)).toBe("9");
      // Only made-up names.
      const all = JSON.stringify(sample);
      expect(all).toMatch(/Testy McTestface|Test Friend/);
    });
  }

  it("has the feat, the recap's Doomsday section, and a board with only the link", () => {
    expect(testSample("feats", 70, SITE, HOST, NOW, PAGE).embeds[0]?.title).toBe("Test · Feat unlocked");
    const recap = testSample("recap", 71, SITE, HOST, NOW, PAGE);
    expect(recap.embeds[0]?.title).toBe("Test · A week of tests");
    expect(recap.embeds.at(-1)?.fields?.map((f) => f.name)).toContain("Doomsday · this week");
    const board = testSample("doomsday", 72, SITE, HOST, NOW, PAGE);
    expect(board.embeds[0]?.title).toBe("Test · Doomsday · Test day");
    expect(board.components?.[0]?.components).toEqual([{ type: 2, style: 5, label: "Open the board ↗", url: PAGE }]);
  });

  it("reads the feats channel", () => {
    expect(readSettings({ channels: { feats: FEATS } }).featsChannel).toBe(FEATS);
    expect(readSettings({ channels: { feats: null } }).featsChannel).toBeNull();
    expect(readSettings({ channels: {} }).featsChannel).toBeUndefined();
  });
});

describe("the feats channel and test posts in the poster (BOT-17)", () => {
  let site: FakeSite;
  let discord: FakeDiscord;
  let now: number;
  let stop: AbortController;

  beforeEach(() => {
    vi.useFakeTimers();
    site = new FakeSite();
    discord = new FakeDiscord();
    now = NOW * 1000;
    stop = new AbortController();
  });

  afterEach(() => {
    stop.abort();
    vi.useRealTimers();
  });

  const run = () => runPoster({ siteUrl: SITE, site, discord, log: logger().log, now: () => now }, stop.signal);

  it("posts feats in the feats channel and adds later uploads to that post", async () => {
    site.settingsBody = { posts: { milestones: true }, channels: { posts: CHANNEL, feats: FEATS } };
    site.add(milestonesEvent(1));
    const running = run();
    await vi.waitFor(() => expect(site.acked.size).toBe(1));
    site.add(milestonesEvent(2, "Ves Doombringer"));
    await vi.waitFor(() => expect(site.acked.size).toBe(2));
    expect(discord.messages.map((m) => m.channel)).toEqual([FEATS]);
    expect(discord.edits).toBe(1);
    stop.abort();
    await running;
  });

  it("finds a feats post in the feats channel after a restart, and posts feats without a posts channel", async () => {
    site.settingsBody = { posts: { milestones: true }, channels: { posts: null, feats: FEATS } };
    const posted = await discord.post(FEATS, {
      embeds: [{ description: "[x](https://example.com/character/Player-1-3#e3)", color: 0 }],
      allowed_mentions: { parse: [] },
    });
    site.add(milestonesEvent(3));
    site.add(milestonesEvent(4));
    const running = run();
    await vi.waitFor(() => expect(site.acked.size).toBe(2));
    expect(site.acked.get(3)).toBe(posted);
    expect(discord.messages.map((m) => m.channel)).toEqual([FEATS, FEATS]);
    stop.abort();
    await running;
  });

  it("posts each test kind in its channel, falls back to the posts channel, and an unknown kind as the plain test", async () => {
    site.settingsBody = { channels: { posts: CHANNEL, recap: RECAP, doomsday: DOOM, feats: null } };
    site.add({ id: 10, type: "test", data: { kind: "feats" } });
    site.add({ id: 11, type: "test", data: { kind: "recap" } });
    site.add({ id: 12, type: "test", data: { kind: "doomsday" } });
    site.add({ id: 13, type: "test", data: { kind: "somethingNew" } });
    site.add({ id: 14, type: "test", data: { kind: "posts" } });
    const running = run();
    await vi.waitFor(() => expect(site.acked.size).toBe(5));
    expect(discord.messages.map((m) => [m.channel, m.content.embeds[0]?.title])).toEqual([
      [CHANNEL, "Test · Feat unlocked"],
      [RECAP, "Test · A week of tests"],
      [DOOM, "Test · Doomsday · Test day"],
      [CHANNEL, "Test post"],
      [CHANNEL, "Test post"],
    ]);
    stop.abort();
    await running;
  });
});
