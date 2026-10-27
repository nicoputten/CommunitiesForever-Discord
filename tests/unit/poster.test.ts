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

  it("retries a refused post with backoff and posts it once Discord accepts", async () => {
    discord.postFailures = 2;
    site.add(milestonesEvent(4));
    const running = run();
    await vi.advanceTimersByTimeAsync(0);
    expect(log.texts()).toContain("discord: posting event 4 failed (code 50013); trying again in 5 s");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(log.texts()).toContain("discord: posting event 4 failed (code 50013); trying again in 10 s");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(site.acked.has(4)).toBe(true);
    expect(discord.messages).toHaveLength(1);
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
    expect(site.acked.has(5)).toBe(true);
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
    now += 5 * 60_000;
    await vi.advanceTimersByTimeAsync(5 * 60_000);
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
});
