import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DoomsdayBoards, EDIT_EVERY_MS, IMAGE_EVERY_MS, answerMyGoals } from "../../src/app/doomsdayPosts.js";
import { runPoster } from "../../src/app/poster.js";
import type { ButtonPress } from "../../src/adapters/discord.js";
import {
  MY_GOALS,
  PLAIN_BOXES,
  boardMessage,
  boxes,
  doomsdayReply,
  readBoard,
  readLookup,
} from "../../src/core/doomsday.js";
import { decide } from "../../src/core/events.js";
import { markedEvents } from "../../src/core/message.js";
import { readSettings } from "../../src/core/settings.js";
import { CHANNEL, FakeDiscord, FakeSite, logger } from "./fakes.js";

// Made-up names and ids (CLAUDE.md rule 1).
const SITE = "https://example.com";
const PAGE = "https://example.com/doomsday";
const B = { pve: "[G]", pvp: "[R]", open: "[ ]" };
const START = 1_793_210_400;
const END = 1_793_296_800;

const goals = [
  { slot: "pve1", id: "d.quests10", title: "Finish 10 quests", track: "pve", points: 5 },
  { slot: "pve2", id: "d.dungeon", title: "Run a dungeon", track: "pve", points: 5 },
  { slot: "pve3", id: "d.secondary", title: "Raise Cooking, First Aid or Fishing", track: "pve", points: 5 },
  {
    slot: "hunt",
    id: "hunt",
    title: "The Hunt: Night Elf Druid or Troll Priest",
    track: "pvp",
    points: 5,
    hunt: { Alliance: "Night Elf Druid", Horde: "Troll Priest" },
  },
  { slot: "skirmish", id: "p.loneWolf", title: "Lone wolf: 3 solo kills", track: "pvp", points: 5 },
];

const fresh = {
  day: 20754,
  week: 2965,
  label: "Wed 28 Oct",
  start: START,
  end: END,
  goals,
  friends: [
    { name: "Ada", goals: [], doneCount: 0, crossedOut: false, today: { pve: 0, pvp: 0 }, pvpVirgin: false },
    { name: "Tok", goals: [], doneCount: 0, crossedOut: false, today: { pve: 0, pvp: null }, pvpVirgin: true },
  ],
  withoutData: ["Sanne"],
  crown: null,
  yesterdayCrown: { name: "Tok" },
};

const midday = {
  ...fresh,
  friends: [
    {
      name: "Mira",
      goals: [
        { slot: "pve1", id: "d.quests10", done: true, at: START + 3600 },
        {
          slot: "pve2",
          id: "d.quests10",
          done: true,
          at: START + 7200,
          swappedFrom: { id: "d.dungeon", title: "Run a dungeon" },
        },
        { slot: "pve3", id: "d.secondary", done: true, at: START + 9000 },
      ],
      doneCount: 3,
      crossedOut: true,
      today: { pve: 15, pvp: 0 },
      week: { pve: 35, pvp: 12 },
      streak: 4,
      best: 9,
      pvpVirgin: false,
    },
    {
      name: "Ada",
      goals: [
        { slot: "pve1", done: true, at: START + 100 },
        { slot: "hunt", done: true, at: START + 200 },
        { slot: "pve3", done: false, progress: { have: 3, need: 5 } },
      ],
      doneCount: 2,
      crossedOut: false,
      today: { pve: 5, pvp: 5 },
      pvpVirgin: false,
    },
    {
      name: "Tok",
      goals: [{ slot: "pve2", done: true, at: START + 300 }],
      doneCount: 1,
      crossedOut: false,
      today: { pve: 5, pvp: null },
      pvpVirgin: true,
    },
    { name: "Jorrit", goals: [], doneCount: 0, crossedOut: false, today: { pve: 0, pvp: 0 }, pvpVirgin: false },
  ],
  crown: { name: "Mira", at: START + 9000 },
  boardEvent: 40,
  messageId: "1100000000000000001",
  final: false,
};

const final = {
  ...midday,
  final: true,
  summary: { goalsDone: 14, hunt: { name: "Ada", at: START + 200 }, longestStreak: { name: "Mira", days: 12 } },
};

describe("the daily board (BOT-15)", () => {
  it("reads the board defensively", () => {
    expect(readBoard({ label: "Wed 28 Oct", goals: [] })).toBeUndefined();
    expect(readBoard("nope")).toBeUndefined();
    const board = readBoard(fresh)!;
    expect(board.goals.map((g) => g.slot)).toEqual(["pve1", "pve2", "pve3", "hunt", "skirmish"]);
    expect(board.friends[1]).toMatchObject({ name: "Tok", pvpVirgin: true, today: { pve: 0, pvp: null } });
    expect(board.yesterdayCrown).toBe("Tok");
    expect(board.update).toBeUndefined();
    // An update needs its board event.
    expect(readBoard({ ...fresh }, true)).toBeUndefined();
    expect(readBoard(midday, true)?.update).toEqual({ boardEvent: 40, messageId: "1100000000000000001", final: false });
  });

  it("at the reset: the goals, a row of open boxes per friend, who has no data, and the buttons", () => {
    const message = boardMessage(readBoard(fresh)!, 40, SITE, PAGE, B);
    const embed = message.embeds[0]!;
    expect(embed.title).toBe("Doomsday · Wed 28 Oct");
    expect(embed.url).toBe("https://example.com/doomsday#e40");
    expect(embed.description).toBe(
      [
        "**PvE dailies · 5 each**",
        "Finish 10 quests · Run a dungeon · Raise Cooking, First Aid or Fishing",
        "**PvP · 5 each**",
        "The Hunt\\: Night Elf Druid or Troll Priest · Lone wolf\\: 3 solo kills · plus your first duel with each friend",
        "",
        "**Ada** [ ][ ][ ] [ ][ ]",
        "**Tok** · PvP Virgin [ ][ ][ ]",
        "",
        "No Doomsday data yet: Sanne.",
        "Yesterday's crown: Tok.",
        "",
        // No legend and no notes (BOT-20, Nico: no notes in posts).
        `-# resets <t:${END}:R>`,
      ].join("\n"),
    );
    expect(message.components?.[0]?.components).toEqual([
      { type: 2, style: 5, label: "Open the board ↗", url: PAGE },
      { type: 2, style: 2, label: "My goals", custom_id: MY_GOALS },
    ]);
    expect(message.allowed_mentions).toEqual({ parse: [] });
    // The marker finds the post after a restart.
    expect(markedEvents(SITE, [{ id: "9", texts: [embed.url!] }]).get(40)).toBe("9");
  });

  it("midday: struck through with the crown, counts, points per track never summed, and — for nothing done", () => {
    const rows = boardMessage(readBoard(midday, true)!, 40, SITE, PAGE, B).embeds[0]!.description!.split("\n");
    expect(rows).toContain(`~~**Mira**~~ 👑 [G][G][G] [ ][ ] · all dailies <t:${START + 9000}:t> · PvE 15 · PvP 0`);
    expect(rows).toContain("**Ada** [G][ ][ ] [R][ ] · 2 / 5 · PvE 5 · PvP 5");
    expect(rows).toContain("**Tok** · PvP Virgin [ ][G][ ] · 1 / 3 · PvE 5");
    expect(rows).toContain("**Jorrit** [ ][ ][ ] [ ][ ] · —");
  });

  it('final: "final", the day\'s summary, no buttons', () => {
    const message = boardMessage(readBoard(final, true)!, 40, SITE, PAGE, B);
    const embed = message.embeds[0]!;
    expect(embed.title).toBe("Doomsday · Wed 28 Oct · final");
    expect(embed.description).toContain(
      `Day over: 14 goals done · Ada won the Hunt race at <t:${START + 200}:t> · longest streak Mira, 12 days.`,
    );
    expect(embed.description).toContain(`-# final · new goals <t:${END}:R>`);
    expect(embed.description).not.toContain("Yesterday's crown");
    expect(message.components).toEqual([]);
  });

  it("uses the bot's box emoji once all three are there, plain characters before", () => {
    expect(boxes({})).toEqual(PLAIN_BOXES);
    expect(boxes({ BOX_PVE: "<:a:1>", BOX_PVP: "<:b:2>" })).toEqual(PLAIN_BOXES);
    expect(boxes({ BOX_PVE: "<:a:1>", BOX_PVP: "<:b:2>", BOX_OPEN: "<:c:3>" })).toEqual({
      pve: "<:a:1>",
      pvp: "<:b:2>",
      open: "<:c:3>",
    });
  });

  it("is decided by the Board switch, and a posted board is only acknowledged", () => {
    const event = { id: 40, type: "doomsdayBoard", data: fresh };
    expect(decide(event, {}, new Map(), SITE, "example.com").do).toBe("board");
    expect(decide(event, { doomsdayBoard: false }, new Map(), SITE, "example.com").do).toBe("leave");
    expect(decide(event, {}, new Map([[40, "7"]]), SITE, "example.com")).toEqual({ do: "ack", messageId: "7" });
    const update = { id: 41, type: "doomsdayBoardUpdate", data: midday };
    expect(decide(update, {}, new Map([[40, "7"]]), SITE, "example.com")).toMatchObject({ do: "board", posted: "7" });
  });

  it("reads the Doomsday settings", () => {
    const settings = readSettings({
      posts: { doomsdayBoard: false, doomsdayLadder: true },
      channels: { doomsday: "100000000000000002" },
      doomsday: { reset: "19:00", timeZone: "Europe/Paris", url: "https://example.com/doomsday" },
    });
    expect(settings).toMatchObject({
      doomsdayBoard: false,
      doomsdayLadder: true,
      doomsdayChannel: "100000000000000002",
      doomsdayUrl: "https://example.com/doomsday",
    });
    expect(readSettings({ doomsday: { url: "javascript:alert(1)" } }).doomsdayUrl).toBeUndefined();
  });
});

describe("the board's message (BOT-15)", () => {
  let site: FakeSite;
  let discord: FakeDiscord;
  let now: number;
  let stop: AbortController;
  let log: ReturnType<typeof logger>;
  let boards: DoomsdayBoards;

  beforeEach(() => {
    vi.useFakeTimers();
    site = new FakeSite();
    discord = new FakeDiscord();
    now = 1_793_240_000_000;
    stop = new AbortController();
    log = logger();
    boards = new DoomsdayBoards({ siteUrl: SITE, site, discord, log: log.log, now: () => now }, stop.signal);
  });

  afterEach(() => {
    stop.abort();
    vi.useRealTimers();
  });

  const update = (id: number, messageId: string | null, extra: object = {}) =>
    readBoard({ ...midday, messageId, ...extra }, true)!;

  it("posts the board, edits it for an update, and throttles edits to one per 30 s, keeping only the newest", async () => {
    const id = await boards.handle(40, readBoard(fresh)!, CHANNEL);
    expect(id).toBe("1100000000000000001");
    // Right after the post: the update waits.
    expect(await boards.handle(41, update(41, id!), CHANNEL)).toBeUndefined();
    now += 10_000;
    // A newer one replaces the waiting one.
    expect(await boards.handle(42, update(42, id!, { crown: null }), CHANNEL)).toBeUndefined();
    expect(discord.edits).toBe(0);
    now += EDIT_EVERY_MS;
    await vi.advanceTimersByTimeAsync(EDIT_EVERY_MS);
    expect(discord.edits).toBe(1);
    expect([...site.acked]).toEqual([[42, id]]);
    expect(discord.messages[0]?.content.embeds[0]?.description).not.toContain("👑");
    expect(discord.messages).toHaveLength(1);
    // 30 s later an update is shown at once.
    now += EDIT_EVERY_MS;
    expect(await boards.handle(43, update(43, id!, { final: true }), CHANNEL)).toBe(id);
    expect(discord.messages[0]?.content.embeds[0]?.title).toBe("Doomsday · Wed 28 Oct · final");
  });

  it("posts the board again when its message is gone, marked with the board's event", async () => {
    const id = await boards.handle(41, update(41, "1100000000000000999"), CHANNEL);
    expect(id).toBe("1100000000000000001");
    expect(discord.messages[0]?.content.embeds[0]?.url).toBe("https://example.com/doomsday#e40");
    // Without a message id at all, too.
    const fresh2 = new DoomsdayBoards({ siteUrl: SITE, site, discord, log: log.log, now: () => now }, stop.signal);
    expect(await fresh2.handle(44, update(44, null), CHANNEL)).toBe("1100000000000000002");
    expect(log.texts()).toContain("discord: the Doomsday board of event 40 is gone; posting it again");
  });

  it("goes through the poster to the Doomsday channel and acknowledges", async () => {
    const DOOM = "100000000000000003";
    site.settingsBody = {
      posts: { milestones: true, doomsdayBoard: true },
      channels: { posts: CHANNEL, doomsday: DOOM },
      doomsday: { url: PAGE },
    };
    site.add({ id: 40, type: "doomsdayBoard", data: fresh });
    const running = runPoster({ siteUrl: SITE, site, discord, log: log.log, now: () => now }, stop.signal);
    await vi.waitFor(() => expect(site.acked.get(40)).toBe("1100000000000000001"));
    expect(discord.messages[0]?.channel).toBe(DOOM);
    site.add({ id: 41, type: "doomsdayBoardUpdate", data: { ...midday, messageId: "1100000000000000001" } });
    now += EDIT_EVERY_MS;
    await vi.waitFor(() => expect(site.acked.get(41)).toBe("1100000000000000001"));
    expect(discord.edits).toBe(1);
    stop.abort();
    await running;
  });
});

describe("My goals and the Doomsday reply", () => {
  const lookup = {
    friend: "Mira",
    day: 20754,
    label: "Wed 28 Oct",
    resetAt: END,
    weekResetAt: 1_793_556_000,
    goals: [
      {
        slot: "pve1",
        id: "d.quests10",
        title: "Finish 10 quests",
        track: "pve",
        points: 5,
        done: true,
        at: START + 60,
      },
      {
        slot: "pve2",
        id: "d.quests10",
        title: "Finish 10 quests",
        track: "pve",
        points: 5,
        done: false,
        swappedFrom: { id: "d.dungeon", title: "Run a dungeon" },
      },
      { slot: "hunt", id: "hunt", title: "The Hunt", track: "pvp", points: 5, done: true, at: START + 120 },
      {
        slot: "week1",
        id: "w.dungeons3",
        title: "Run 3 dungeons",
        track: "pve",
        points: 15,
        done: false,
        progress: { have: 1, need: 3 },
      },
    ],
    duels: [
      { name: "Nico", won: true, points: 3 },
      { name: "Ada", won: false, disputed: true, points: 0 },
    ],
    today: { pve: 5, pvp: 3 },
    week: { pve: 35, pvp: 12 },
    allTime: { pve: 1240, pvp: 2310 },
    place: { pve: { place: 2, of: 5 }, pvp: { place: 3, of: 4 } },
    streak: 4,
    best: 9,
    pvpVirgin: false,
    crossedOut: false,
    asker: "Mira",
  };

  it("shows the goals with progress, the week, both ladders, the streak and the resets", () => {
    const embed = doomsdayReply(readLookup(lookup)!, true, PAGE, B).embeds[0]!;
    expect(embed.title).toBe("Your Doomsday");
    expect(embed.description).toBe(
      [
        "**Your goals today · 2 of 3**",
        `[G] Finish 10 quests · <t:${START + 60}:t>`,
        "[ ] Finish 10 quests · instead of Run a dungeon",
        `[R] The Hunt · <t:${START + 120}:t>`,
        "Duels today: Nico won (3) · Ada disputed",
        "",
        "**This week's goals · 0 of 1**",
        "[ ] Run 3 dungeons · 1/3",
        "",
        "**This week** PvE 35 · PvP 12",
        "**All time** PvE 1,240 · PvP 2,310",
        "**Ladders** PvE 2nd of 5 · PvP 3rd of 4",
        "**Streak** 4 days · best 9",
        `-# resets <t:${END}:R> · the week <t:1793556000:R>`,
      ].join("\n"),
    );
  });

  it("a friend's day, a PvP Virgin, and no data", () => {
    const virgin = readLookup({ ...lookup, pvpVirgin: true, place: { pve: { place: 1, of: 5 }, pvp: null } })!;
    const embed = doomsdayReply({ ...virgin, week: { pve: 35, pvp: null } }, false, PAGE, B).embeds[0]!;
    expect(embed.title).toBe("Mira's Doomsday");
    expect(embed.description).toContain("**Ladders** PvE 1st of 5 · PvP not ranked (PvP Virgin)");
    expect(embed.description).toContain("**This week** PvE 35\n");
    expect(doomsdayReply(readLookup({ friend: "Sanne", noData: true })!, false, PAGE).embeds[0]?.description).toBe(
      "Sanne has no Doomsday data yet. It comes with the addon's next upload.",
    );
  });

  it("answers My goals only to the presser, with the not-linked and not-available fallbacks", async () => {
    const site = new FakeSite();
    const replies: string[] = [];
    const press = {
      customId: MY_GOALS,
      userId: "100000000000000001",
      values: [],
      defer: vi.fn(),
      reply: async (content: { embeds: { title?: string }[] }) => void replies.push(content.embeds[0]?.title ?? ""),
    } as unknown as ButtonPress;
    const deps = { siteUrl: SITE, site, log: logger().log, now: () => 0 };
    await answerMyGoals(deps, press, new AbortController().signal);
    site.lookupAnswers.set("doomsday", { ok: false, status: 403 });
    await answerMyGoals(deps, press, new AbortController().signal);
    site.lookupAnswers.set("doomsday", { ok: true, body: lookup });
    await answerMyGoals(deps, press, new AbortController().signal);
    expect(replies).toEqual(["Doomsday isn't available yet", "Link your Discord first", "Your Doomsday"]);
    expect(press.defer).toHaveBeenCalledWith("reply");
    expect(site.lookups[0]).toEqual({ what: "doomsday", params: { discordUserId: "100000000000000001" } });
  });
});

describe("the board with the site's picture (BOT-20, board `bot-visual-daily`)", () => {
  let site: FakeSite;
  let discord: FakeDiscord;
  let now: number;
  let stop: AbortController;
  let log: ReturnType<typeof logger>;
  let boards: DoomsdayBoards;
  const png = new Uint8Array([137, 80, 78, 71]);

  beforeEach(() => {
    vi.useFakeTimers();
    site = new FakeSite();
    discord = new FakeDiscord();
    now = 1_793_240_000_000;
    stop = new AbortController();
    log = logger();
    boards = new DoomsdayBoards({ siteUrl: SITE, site, discord, log: log.log, now: () => now }, stop.signal);
    for (const id of ["doomsday-20754-a", "doomsday-20754-b", "doomsday-20754-c"])
      site.images.set(`cards/${id}.png`, png);
  });

  afterEach(() => {
    stop.abort();
    vi.useRealTimers();
  });

  const visual = (id: number, image: string, extra: object = {}) =>
    readBoard(
      { ...midday, label: "Wed evening", messageId: "1100000000000000001", image, news: `News ${id}`, ...extra },
      true,
    )!;

  it("is one embed with the news line and the picture, without the table or a legend", () => {
    const message = boardMessage(
      readBoard({ ...fresh, image: "doomsday-20754-a" })!,
      40,
      SITE,
      PAGE,
      B,
      "doomsday-20754-a.png",
    );
    const embed = message.embeds[0]!;
    expect(embed.image).toEqual({ url: "attachment://doomsday-20754-a.png" });
    // Without the site's news, the start of the day names the goals.
    expect(embed.description).toBe(
      "**PvE** Finish 10 quests · Run a dungeon · Raise Cooking, First Aid or Fishing. **PvP** The Hunt\\: Night Elf Druid or Troll Priest · Lone wolf\\: 3 solo kills. 5 points each.",
    );
    expect(JSON.stringify(message)).not.toMatch(/Columns|\[ \]|updates during the day/);
    const later = boardMessage(visual(41, "doomsday-20754-a"), 40, SITE, PAGE, B, "doomsday-20754-a.png");
    expect(later.embeds[0]?.title).toBe("Doomsday · Wed evening");
    expect(later.embeds[0]?.description).toBe("News 41");
    expect(later.components?.[0]?.components.map((c) => c.label)).toEqual(["Open the board ↗", "My goals"]);
  });

  it("posts the picture, swaps it at most every 5 minutes and only when it changed, then shows the newest", async () => {
    const id = await boards.handle(40, readBoard({ ...fresh, image: "doomsday-20754-a" })!, CHANNEL);
    expect(discord.messages[0]?.files).toEqual(["doomsday-20754-a.png"]);
    // 1 minute later a new picture: the text changes, the picture waits.
    now += 60_000;
    expect(await boards.handle(41, visual(41, "doomsday-20754-b"), CHANNEL)).toBe(id);
    expect(discord.messages[0]?.content.embeds[0]?.description).toBe("News 41");
    expect(discord.messages[0]?.files).toEqual(["doomsday-20754-a.png"]);
    expect(discord.messages[0]?.content.embeds[0]?.image).toEqual({ url: "attachment://doomsday-20754-a.png" });
    // Once the 5 minutes are over the newest picture is shown, without another update.
    now += IMAGE_EVERY_MS;
    await vi.advanceTimersByTimeAsync(IMAGE_EVERY_MS);
    await vi.waitFor(() => expect(discord.messages[0]?.files).toEqual(["doomsday-20754-b.png"]));
    expect(discord.messages[0]?.content.embeds[0]?.image).toEqual({ url: "attachment://doomsday-20754-b.png" });
    // The same picture again: only the text is edited.
    now += 60_000;
    const edits = discord.edits;
    await boards.handle(42, visual(42, "doomsday-20754-b"), CHANNEL);
    expect(discord.edits).toBe(edits + 1);
    expect(discord.messages[0]?.files).toEqual(["doomsday-20754-b.png"]);
    // The final edit always gets the newest picture.
    now += 60_000;
    await boards.handle(43, visual(43, "doomsday-20754-c", { final: true }), CHANNEL);
    expect(discord.messages[0]?.files).toEqual(["doomsday-20754-c.png"]);
    expect(discord.messages[0]?.content.embeds[0]?.title).toBe("Doomsday · Wed evening · final");
  });

  it("falls back to the text board when the picture can't be had, and drops a picture the site stopped sending", async () => {
    await boards.handle(40, readBoard({ ...fresh, image: "doomsday-20754-x" })!, CHANNEL);
    expect(discord.messages[0]?.files).toEqual([]);
    expect(discord.messages[0]?.content.embeds[0]?.description).toContain("**Ada**");
    expect(log.texts()).toContain("site: board image doomsday-20754-x unavailable; showing the text board");

    const other = new DoomsdayBoards({ siteUrl: SITE, site, discord, log: log.log, now: () => now }, stop.signal);
    await other.handle(50, readBoard({ ...fresh, image: "doomsday-20754-a" })!, CHANNEL);
    now += 60_000;
    await other.handle(51, readBoard({ ...midday, boardEvent: 50, messageId: null }, true)!, CHANNEL);
    expect(discord.messages[1]?.files).toEqual([]);
    expect(discord.messages[1]?.content.embeds[0]?.image).toBeUndefined();
  });
});

describe("the text board with the WEB-66 fields (BOT-20)", () => {
  it("counts against the site's goalCount (the Duel slot included) and doesn't repeat what the news says", () => {
    const board = readBoard(
      {
        ...midday,
        news: "Ada is 1 away. 1 friend without addon data.",
        friends: [{ ...midday.friends[1], doneCount: 3, goalCount: 6 }],
      },
      true,
    )!;
    const description = boardMessage(board, 40, SITE, PAGE, B).embeds[0]!.description!;
    expect(description).toContain("**Ada** [G][ ][ ] [R][ ] · 3 / 6 · PvE 5 · PvP 5");
    expect(description).toContain("Ada is 1 away. 1 friend without addon data.");
    expect(description).not.toContain("No Doomsday data yet");
  });
});
