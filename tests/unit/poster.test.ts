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

  it("posts each event once, in order, and acknowledges it with the message id", async () => {
    site.add(milestonesEvent(1));
    site.add(milestonesEvent(2, "Ves Doombringer"));
    const running = run();
    await vi.waitFor(() => expect(site.acked.size).toBe(2));
    site.add(milestonesEvent(3));
    await vi.waitFor(() => expect(site.acked.size).toBe(3));

    expect(discord.messages.map((m) => m.channel)).toEqual([CHANNEL, CHANNEL, CHANNEL]);
    expect([...site.acked.values()]).toEqual(discord.messages.map((m) => m.id));
    expect(discord.messages[1]?.content.embeds[0]?.description).toContain("Ves Doombringer");
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
