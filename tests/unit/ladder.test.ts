import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SlashCommand } from "../../src/adapters/discord.js";
import { commandHandlers } from "../../src/app/commands.js";
import { runPoster } from "../../src/app/poster.js";
import { decide } from "../../src/core/events.js";
import { ladderMessage, readLadder, readRecapDoomsday, recapDoomsdayEmbed } from "../../src/core/ladder.js";
import { GOLD, type MessageContent, markedEvents } from "../../src/core/message.js";
import { readRecap, recapMessage } from "../../src/core/recap.js";
import { CHANNEL, FakeDiscord, FakeSite, logger } from "./fakes.js";

// BOT-16: the weekly ladder post, `/doomsday` and the recap's Doomsday section. Made-up names (CLAUDE.md rule 1).
const SITE = "https://example.com";
const HOST = "example.com";
const PAGE = "https://example.com/doomsday";
const START = 1_792_951_200;

const ladder = {
  week: 2965,
  label: "week 44",
  start: START,
  end: 1_793_556_000,
  pve: [
    { place: 1, name: "Mira", points: 120, goals: 15, move: { kind: "up", by: 1 } },
    { place: 2, name: "Tok", points: 95, goals: 12, move: { kind: "up", by: 2 } },
    { place: 3, name: "Ada", points: 85, goals: 11, move: { kind: "down", by: 2 } },
    { place: 4, name: "Bob", points: 60, goals: 8, move: { kind: "same" } },
    { place: 5, name: "Jorrit", points: 15, goals: 3, move: { kind: "new" } },
  ],
  pvp: [
    { place: 1, name: "Bob", points: 1310, goals: 6, kills: 61, move: { kind: "up", by: 1 } },
    { place: 2, name: "Ada", points: 240, goals: 4, kills: 30, move: { kind: "down", by: 1 } },
  ],
  duelChampion: { name: "Bob", rating: 1112, wins: 9, losses: 4 },
  mostKillsInZone: { name: "Ada", zone: "Hillsbrad Foothills", kills: 21 },
  battlegrounds: {
    friends: [{ place: 1, name: "Femke", points: 31, wins: 3, losses: 1, kills: 18 }],
    games: [
      { name: "Warsong Gulch", wins: 9, losses: 6 },
      { name: "Arathi Basin", wins: 4, losses: 7 },
    ],
  },
  pvpVirgins: ["Tok"],
  withoutData: ["Sanne"],
};

describe("the weekly ladder post (BOT-16)", () => {
  it("shows both top 5s side by side with movement, the duel champion, the zone, battlegrounds apart, the Virgin", () => {
    const message = ladderMessage(readLadder(ladder)!, 50, SITE, HOST, PAGE);
    const embed = message.embeds[0]!;
    expect(embed.title).toBe("Doomsday ladder · week 44");
    expect(embed.url).toBe("https://example.com/doomsday#e50");
    expect(embed.description).toBe(
      [
        "Week 44 is done. Proud of the grind.",
        "",
        "PvP Virgin of the week: Tok. Still pure. The Night Elves of Ashenvale send their thanks.",
        "No Doomsday data yet: Sanne.",
        "[The all-time ladder on example.com ↗](https://example.com/doomsday)",
      ].join("\n"),
    );
    expect(embed.fields).toEqual([
      { name: "PvP top 5", value: "1. **Bob** 1,310 ▲1\n2. **Ada** 240 ▼1", inline: true },
      {
        name: "PvE top 5",
        value: "1. **Mira** 120 ▲1\n2. **Tok** 95 ▲2\n3. **Ada** 85 ▼2\n4. **Bob** 60 –\n5. **Jorrit** 15 new",
        inline: true,
      },
      { name: "Duel champion", value: "**Bob** · 9–4 · rating 1,112", inline: true },
      { name: "Most kills in one zone", value: "**Ada** · 21 in Hillsbrad Foothills", inline: true },
      {
        name: "Battlegrounds · kept apart from the kills above",
        value: "Warsong Gulch 9 W · 6 L  ·  Arathi Basin 4 W · 7 L\n1. **Femke** 31 · 3–1 · 18 kills",
        inline: false,
      },
    ]);
    expect(message.allowed_mentions).toEqual({ parse: [] });
    expect(markedEvents(SITE, [{ id: "9", texts: [embed.url!] }]).get(50)).toBe("9");
  });

  it("falls back without a label, the optional blocks, and with several Virgins", () => {
    const bare = readLadder({ start: START, pve: [], pvp: [], pvpVirgins: ["Tok", "Bob"], battlegrounds: null })!;
    const embed = ladderMessage(bare, 51, SITE, HOST, PAGE).embeds[0]!;
    expect(embed.title).toBe("Doomsday ladder");
    expect(embed.description).toContain(`The week of <t:${START}:D> is done. Proud of the grind.`);
    expect(embed.description).toContain("PvP Virgins of the week: Tok, Bob. Still pure.");
    expect(embed.fields?.map((f) => f.name)).toEqual(["PvP top 5", "PvE top 5"]);
    expect(embed.fields?.[0]?.value).toBe("Nobody yet");
    expect(readLadder({ week: 1 })).toBeUndefined();
  });

  it("is decided by the Ladder switch, and a posted one is only acknowledged", () => {
    const event = { id: 50, type: "doomsdayLadder", data: ladder };
    expect(decide(event, {}, new Map(), SITE, HOST).do).toBe("ladder");
    expect(decide(event, { doomsdayLadder: false }, new Map(), SITE, HOST).do).toBe("leave");
    expect(decide(event, {}, new Map([[50, "7"]]), SITE, HOST)).toEqual({ do: "ack", messageId: "7" });
    expect(decide({ ...event, data: "nope" }, {}, new Map(), SITE, HOST).do).toBe("leave");
  });

  describe("through the poster", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("posts in the Doomsday channel, the posts channel without one, once", async () => {
      const site = new FakeSite();
      const discord = new FakeDiscord();
      const stop = new AbortController();
      site.add({ id: 50, type: "doomsdayLadder", data: ladder });
      const running = runPoster({ siteUrl: SITE, site, discord, log: logger().log, now: () => 0 }, stop.signal);
      await vi.waitFor(() => expect(site.acked.get(50)).toBe("1100000000000000001"));
      expect(discord.messages.map((m) => m.channel)).toEqual([CHANNEL]);
      stop.abort();
      await running;
    });
  });
});

describe("the recap's Doomsday section (BOT-16)", () => {
  const doomsday = {
    mostDevoted: { name: "Mira", days: 7 },
    perfectWeek: ["Tok"],
    points: {
      pve: [
        { name: "Mira", points: 120 },
        { name: "Tok", points: 95 },
        { name: "Ada", points: 85 },
      ],
      pvp: [
        { name: "Bob", points: 1310 },
        { name: "Ada", points: 240 },
      ],
    },
  };

  it("is its own embed: PvE and PvP top 3 side by side, Most devoted underneath (BOT-20)", () => {
    expect(recapDoomsdayEmbed(readRecapDoomsday(doomsday)!)).toEqual({
      title: "Doomsday · this week",
      fields: [
        { name: "PvE top 3", value: "1. **Mira** 120\n2. **Tok** 95\n3. **Ada** 85", inline: true },
        { name: "PvP top 3", value: "1. **Bob** 1,310\n2. **Ada** 240", inline: true },
      ],
      color: GOLD,
      footer: { text: "Most devoted: Mira, goals on all 7 days" },
    });
  });

  it("leaves out Perfect week and the crowns, as the board does, and what isn't there", () => {
    const embed = recapDoomsdayEmbed(
      readRecapDoomsday({
        mostDevoted: { name: "Ada", days: 1 },
        perfectWeek: [],
        points: {},
        crowns: [
          { name: "Mira", count: 3 },
          { name: "Tok", count: 2 },
        ],
      })!,
    );
    expect(embed?.description).toBeUndefined();
    expect(embed?.fields?.map((f) => f.value)).toEqual(["Nobody yet", "Nobody yet"]);
    expect(embed?.footer).toEqual({ text: "Most devoted: Ada, goals on 1 day" });
    expect(recapDoomsdayEmbed(readRecapDoomsday({ mostDevoted: null, perfectWeek: [], points: {} })!)).toBe(undefined);
    expect(readRecapDoomsday(undefined)).toBeUndefined();
  });

  it("goes into the recap after the cards, before the challenge", () => {
    const recap = readRecap({
      week: 3,
      headline: { text: "A week" },
      cards: [{ id: "S2", name: "Class census", title: "Mages", text: "3 of them." }],
      challenge: { text: "Duel every friend once" },
      doomsday,
    })!;
    const titles = recapMessage(recap, SITE, [], 60).embeds.map((e) => e.title);
    expect(titles).toEqual(["Weekly recap · week 3", "Class census", "Doomsday · this week", "This week's challenge"]);
    expect(recapMessage({ ...recap, doomsday: undefined }, SITE, []).embeds).toHaveLength(3);
  });
});

describe("/doomsday and /doom (BOT-16)", () => {
  const USER = "100000000000000021";
  const lookup = {
    friend: "Mira",
    label: "Wed 28 Oct",
    resetAt: 1_793_296_800,
    goals: [{ slot: "pve1", id: "d.quests10", title: "Finish 10 quests", track: "pve", points: 5, done: false }],
    duels: [],
    week: { pve: 35, pvp: 12 },
    allTime: { pve: 410, pvp: 96 },
    place: { pve: { place: 2, of: 5 }, pvp: { place: 3, of: 4 } },
    streak: 4,
    best: 9,
    pvpVirgin: false,
    crossedOut: false,
    asker: "Mira",
  };

  function ask(site: FakeSite, name: string, options: Record<string, string> = {}) {
    const answers: MessageContent[] = [];
    let done: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => (done = resolve));
    const command: SlashCommand = {
      name,
      userId: USER,
      options,
      async reply(content: MessageContent) {
        answers.push(content);
        done();
      },
    };
    const handlers = commandHandlers(
      { siteUrl: SITE, site, log: logger().log, now: () => 0, settings: () => ({ doomsdayUrl: PAGE }) },
      new AbortController().signal,
    );
    handlers.command(command);
    return answered.then(() => answers[0]!);
  }

  it("answers your Doomsday with Share and the link to the board, under both names", async () => {
    const site = new FakeSite();
    site.lookupAnswers.set("doomsday", { ok: true, body: lookup });
    for (const name of ["doomsday", "doom"]) {
      const answer = await ask(site, name);
      expect(answer.embeds[0]?.title).toBe("Your Doomsday");
      expect(answer.embeds[0]?.description).toContain("**Ladders** PvE 2nd of 5 · PvP 3rd of 4");
      expect(answer.components?.[0]?.components.map((c) => c.label)).toEqual(["Share", "Open on site ↗"]);
      expect(answer.components?.[0]?.components[1]?.url).toBe(PAGE);
    }
    expect(site.lookups.map((l) => l.params)).toEqual([{ discordUserId: USER }, { discordUserId: USER }]);
  });

  it("shows a friend's day, and the fallbacks", async () => {
    const site = new FakeSite();
    site.lookupAnswers.set("doomsday", { ok: true, body: lookup });
    expect((await ask(site, "doomsday", { friend: "Mira" })).embeds[0]?.title).toBe("Mira's Doomsday");
    expect(site.lookups.at(-1)?.params).toEqual({ discordUserId: USER, friend: "Mira" });

    site.lookupAnswers.set("doomsday", { ok: false, status: 403, error: "not_linked" });
    expect((await ask(site, "doomsday")).embeds[0]?.title).toBe("Link your Discord first");
    site.lookupAnswers.set("doomsday", { ok: false, status: 404, error: "not_found" });
    expect((await ask(site, "doomsday", { friend: "Nobody" })).embeds[0]?.title).toBe("Not found");
    site.lookupAnswers.set("doomsday", { ok: false, status: 404 });
    expect((await ask(site, "doom")).embeds[0]?.title).toBe("Doomsday isn't available yet");
    site.lookupAnswers.set("doomsday", { ok: false, status: 404, error: "no_data" });
    expect((await ask(site, "doomsday", { friend: "Mira" })).embeds[0]?.title).toBe("Doomsday isn't available yet");
    site.lookupAnswers.set("doomsday", { ok: true, body: { friend: "Sanne", noData: true } });
    expect((await ask(site, "doomsday", { friend: "Sanne" })).embeds[0]?.description).toContain(
      "Sanne has no Doomsday data yet.",
    );
  });
});
