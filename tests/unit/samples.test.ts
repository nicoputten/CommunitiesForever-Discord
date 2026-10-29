import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runPoster } from "../../src/app/poster.js";
import { markedEvents } from "../../src/core/message.js";
import { TEST_FOOTER, testFiles, testSample } from "../../src/core/samples.js";
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
    expect(testSample("feats", 70, SITE, HOST, NOW, PAGE).embeds[0]?.title).toBe("Test · Feat unlocked · Stone Guard");
    const recap = testSample("recap", 71, SITE, HOST, NOW, PAGE);
    expect(recap.embeds[0]?.title).toBe("Test · Weekly recap · week 1");
    expect(recap.embeds.map((e) => e.title)).toContain("Doomsday · this week");
    // Only test posts carry the "not real" footer (BOT-20).
    expect(recap.embeds.at(-1)?.footer).toEqual({ text: TEST_FOOTER });
    const board = testSample("doomsday", 72, SITE, HOST, NOW, PAGE);
    expect(board.embeds[0]?.title).toBe("Test · Doomsday · Test day");
    expect(board.components?.[0]?.components).toEqual([{ type: 2, style: 5, label: "Open the board ↗", url: PAGE }]);
  });

  it("attaches the bot's own pictures, never the site's (BOT-20)", () => {
    expect(testFiles("feats")).toEqual([{ name: "class-warlock.png", asset: "class-icons/warlock.png" }]);
    expect(testFiles("recap")).toEqual([
      { name: "recap_pvp.png", asset: "recap-icons/recap_pvp.png" },
      { name: "recap_deaths.png", asset: "recap-icons/recap_deaths.png" },
    ]);
    expect(testFiles("doomsday")).toEqual([]);
    const feat = testSample("feats", 70, SITE, HOST, NOW, PAGE, ["class-warlock.png"]).embeds[0];
    expect(feat?.author).toEqual({ name: "Testy McTestface", icon_url: "attachment://class-warlock.png" });
    const recap = testSample("recap", 71, SITE, HOST, NOW, PAGE, ["recap_deaths.png"]);
    expect(recap.embeds.some((e) => e.thumbnail?.url === "attachment://recap_deaths.png")).toBe(true);
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
    // The test feat carries the class icon of its author line, read from assets/ (BOT-20).
    expect(discord.messages[0]?.files).toEqual(["class-warlock.png"]);
    expect(discord.messages.map((m) => [m.channel, m.content.embeds[0]?.title])).toEqual([
      [CHANNEL, "Test · Feat unlocked · Stone Guard"],
      [RECAP, "Test · Weekly recap · week 1"],
      [DOOM, "Test · Doomsday · Test day"],
      [CHANNEL, "Test post"],
      [CHANNEL, "Test post"],
    ]);
    stop.abort();
    await running;
  });
});

describe("test posts use the channel just picked (BOT-19)", () => {
  const NEW = "100000000000000007";
  let site: FakeSite;
  let discord: FakeDiscord;
  let stop: AbortController;
  let log: ReturnType<typeof logger>;

  beforeEach(() => {
    vi.useFakeTimers();
    site = new FakeSite();
    discord = new FakeDiscord();
    stop = new AbortController();
    log = logger();
    site.settingsBody = { posts: { milestones: true }, channels: { posts: CHANNEL, feats: FEATS } };
  });

  afterEach(() => {
    stop.abort();
    vi.useRealTimers();
  });

  const run = () => runPoster({ siteUrl: SITE, site, discord, log: log.log, now: () => NOW * 1000 }, stop.signal);

  it("reads the settings again for a test, right after the admin changed the channel", async () => {
    const running = run();
    // The bot has read the settings and waits for events.
    await vi.waitFor(() => expect(site.waiting.length).toBe(1));
    site.settingsBody = { posts: { milestones: true }, channels: { posts: CHANNEL, feats: NEW } };
    site.add({ id: 30, type: "test", data: { kind: "feats" } });
    await vi.waitFor(() => expect(site.acked.size).toBe(1));
    expect(discord.messages.map((m) => [m.channel, m.content.embeds[0]?.title])).toEqual([
      [NEW, "Test · Feat unlocked · Stone Guard"],
    ]);
    stop.abort();
    await running;
  });

  it("posts with the settings it has when reading them again fails, and says so", async () => {
    const running = run();
    await vi.waitFor(() => expect(site.waiting.length).toBe(1));
    site.settingsBody = { posts: { milestones: true }, channels: { posts: CHANNEL, feats: NEW } };
    site.settingsDown = 1;
    site.add({ id: 31, type: "test", data: { kind: "feats" } });
    await vi.waitFor(() => expect(site.acked.size).toBe(1));
    expect(discord.messages.map((m) => m.channel)).toEqual([FEATS]);
    expect(log.texts()).toContain(
      "site: https://example.com is not reachable; posting test event 31 with the settings read before",
    );
    stop.abort();
    await running;
  });

  it("reads the settings once for a test, not for other events", async () => {
    let reads = 0;
    const settings = site.settings.bind(site);
    site.settings = async () => {
      reads++;
      return settings();
    };
    const running = run();
    await vi.waitFor(() => expect(site.waiting.length).toBe(1));
    site.add(milestonesEvent(32));
    await vi.waitFor(() => expect(site.acked.size).toBe(1));
    expect(reads).toBe(1);
    site.add({ id: 33, type: "test", data: { kind: "posts" } });
    await vi.waitFor(() => expect(site.acked.size).toBe(2));
    expect(reads).toBe(2);
    stop.abort();
    await running;
  });
});

describe("test samples with the site's sample images (BOT-21, web WEB-68)", () => {
  const images = {
    board: "sample-board",
    feat: "sample-feat-big",
    strip: "sample-feat-strip",
    award: "sample-recap-header",
    zone: "sample-recap-zone",
  };

  it("names the site's images where a real post has its own, besides the bot's pictures", () => {
    expect(testFiles("doomsday", images)).toEqual([{ name: "sample-board.png", path: "cards/sample-board.png" }]);
    expect(testFiles("feats", images)).toEqual([
      { name: "sample-feat-big.png", path: "cards/sample-feat-big.png" },
      { name: "class-warlock.png", asset: "class-icons/warlock.png" },
    ]);
    expect(testFiles("recap", images).map((f) => f.name)).toEqual([
      "sample-recap-header.png",
      "sample-recap-zone.png",
      "recap_pvp.png",
      "recap_deaths.png",
    ]);
    // Without images, only the bot's own pictures (never a real recap's header).
    expect(testFiles("recap").every((f) => "asset" in f)).toBe(true);
    expect(testFiles("doomsday")).toEqual([]);
  });

  it("shows them like the real posts, keeping the test marks", () => {
    const board = testSample("doomsday", 80, SITE, HOST, NOW, PAGE, ["sample-board.png"], images);
    expect(board.embeds[0]?.image).toEqual({ url: "attachment://sample-board.png" });
    expect(board.embeds[0]?.description).not.toContain("**Test Friend**");
    expect(board.embeds[0]?.footer).toEqual({ text: TEST_FOOTER });
    const feat = testSample("feats", 81, SITE, HOST, NOW, PAGE, ["sample-feat-big.png", "class-warlock.png"], images);
    expect(feat.embeds[0]).toMatchObject({
      title: "Test · Feat unlocked · Stone Guard",
      image: { url: "attachment://sample-feat-big.png" },
      footer: { text: TEST_FOOTER },
    });
    const recap = testSample(
      "recap",
      82,
      SITE,
      HOST,
      NOW,
      PAGE,
      ["sample-recap-header.png", "sample-recap-zone.png"],
      images,
    );
    expect(recap.embeds[1]?.image).toEqual({ url: "attachment://sample-recap-header.png" });
    expect(recap.embeds[2]).toMatchObject({
      title: "Bloodbath zone",
      image: { url: "attachment://sample-recap-zone.png" },
    });
    expect(recap.embeds.at(-1)?.footer).toEqual({ text: TEST_FOOTER });
  });

  it("falls back to today's samples when the site can't give an image", () => {
    const board = testSample("doomsday", 83, SITE, HOST, NOW, PAGE, [], images);
    expect(board.embeds[0]?.image).toBeUndefined();
    expect(board.embeds[0]?.description).toContain("**Test Friend**");
    const feat = testSample("feats", 84, SITE, HOST, NOW, PAGE, [], images);
    expect(feat.embeds[0]?.image).toBeUndefined();
  });

  describe("through the poster", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("fetches the site's sample images with the token and attaches them, posted once", async () => {
      const site = new FakeSite();
      const discord = new FakeDiscord();
      const stop = new AbortController();
      const png = new Uint8Array([137, 80, 78, 71]);
      site.images.set("cards/sample-board.png", png);
      site.images.set("cards/sample-feat-big.png", png);
      site.settingsBody = { channels: { posts: CHANNEL } };
      site.add({ id: 90, type: "test", data: { kind: "doomsday", images: { board: "sample-board" } } });
      site.add({
        id: 91,
        type: "test",
        data: { kind: "feats", images: { feat: "sample-feat-big", strip: "sample-feat-strip" } },
      });
      // An older site: no images, the text board as before.
      site.add({ id: 92, type: "test", data: { kind: "doomsday" } });
      const running = runPoster(
        { siteUrl: SITE, site, discord, log: logger().log, now: () => NOW * 1000 },
        stop.signal,
      );
      await vi.waitFor(() => expect(site.acked.size).toBe(3));
      expect(discord.messages.map((m) => m.files)).toEqual([
        ["sample-board.png"],
        ["sample-feat-big.png", "class-warlock.png"],
        [],
      ]);
      expect(discord.messages[0]?.content.embeds[0]?.image).toEqual({ url: "attachment://sample-board.png" });
      expect(discord.messages[2]?.content.embeds[0]?.image).toBeUndefined();
      stop.abort();
      await running;
    });
  });
});
