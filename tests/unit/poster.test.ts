import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runPoster } from "../../src/app/poster.js";
import { CHANNEL, FakeDiscord, FakeSite, logger, milestonesEvent } from "./fakes.js";

const SITE = "https://example.com";

describe("runPoster", () => {
  let site: FakeSite;
  let discord: FakeDiscord;
  let now: number;
  let stop: AbortController;
  let log: ReturnType<typeof logger>;

  beforeEach(() => {
    vi.useFakeTimers();
    site = new FakeSite();
    discord = new FakeDiscord();
    now = 1_793_112_000_000;
    stop = new AbortController();
    log = logger();
  });

  afterEach(() => {
    stop.abort();
    vi.useRealTimers();
  });

  const run = () => runPoster({ siteUrl: SITE, site, discord, log: log.log, now: () => now }, stop.signal);

  it("adds uploads within 5 minutes to the open post, and starts a new post after that", async () => {
    site.add(milestonesEvent(1));
    site.add(milestonesEvent(2, "Ves Doombringer"));
    const running = run();
    await vi.waitFor(() => expect(site.acked.size).toBe(2));
    now += 4 * 60_000;
    site.add(milestonesEvent(3, "Lia Thornwhisper"));
    await vi.waitFor(() => expect(site.acked.size).toBe(3));

    expect(discord.messages).toHaveLength(1);
    expect(discord.edits).toBe(2);
    const first = discord.messages[0];
    expect([...site.acked.values()]).toEqual([first?.id, first?.id, first?.id]);
    const text = first?.content.embeds[0]?.description ?? "";
    expect(text.indexOf("Mira")).toBeLessThan(text.indexOf("Ves"));
    expect(text.indexOf("Ves")).toBeLessThan(text.indexOf("Lia"));
    expect(text).toContain("#e1)");
    expect(text).toContain("#e2)");
    expect(text).toContain("#e3)");
    expect(log.texts()).toContain("added event 3 to the post of event 1");

    // 5 minutes after the first post: a new post.
    now += 60_000;
    site.add(milestonesEvent(4));
    await vi.waitFor(() => expect(site.acked.size).toBe(4));
    expect(discord.messages).toHaveLength(2);
    expect(site.acked.get(4)).toBe(discord.messages[1]?.id);
    stop.abort();
    await running;
  });

  it("starts a new post when the open one would hold more than 10 milestones", async () => {
    const running = run();
    for (let id = 1; id <= 11; id++) site.add(milestonesEvent(id));
    await vi.waitFor(() => expect(site.acked.size).toBe(11));
    expect(discord.messages).toHaveLength(2);
    expect(site.acked.get(10)).toBe(discord.messages[0]?.id);
    expect(site.acked.get(11)).toBe(discord.messages[1]?.id);
    stop.abort();
    await running;
  });

  it("posts anew when the open post can't be edited, for example after it was deleted", async () => {
    site.add(milestonesEvent(1));
    const running = run();
    await vi.waitFor(() => expect(site.acked.size).toBe(1));
    discord.editFailures = 1;
    site.add(milestonesEvent(2));
    await vi.waitFor(() => expect(site.acked.size).toBe(2));
    expect(discord.messages).toHaveLength(2);
    expect(log.texts()).toContain("discord: adding event 2 to the open post failed (code 10008); posting it");
    stop.abort();
    await running;
  });

  it("after a restart, acknowledges an event that was added to a post but not acknowledged", async () => {
    site.add(milestonesEvent(1));
    let running = run();
    await vi.waitFor(() => expect(site.acked.size).toBe(1));
    site.ackDown = 1;
    site.add(milestonesEvent(2));
    await vi.waitFor(() => expect(log.texts()).toContain("site: acknowledging event 2 failed; trying again in 5 s"));
    stop.abort();
    await running;

    stop = new AbortController();
    running = run();
    await vi.waitFor(() => expect(site.acked.get(2)).toBe(discord.messages[0]?.id));
    expect(discord.messages).toHaveLength(1);
    stop.abort();
    await running;
  });

  it("after a restart between post and acknowledge, only acknowledges what is already in the channel", async () => {
    site.add(milestonesEvent(7));
    site.ackDown = 1;
    let running = run();
    await vi.waitFor(() => expect(discord.messages).toHaveLength(1));
    await vi.waitFor(() => expect(log.texts()).toContain("site: acknowledging event 7 failed; trying again in 5 s"));
    stop.abort();
    await running;

    stop = new AbortController();
    running = run();
    await vi.waitFor(() => expect(site.acked.get(7)).toBe(discord.messages[0]?.id));
    expect(discord.messages).toHaveLength(1);
    stop.abort();
    await running;
  });

  it("retries a post Discord can't take right now with backoff and posts it once Discord accepts", async () => {
    discord.postFailures = 2;
    discord.postFailCode = 130000;
    site.add(milestonesEvent(4));
    const running = run();
    // The post reads its class icon from assets/ first (BOT-20), so each step waits for the log.
    await vi.waitFor(() =>
      expect(log.texts()).toContain("discord: posting event 4 failed (code 130000); trying again in 5 s"),
    );
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.waitFor(() =>
      expect(log.texts()).toContain("discord: posting event 4 failed (code 130000); trying again in 10 s"),
    );
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.waitFor(() => expect(site.acked.has(4)).toBe(true));
    expect(discord.messages).toHaveLength(1);
    stop.abort();
    await running;
  });

  it("reads the channel for markers again after a post without an answer, so it never posts twice", async () => {
    discord.postsLost = 1;
    site.add(milestonesEvent(4));
    const running = run();
    await vi.waitFor(() =>
      expect(log.texts()).toContain("discord: posting event 4 failed (code none); trying again in 5 s"),
    );
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.waitFor(() => expect(site.acked.get(4)).toBe(discord.messages[0]?.id));
    expect(discord.messages).toHaveLength(1);
    stop.abort();
    await running;
  });

  it("holds an event Discord refuses for good, posts the others, and tries the held one again after 5 minutes", async () => {
    discord.postFailures = 1;
    site.add(milestonesEvent(4));
    site.add(milestonesEvent(5, "Tok Ironhide"));
    const running = run();
    await vi.waitFor(() => expect(site.acked.has(5)).toBe(true));
    expect(site.acked.has(4)).toBe(false);
    expect(log.texts()).toContain(
      "discord: posting event 4 failed (code 50013); trying it again in 5 min, the others go on",
    );

    // After 5 minutes (the next answer of the long poll) the held event is tried again.
    now += 5 * 60_000;
    site.add(milestonesEvent(6, "Bob Example"));
    await vi.waitFor(() => expect(site.acked.has(4)).toBe(true));
    expect(site.acked.has(6)).toBe(true);
    expect(discord.messages).toHaveLength(2);
    stop.abort();
    await running;
  });

  it("gives up a post Discord refuses in a WoW-linked channel (20062) after 3 tries, the others go on", async () => {
    discord.postFailCode = 20062;
    discord.refuse = (channel, texts) => channel === CHANNEL && texts.some((t) => t.endsWith("#e4"));
    site.add(milestonesEvent(4));
    const running = run();
    await vi.waitFor(() =>
      expect(log.texts()).toContain(
        "discord: posting event 4 failed (code 20062); the channel is linked to WoW guild chat, where Discord lets no bot post: pick another channel on the site's Discord page; trying it again in 5 min, the others go on",
      ),
    );
    const tries = () => log.texts().filter((t) => t.startsWith("discord: posting event 4 failed")).length;
    // Every 5 minutes (the next answer of the long poll) it is tried again, while the other posts go out (test posts
    // here, so event 4 isn't added to an open feat post).
    for (let i = 0; i < 2; i++) {
      now += 5 * 60_000;
      site.add({ id: 10 + i, type: "test", data: { kind: "posts" } });
      await vi.waitFor(() => expect(site.acked.has(10 + i)).toBe(true));
      await vi.waitFor(() => expect(tries()).toBe(2 + i));
    }
    await vi.waitFor(() =>
      expect(log.texts()).toContain(
        "discord: posting event 4 failed (code 20062); the channel is linked to WoW guild chat, where Discord lets no bot post: pick another channel on the site's Discord page; refused 3 times, so it is skipped until the channels change or the bot restarts",
      ),
    );

    // Given up: later events still go out, event 4 is not tried again.
    now += 10 * 60_000;
    site.add({ id: 20, type: "test", data: { kind: "posts" } });
    await vi.waitFor(() => expect(site.acked.has(20)).toBe(true));
    expect(site.acked.has(4)).toBe(false);
    expect(tries()).toBe(3);

    // Another channel picked on the site: event 4 gets a fresh chance there.
    const OTHER = "100000000000000009";
    site.settingsBody = { siteName: "Doombringers", posts: { milestones: true }, channels: { posts: OTHER } };
    now += 30_000;
    site.add({ id: 21, type: "test", data: { kind: "posts" } });
    await vi.waitFor(() => expect(site.acked.has(4)).toBe(true));
    expect(discord.messages.find((m) => m.id === site.acked.get(4))?.channel).toBe(OTHER);
    stop.abort();
    await running;
  });

  it("goes on with the other channels when one can't be read", async () => {
    const DOOMSDAY = "100000000000000003";
    site.settingsBody = {
      siteName: "Doombringers",
      posts: { milestones: true },
      channels: { posts: CHANNEL, doomsday: DOOMSDAY },
    };
    discord.unreadable.add(DOOMSDAY);
    site.add(milestonesEvent(4));
    const running = run();
    await vi.waitFor(() => expect(site.acked.has(4)).toBe(true));
    expect(log.texts()).toContain(
      "discord: the Doomsday channel can't be read (code 50001); its posts wait, the others go on",
    );
    stop.abort();
    await running;
  });

  it("waits out a site outage, a refused token at the longest wait", async () => {
    site.settingsDown = 1;
    site.eventsDown = 1;
    site.add(milestonesEvent(5));
    const running = run();
    await vi.advanceTimersByTimeAsync(0);
    expect(log.texts()).toContain("site: https://example.com is not reachable; trying again in 5 s");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(log.texts()).toContain("site: https://example.com answers 502; trying again in 10 s");
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.waitFor(() => expect(site.acked.has(5)).toBe(true));
    stop.abort();
    await running;
  });

  it("posts nothing without a posts channel, and starts once the admin picks one", async () => {
    site.settingsBody = { siteName: "Doombringers", posts: { milestones: true }, channels: { posts: null } };
    site.add(milestonesEvent(6));
    const running = run();
    await vi.advanceTimersByTimeAsync(0);
    expect(log.texts()).toContain("site: https://example.com answers as Doombringers; posts channel not set");
    expect(discord.messages).toHaveLength(0);

    site.settingsBody = { siteName: "Doombringers", posts: { milestones: true }, channels: { posts: CHANNEL } };
    now += 30_000;
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.waitFor(() => expect(site.acked.has(6)).toBe(true));
    stop.abort();
    await running;
  });

  it("leaves milestones when they are off, and unknown event types always", async () => {
    site.settingsBody = { posts: { milestones: false }, channels: { posts: CHANNEL } };
    site.add(milestonesEvent(8));
    site.add({ id: 9, type: "runPosted", data: {} });
    const running = run();
    await vi.advanceTimersByTimeAsync(0);
    expect(discord.messages).toHaveLength(0);
    expect(site.acked.size).toBe(0);
    stop.abort();
    await running;
  });

  it("attaches the site's card to a level 60 post, and keeps it when a later upload is added (BOT-05)", async () => {
    site.images.set("cards/milestone-30-0.png", new Uint8Array([1]));
    site.add({
      id: 30,
      type: "milestones",
      data: {
        milestones: [
          {
            kind: "maxLevel",
            character: { guid: "G-30", name: "Mira Sunstrider", classFile: "MAGE" },
            level: 60,
            from: 59,
          },
        ],
      },
    });
    const running = run();
    await vi.waitFor(() => expect(site.acked.size).toBe(1));
    // BOT-20: the card and the class icon of the author line.
    expect(discord.messages[0]?.files).toEqual(["milestone-30-0.png", "class-mage.png"]);
    expect(discord.messages[0]?.content.embeds[0]?.image).toEqual({ url: "attachment://milestone-30-0.png" });
    expect(discord.messages[0]?.content.embeds[0]?.author).toEqual({
      name: "Mira Sunstrider",
      icon_url: "attachment://class-mage.png",
    });
    site.add(milestonesEvent(31, "Ves Doombringer"));
    await vi.waitFor(() => expect(site.acked.size).toBe(2));
    expect(discord.edits).toBe(1);
    expect(discord.messages[0]?.content.embeds[0]?.image).toEqual({ url: "attachment://milestone-30-0.png" });
    // Two characters now: no author line, so the class icon goes (Discord would show it as a loose file).
    expect(discord.messages[0]?.files).toEqual(["milestone-30-0.png"]);
    stop.abort();
    await running;
  });

  describe("the weekly recap (BOT-05)", () => {
    const RECAP_CHANNEL = "100000000000000003";
    const recapEvent = (id: number, week = 3, zone = true) => ({
      id,
      type: "recap",
      data: {
        week,
        headline: { id: "levels", text: "18 levels and a lot of Duskwood" },
        numbers: { levels: 18, friendsPlayed: 5, runs: 7, newCharacters: 1 },
        cards: zone
          ? [{ id: "S1", slot: "stat", name: "Zone of the week", title: "Duskwood", text: "3 friends." }]
          : [],
        challenge: { id: "threeEvenings", text: "Log in on 3 evenings" },
        closing: "See you next week.",
      },
    });
    const png = new Uint8Array([137, 80, 78, 71]);

    it("posts the recap in the recap channel with its card images, once", async () => {
      site.settingsBody = { posts: { recap: true }, channels: { posts: CHANNEL, recap: RECAP_CHANNEL } };
      site.images.set("cards/recap-3-header.png", png);
      site.images.set("cards/recap-3-zone.png", png);
      site.add(recapEvent(20));
      const running = run();
      await vi.waitFor(() => expect(site.acked.size).toBe(1));
      expect(discord.messages).toHaveLength(1);
      const post = discord.messages[0]!;
      expect(post.channel).toBe(RECAP_CHANNEL);
      expect(post.files).toEqual(["recap-3-header.png", "recap-3-zone.png"]);
      // No award: the header image on top (BOT-20).
      expect(post.content.embeds[0]).toMatchObject({
        title: "Weekly recap · week 3",
        description: "**18 levels and a lot of Duskwood**",
        image: { url: "attachment://recap-3-header.png" },
      });
      expect(site.acked.get(20)).toBe(post.id);
      expect(log.texts()).toContain("posted event 20 (recap of week 3)");
      stop.abort();
      await running;
    });

    it("posts in the posts channel when no recap channel is set, without an image the site can't give", async () => {
      site.add(recapEvent(21, 4, false));
      const running = run();
      await vi.waitFor(() => expect(site.acked.size).toBe(1));
      expect(discord.messages[0]).toMatchObject({ channel: CHANNEL, files: [] });
      expect(discord.messages[0]?.content.embeds[0]?.image).toBeUndefined();
      expect(log.texts()).toContain("site: card image recap-4-header.png unavailable; posting the recap without it");
      stop.abort();
      await running;
    });

    it("after a restart, finds the recap in the recap channel and only acknowledges it", async () => {
      site.settingsBody = { posts: { recap: true }, channels: { posts: CHANNEL, recap: RECAP_CHANNEL } };
      site.add(recapEvent(22));
      site.ackDown = 1;
      let running = run();
      await vi.waitFor(() => expect(discord.messages).toHaveLength(1));
      await vi.waitFor(() =>
        expect(log.texts().some((t) => t.startsWith("site: acknowledging event 22 failed"))).toBe(true),
      );
      stop.abort();
      await running;

      stop = new AbortController();
      running = run();
      await vi.waitFor(() => expect(site.acked.get(22)).toBe(discord.messages[0]?.id));
      expect(discord.messages).toHaveLength(1);
      stop.abort();
      await running;
    });

    it("leaves the recap while it is off on the site", async () => {
      site.settingsBody = { posts: { recap: false }, channels: { posts: CHANNEL } };
      site.add(recapEvent(23));
      const running = run();
      await vi.advanceTimersByTimeAsync(0);
      expect(discord.messages).toHaveLength(0);
      expect(site.acked.size).toBe(0);
      stop.abort();
      await running;
    });
  });
});
