import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ButtonPress, SlashCommand } from "../../src/adapters/discord.js";
import { runPoster } from "../../src/app/poster.js";
import { RunActions } from "../../src/app/runActions.js";
import { readRunEvent } from "../../src/core/events.js";
import type { MessageContent } from "../../src/core/message.js";
import { dayChoices, dungeonChoices, readPlanChoices, runChoices } from "../../src/core/runReplies.js";
import { type Run, markedRuns, postState, readRun, runMessage, slots } from "../../src/core/runs.js";
import { readSettings } from "../../src/core/settings.js";
import { CHANNEL, FakeDiscord, FakeSite, logger, milestonesEvent } from "./fakes.js";

// BOT-04: the run post in every state, the reminder and Starting now, the picker, `/plan`, `/run` and the notices.
// Made-up names and ids only (CLAUDE.md rule 1), the run from the web repo's docs/BOT-API.md.
const SITE = "https://example.com";
const HOST = "example.com";
const NOW = 1_793_112_000; // seconds
const START = NOW + 3 * 3600;
const IDS = { nico: "100000000000000001", femke: "100000000000000003", bob: "100000000000000002" };
const ROLE = "100000000000000050";
const RUNS_CHANNEL = "100000000000000060";

function siteRun(over: Record<string, unknown> = {}) {
  return {
    id: 7,
    dungeon: { id: "sm-armory", name: "Scarlet Monastery: Armory", typicalLevels: { min: 32, max: 42 } },
    startsAt: START,
    note: "Bring water, we clear the courtyard first.",
    organiser: { name: "Nico", character: "Ves Doombringer", discordId: IDS.nico, level: 39, classFile: "WARLOCK" },
    source: "website",
    state: "open",
    open: { tank: 1, healer: 0, damage: 0 },
    counts: { in: 3, maybe: 1, cant: 0 },
    couldFill: [
      {
        role: "tank",
        open: 1,
        characters: [],
        close: [{ name: "Nico", character: "Grom Ashfeller", level: 24, fit: { kind: "tooLow", label: "8 below" } }],
      },
    ],
    answers: [
      { name: "Nico", character: "Ves Doombringer", discordId: IDS.nico, answer: "in", role: "damage", level: 39 },
      { name: "Femke", character: "Lia Thornwhisper", discordId: IDS.femke, answer: "in", role: "healer", level: 37 },
      { name: "Bob", character: "Bob Example", discordId: IDS.bob, answer: "in", role: "damage", level: 41 },
      { name: "Bob", character: "Tok Ironhide", answer: "maybe", role: "damage", level: 33 },
    ],
    ...over,
  };
}

const run = (over: Record<string, unknown> = {}) => readRun(siteRun(over)) as Run;
const ctx = { siteUrl: SITE, siteHost: HOST, now: NOW, reminderMinutes: 30 };
const allText = (m: MessageContent) =>
  JSON.stringify([m.content, m.embeds.map((e) => [e.author, e.title, e.description, e.fields, e.footer])]);
const labels = (m: MessageContent) => (m.components ?? []).flatMap((r) => r.components.map((c) => c.label));
/** The post's slot lines (BOT-13): one per slot in the description. */
const slotLines = (m: MessageContent) =>
  (m.embeds[0]?.description ?? "").split("\n").filter((l) => /^(Tank|Healer|Damage) · /.test(l));

describe("the run post", () => {
  it("shows the open run like the board: organiser, time, levels, note, five slots, could fill, counts", () => {
    const m = runMessage(run(), { ...ctx, mentionRole: ROLE });
    const e = m.embeds[0]!;
    expect(m.content).toBe(`<@&${ROLE}> Nico planned a run`);
    expect(m.allowed_mentions).toEqual({ parse: [], roles: [ROLE] });
    expect(e.author?.name).toBe("Nico on Ves Doombringer (39 Warlock)");
    expect(e.title).toBe("Scarlet Monastery: Armory · Open");
    expect(e.url).toBe(`${SITE}/runs/7#r7`);
    expect(e.description).toContain(`<t:${START}:f> · <t:${START}:R>`);
    expect(e.description).toContain("Levels 32–42 · “Bring water, we clear the courtyard first.”");
    // One line per slot (BOT-13): inline fields wrapped 3 + 2 and didn't line up.
    expect(e.fields).toBeUndefined();
    expect(slotLines(m)).toEqual([
      "Tank · needed",
      "Healer · Lia Thornwhisper 37 · Femke",
      "Damage · Ves Doombringer 39 · Nico",
      "Damage · Bob Example 41 · Bob",
      "Damage · Tok Ironhide 33 · Bob · maybe",
    ]);
    expect(e.description).toContain(
      "\n\nCould fill the tank slot: nobody in range yet. Close: Grom Ashfeller 24 (Nico), 8 below.",
    );
    expect(e.footer?.text).toBe("3 in · 1 maybe · 1 slot open · example.com/runs");
    // I'm in opens the picker (BOT-13): no separate Pick my character.
    expect(labels(m)).toEqual(["I'm in", "Maybe", "Can't", "Open run ↗"]);
    expect(m.components?.[0]?.components.map((c) => c.custom_id).filter(Boolean)).toEqual([
      "run:7:in",
      "run:7:maybe",
      "run:7:cant",
    ]);
    // Posts never show Discord ids (rule 5): only the role mention in the content.
    expect(allText(m)).not.toContain(IDS.nico);
    expect(allText(m)).not.toContain(IDS.femke);
  });

  it("marks carries and lists reserves (Runs v2)", () => {
    const r = run({
      state: "full",
      open: { tank: 0, healer: 0, damage: 0 },
      answers: [
        { name: "Mira", character: "Mira Sunstrider", answer: "in", role: "damage", level: 60, fit: { kind: "carry" } },
        { name: "Jorrit", character: "Ruk", answer: "maybe", role: "damage", level: 33, reserve: true },
      ],
    });
    const m = runMessage(r, ctx);
    expect(slotLines(m)).toContain("Damage · Mira Sunstrider 60 · Mira · carry");
    expect(m.embeds[0]?.title).toBe("Scarlet Monastery: Armory · Full");
    expect(m.embeds[0]?.description).toContain("Ruk 33 · Jorrit is next in line if someone drops out");
    expect(allText(m)).toContain("Reserve: Ruk 33 · Jorrit");
    expect(labels(m)[0]).toBe("I'm in · full");
    // A reserve from an older site (`waitlisted` only) is a reserve too.
    expect(
      readRun(siteRun({ answers: [{ name: "A", answer: "maybe", role: "tank", waitlisted: true }] }))?.answers[0]
        ?.reserve,
    ).toBe(true);
    expect(slots(r).filter((s) => s.who !== undefined)).toHaveLength(1);
  });

  it("is the same message in every state; buttons go once it starts", () => {
    const show = (r: Run, extra = {}) => {
      const m = runMessage(r, { ...ctx, ...extra });
      return { title: m.embeds[0]?.title, text: m.embeds[0]?.description ?? "", buttons: labels(m) };
    };
    const soon = show(run(), { now: START - 20 * 60 });
    expect(soon.title).toBe("Scarlet Monastery: Armory · Starting soon");
    expect(soon.text).toContain("answers still open");
    expect(soon.buttons).toContain("I'm in");

    const started = show(run({ state: "started" }));
    expect(started.title).toBe("Scarlet Monastery: Armory · Started");
    expect(started.text).toContain("invites are going out in game");
    expect(started.buttons).toEqual(["Open run ↗"]);
    // The site's snapshot may be from before the start: the time decides too.
    expect(postState(run(), START + 1, 30)).toBe("started");

    const done = show(run({ state: "past", outcome: { kind: "done", at: START + 7200, came: 3, signedUp: 5 } }));
    expect(done.title).toBe("Scarlet Monastery: Armory · Done");
    expect(done.text).toContain("Ran it · 3 of 5 signed-up came");
    expect(done.buttons).toEqual(["Open run ↗"]);

    const not = show(run({ state: "past", outcome: { kind: "didntHappen", at: START } }));
    expect(not.title).toBe("Scarlet Monastery: Armory · Didn't happen");
    expect(not.text).toContain("No upload showed the run within 4 hours of start");

    const byOrganiser = show(run({ state: "cancelled" }), { cancelledBy: "Nico" });
    expect(byOrganiser.title).toBe("Scarlet Monastery: Armory · Cancelled");
    expect(byOrganiser.text).toContain("Cancelled by Nico, the organiser · sign-ups were sent a quiet notice");
    expect(byOrganiser.buttons).toEqual(["Open run ↗"]);
    expect(show(run({ state: "cancelled" }), { cancelledBy: "Mira" }).text).toContain("Removed by an admin");
  });

  it("reads what the site may leave out (rule 10), and finds its posts by their marker", () => {
    const bare = readRun({ id: 3, dungeon: { name: "The Deadmines" }, startsAt: START });
    expect(bare).toBeDefined();
    const m = runMessage(bare!, ctx);
    expect(m.embeds[0]?.author?.name).toBe("Someone organises");
    expect(m.embeds[0]?.footer?.text).toBe("0 in · 0 maybe · 5 slots open · example.com/runs");
    expect(readRun({ id: 3, startsAt: START })).toBeUndefined();
    const found = markedRuns(SITE, [
      { id: "m1", texts: [`${SITE}/runs/7#r7`, "x"] },
      { id: "m2", texts: [`${SITE}/character/x#e4`] },
    ]);
    expect([...found]).toEqual([[7, "m1"]]);
  });

  it("is a test post for the Discord page's run test (run id 0)", () => {
    const e = readRunEvent({ id: 9, type: "runCreated", data: { test: true, run: siteRun({ id: 0 }) } });
    expect(e).toMatchObject({ type: "runCreated", test: true });
    const m = runMessage(run({ id: 0 }), { ...ctx, mentionRole: ROLE, test: { eventId: 9 } });
    expect(m.content).toBe("Test post · Nico planned a run");
    expect(m.allowed_mentions).toEqual({ parse: [] });
    expect(m.embeds[0]?.url).toBe(`${SITE}/runs#e9`);
    expect(labels(m)).toEqual(["Open run ↗"]);
  });
});

describe("a friend's note with an answer (BOT-22, web WEB-67)", () => {
  it("shows the note next to that answer in its slot and in the lists, escaped and at most 80 characters", () => {
    const m = runMessage(
      run({
        answers: [
          {
            name: "Nico",
            character: "Ves Doombringer",
            answer: "in",
            role: "damage",
            level: 39,
            note: "Late, *start* without me",
          },
          {
            name: "Bob",
            character: "Tok Ironhide",
            answer: "maybe",
            role: "damage",
            level: 33,
            reserve: true,
            note: "x".repeat(100),
          },
        ],
      }),
      ctx,
    );
    expect(slotLines(m)).toContain("Damage · Ves Doombringer 39 · Nico · “Late, \\*start\\* without me”");
    expect(m.embeds[0]?.description).toContain(`Reserve: Tok Ironhide 33 · Bob · “${"x".repeat(80)}”`);
    // Without a note nothing changes.
    expect(slotLines(runMessage(run(), ctx)).join("\n")).not.toContain("“");
  });
});

describe("settings for runs", () => {
  it("reads the runs channel, the mention role and the reminder time", () => {
    const s = readSettings({
      posts: { runs: false },
      channels: { runs: RUNS_CHANNEL },
      mentionRole: ROLE,
      runs: { reminderMinutes: 60 },
    });
    expect(s).toMatchObject({ runs: false, runsChannel: RUNS_CHANNEL, mentionRole: ROLE, reminderMinutes: 60 });
    expect(readSettings({ mentionRole: "@everyone", runs: { reminderMinutes: -1 } })).toMatchObject({
      mentionRole: undefined,
      reminderMinutes: undefined,
    });
  });
});

describe("run events in the runs channel", () => {
  let site: FakeSite;
  let discord: FakeDiscord;
  let now: number;
  let stop: AbortController;
  let log: ReturnType<typeof logger>;

  beforeEach(() => {
    vi.useFakeTimers();
    site = new FakeSite();
    site.settingsBody = {
      siteName: "Doombringers",
      posts: { milestones: true, runs: true },
      channels: { posts: CHANNEL, runs: RUNS_CHANNEL },
      mentionRole: ROLE,
      runs: { reminderMinutes: 30 },
    };
    discord = new FakeDiscord();
    now = NOW * 1000;
    stop = new AbortController();
    log = logger();
  });

  afterEach(() => {
    stop.abort();
    vi.useRealTimers();
  });

  const start = () => runPoster({ siteUrl: SITE, site, discord, log: log.log, now: () => now }, stop.signal);

  it("posts a run once and edits that message for every change", async () => {
    site.add({ id: 1, type: "runCreated", data: { run: siteRun() } });
    const running = start();
    await vi.waitFor(() => expect(site.acked.size).toBe(1));
    site.add({ id: 2, type: "runChanged", data: { run: siteRun({ note: "Bring food too" }), changed: ["note"] } });
    site.add({
      id: 3,
      type: "runEnded",
      data: { run: siteRun({ state: "past", outcome: { kind: "done", came: 3, signedUp: 5 } }) },
    });
    await vi.waitFor(() => expect(site.acked.size).toBe(3));

    expect(discord.messages).toHaveLength(1);
    const post = discord.messages[0]!;
    expect(post.channel).toBe(RUNS_CHANNEL);
    expect(discord.edits).toBe(2);
    expect(post.content.embeds[0]?.title).toBe("Scarlet Monastery: Armory · Done");
    expect([...site.acked.values()]).toEqual([post.id, post.id, post.id]);
    stop.abort();
    await running;
  });

  it("finds its run post after a restart and edits it instead of posting again", async () => {
    site.add({ id: 1, type: "runCreated", data: { run: siteRun() } });
    const first = start();
    await vi.waitFor(() => expect(site.acked.size).toBe(1));
    stop.abort();
    await first;

    stop = new AbortController();
    site.add({ id: 2, type: "runChanged", data: { run: siteRun({ state: "full" }), changed: ["answers"] } });
    const second = start();
    await vi.waitFor(() => expect(site.acked.size).toBe(2));
    expect(discord.messages).toHaveLength(1);
    expect(discord.messages[0]?.content.embeds[0]?.title).toBe("Scarlet Monastery: Armory · Full");
    stop.abort();
    await second;
  });

  it("posts the reminder and Starting now as new messages, mentioning only I'm in and Maybe, never twice", async () => {
    site.add({ id: 1, type: "runCreated", data: { run: siteRun() } });
    now = (START - 30 * 60) * 1000;
    site.add({ id: 2, type: "runReminder", data: { run: siteRun(), mention: [IDS.nico, IDS.femke], minutes: 30 } });
    // The acknowledgement of the reminder is lost: it comes again after a restart.
    site.ackDown = 0;
    const first = start();
    await vi.waitFor(() => expect(site.acked.size).toBe(2));
    expect(discord.messages).toHaveLength(2);
    const reminder = discord.messages[1]!;
    expect(reminder.content.content).toBe(
      `<@${IDS.nico}> <@${IDS.femke}> Scarlet Monastery: Armory starts in 30 minutes`,
    );
    expect(reminder.content.allowed_mentions).toEqual({ parse: [], users: [IDS.nico, IDS.femke] });
    expect(reminder.content.embeds[0]?.description).toContain("tank still open");
    // The post shows "starting soon".
    expect(discord.messages[0]?.content.embeds[0]?.title).toBe("Scarlet Monastery: Armory · Starting soon");
    stop.abort();
    await first;

    // After a restart the same reminder event comes again (not acknowledged): found by its marker, not posted again.
    site.acked.delete(2);
    stop = new AbortController();
    const second = start();
    await vi.waitFor(() => expect(site.acked.size).toBe(2));
    expect(discord.messages).toHaveLength(2);
    expect(site.acked.get(2)).toBe(reminder.id);

    now = START * 1000;
    site.add({ id: 3, type: "runStarting", data: { run: siteRun({ state: "started" }), mention: [IDS.nico] } });
    await vi.waitFor(() => expect(site.acked.size).toBe(3));
    const starting = discord.messages[2]!;
    expect(starting.content.content).toBe(`<@${IDS.nico}> Starting now · invites go out in game`);
    expect(starting.content.embeds[0]?.description).toContain("Nico invites from the game");
    expect(discord.messages[0]?.content.embeds[0]?.title).toBe("Scarlet Monastery: Armory · Started");
    stop.abort();
    await second;
  });

  it("sends the quiet notices as direct messages, and posts pings and asks from the game", async () => {
    site.add({ id: 1, type: "runCreated", data: { run: siteRun() } });
    site.add({ id: 2, type: "runMovedUp", data: { run: siteRun(), who: { name: "Femke", discordId: IDS.femke } } });
    site.add({ id: 7, type: "runChanged", data: { run: siteRun({ startsAt: START + 1800 }), changed: ["startsAt"] } });
    site.add({
      id: 3,
      type: "runMoved",
      data: { run: siteRun(), who: { name: "Bob", discordId: IDS.bob }, to: "reserve", by: "Nico" },
    });
    site.add({
      id: 4,
      type: "ping",
      data: {
        run: siteRun(),
        from: { name: "Nico" },
        to: { name: "Jorrit", character: "Ruk", discordId: "100000000000000004" },
      },
    });
    site.add({
      id: 5,
      type: "askNow",
      data: {
        ask: {
          id: 2,
          dungeon: { id: "dm", name: "The Deadmines", typicalLevels: { min: 17, max: 26 } },
          from: { name: "Nico" },
          character: "Grom Ashfeller",
          role: "tank",
          at: NOW,
          expiresAt: NOW + 600,
        },
      },
    });
    site.add({
      id: 6,
      type: "runCancelled",
      data: { run: siteRun({ state: "cancelled" }), by: "Nico", mention: [IDS.nico, IDS.femke] },
    });
    discord.dmFailures = 0;
    const running = start();
    await vi.waitFor(() => expect(site.acked.size).toBe(7));

    expect(discord.dms.map((d) => [d.user, d.content.embeds[0]?.title])).toEqual([
      [IDS.femke, "You're in · Scarlet Monastery: Armory"],
      // A new time: those in and maybe with a linked Discord, not the organiser.
      [IDS.femke, "New time · Scarlet Monastery: Armory"],
      [IDS.bob, "New time · Scarlet Monastery: Armory"],
      [IDS.bob, "Your sign-up · Scarlet Monastery: Armory"],
      // The organiser cancelled it: no notice to them.
      [IDS.femke, "Cancelled · Scarlet Monastery: Armory"],
    ]);
    expect(discord.dms[0]?.content.embeds[0]?.description).toContain(
      "you moved up and are in as Lia Thornwhisper (healer)",
    );
    expect(discord.dms[3]?.content.embeds[0]?.description).toContain("Nico moved you to reserve");
    const ping = discord.messages.find((m) => m.content.content?.includes("waiting for you"))!;
    expect(ping.content.content).toBe(
      "<@100000000000000004> Hey Jorrit, these people are waiting for you in Scarlet Monastery: Armory",
    );
    expect(ping.content.embeds[0]?.footer?.text).toBe("Ping sent from the game by Nico · via /reload");
    const ask = discord.messages.find((m) => m.content.content?.includes("asks who's up"))!;
    expect(ask.content.content).toBe(`<@&${ROLE}> Nico asks who's up right now`);
    expect(ask.content.embeds[0]?.title).toBe("The Deadmines · now");
    expect(ask.content.embeds[0]?.description).toContain(`ends <t:${NOW + 600}:R>`);
    // A stored ask (WEB-51, it has an id): the answer buttons, found again by its marker.
    expect(ask.content.components?.[0]?.components.map((c) => c.custom_id)).toEqual([
      "ask:2:in",
      "ask:2:maybe",
      "ask:2:cant",
    ]);
    expect(ask.content.embeds[0]?.url).toBe(`${SITE}/runs#a2`);
    expect(discord.messages[0]?.content.embeds[0]?.title).toBe("Scarlet Monastery: Armory · Cancelled");
    stop.abort();
    await running;
  });

  it("posts runs in the runs channel when no posts channel is set; milestones wait for theirs", async () => {
    site.settingsBody = { posts: { milestones: true, runs: true }, channels: { posts: null, runs: RUNS_CHANNEL } };
    site.add(milestonesEvent(1));
    site.add({ id: 2, type: "runCreated", data: { run: siteRun() } });
    const running = start();
    await vi.waitFor(() => expect(site.acked.size).toBe(1));
    expect(site.acked.has(2)).toBe(true);
    expect(discord.messages.map((m) => m.channel)).toEqual([RUNS_CHANNEL]);
    stop.abort();
    await running;
  });

  it("leaves run events when runs are off on the site", async () => {
    site.settingsBody = { posts: { runs: false }, channels: { posts: CHANNEL } };
    site.add({ id: 1, type: "runCreated", data: { run: siteRun() } });
    const running = start();
    await vi.advanceTimersByTimeAsync(10);
    expect(discord.messages).toHaveLength(0);
    expect(site.acked.size).toBe(0);
    stop.abort();
    await running;
  });
});

describe("the run commands and buttons", () => {
  const USER = IDS.femke;
  const choices = {
    timeZone: "Europe/Amsterdam",
    admin: false,
    days: [
      { offset: 0, label: "Today · Thu 19", date: "2026-11-19" },
      { offset: 1, label: "Fri 20", date: "2026-11-20" },
    ],
    dungeons: [
      {
        id: "sm-armory",
        name: "Scarlet Monastery: Armory",
        typicalLevels: { min: 32, max: 42 },
        lead: {
          guid: "LIA",
          name: "Lia Thornwhisper",
          level: 37,
          role: "healer",
          fit: { kind: "fits", label: "fits" },
        },
      },
      { id: "scholo", name: "Scholomance", typicalLevels: { min: 58, max: 60 }, lead: null },
    ],
  };
  const lia = {
    guid: "LIA",
    name: "Lia Thornwhisper",
    level: 37,
    classFile: "PRIEST",
    role: "heal",
    roles: ["healer", "damage"],
    fit: "fits",
    fitKind: "fits",
  };
  const zul = {
    guid: "ZUL",
    name: "Zul Kazrek",
    level: 30,
    classFile: "WARLOCK",
    role: "dps",
    roles: ["damage"],
    fit: "2 below",
    fitKind: "low",
  };

  function setup() {
    const site = new FakeSite();
    const actions = new RunActions({
      siteUrl: SITE,
      site,
      log: logger().log,
      now: () => NOW * 1000,
      settings: () => ({ runsChannel: RUNS_CHANNEL }),
    });
    return { site, actions };
  }

  function asked(name: string, options: Record<string, string>) {
    const answers: MessageContent[] = [];
    const command: SlashCommand = {
      name,
      userId: USER,
      options,
      async reply(content) {
        answers.push(content);
      },
    };
    return { command, answers };
  }

  function pressed(customId: string, values: string[] = []) {
    const shown: { how: string; content: MessageContent }[] = [];
    const deferred: string[] = [];
    const press: ButtonPress = {
      customId,
      userId: USER,
      values,
      share: async () => undefined,
      defer: (as) => void deferred.push(as),
      reply: async (content) => void shown.push({ how: "reply", content }),
      update: async (content) => void shown.push({ how: "update", content }),
    };
    return { press, shown, deferred };
  }

  it("/plan leads as the site's suggestion, in the asker's time zone, and offers another character", async () => {
    const { site, actions } = setup();
    site.runAnswers.set("GET plan", { ok: true, body: choices });
    site.runAnswers.set("POST runs", { ok: true, body: { run: siteRun() } });
    site.runAnswers.set("GET runs/7/characters", { ok: true, body: { characters: [lia, zul] } });
    const { command, answers } = asked("plan", { dungeon: "sm-armory", day: "1", time: "20:30", note: "Bring water" });
    await actions.command(command, new AbortController().signal);
    expect(site.runCalls.find((c) => c.method === "POST")?.body).toEqual({
      discordUserId: USER,
      dungeonId: "sm-armory",
      dayOffset: 1,
      time: "20:30",
      note: "Bring water",
      leadGuid: "LIA",
    });
    const e = answers[0]!.embeds[0]!;
    expect(e.title).toBe("Planned · Scarlet Monastery: Armory");
    expect(e.description).toContain("You lead as Lia Thornwhisper (37, healer).");
    expect(e.description).toContain(`Posted in <#${RUNS_CHANNEL}>.`);
    expect(e.description).toContain("Read in your time zone from the site: Europe/Amsterdam.");
    const select = answers[0]!.components![0]!.components[0]!;
    expect(select).toMatchObject({ type: 3, custom_id: "run:7:lead", placeholder: "Lead with another character" });
    expect(select.options?.map((o) => o.value)).toEqual(["ZUL"]);
  });

  it("/plan says when the time has passed, with Tomorrow at the same time", async () => {
    const { site, actions } = setup();
    site.runAnswers.set("GET plan", { ok: true, body: choices });
    site.runAnswers.set("POST runs", { ok: false, status: 400, error: "time_passed" });
    const { command, answers } = asked("plan", { dungeon: "sm-armory", day: "0", time: "14:00" });
    await actions.command(command, new AbortController().signal);
    const m = answers[0]!;
    expect(m.embeds[0]?.title).toBe("That time has already passed");
    expect(m.embeds[0]?.description).toBe(
      "Today 14:00 has passed in your time (Europe/Amsterdam). Pick a later time or another day.",
    );
    const again = m.components![0]!.components[0]!;
    expect(again.label).toBe("Tomorrow 14:00");

    site.runAnswers.set("POST runs", { ok: true, body: { run: siteRun() } });
    const { press, shown, deferred } = pressed(again.custom_id!);
    await actions.press(press, new AbortController().signal);
    expect(deferred).toEqual(["update"]);
    expect(site.runCalls.filter((c) => c.method === "POST").at(-1)?.body).toMatchObject({
      dayOffset: 1,
      time: "14:00",
    });
    expect(shown[0]?.content.embeds[0]?.title).toBe("Planned · Scarlet Monastery: Armory");
  });

  it("/run edit and /run cancel on someone else's run: not yours, with Answer Can't", async () => {
    const { site, actions } = setup();
    site.runAnswers.set("GET plan", { ok: true, body: choices });
    site.runAnswers.set("GET runs/7", { ok: true, body: { run: siteRun() } });
    site.runAnswers.set("PATCH runs/7", { ok: false, status: 403, error: "not_organiser" });
    site.runAnswers.set("POST runs/7/cancel", { ok: false, status: 403, error: "not_allowed" });
    const edit = asked("run", { subcommand: "edit", run: "7", time: "21:00" });
    await actions.command(edit.command, new AbortController().signal);
    const cancel = asked("run", { subcommand: "cancel", run: "7" });
    await actions.command(cancel.command, new AbortController().signal);
    for (const m of [edit.answers[0]!, cancel.answers[0]!]) {
      expect(m.embeds[0]?.title).toBe("This run isn't yours");
      expect(m.embeds[0]?.description).toBe(
        "Only Nico, who planned it, or an admin can change or cancel it. Can't make it? Answer Can't instead.",
      );
      expect(m.components?.[0]?.components[0]).toMatchObject({ label: "Answer Can't", custom_id: "run:7:cant" });
    }
    // A new time alone keeps the day, in the asker's zone (the run starts Tue 27 Oct 18:40 in Amsterdam).
    expect(site.runCalls.find((c) => c.method === "PATCH")?.body).toEqual({
      discordUserId: USER,
      date: "2026-10-27",
      time: "21:00",
    });
  });

  it("I'm in opens the picker: the best character preselected with its roles; another pick swaps them", async () => {
    const { site, actions } = setup();
    site.runAnswers.set("GET runs/7", { ok: true, body: { run: siteRun() } });
    site.runAnswers.set("GET runs/7/characters", { ok: true, body: { characters: [lia, zul] } });
    const signal = new AbortController().signal;

    const imIn = pressed("run:7:in");
    await actions.press(imIn.press, signal);
    expect(imIn.deferred).toEqual(["reply"]);
    const picker = imIn.shown[0]!.content;
    expect(picker.embeds[0]?.title).toBe("Which character joins Scarlet Monastery: Armory?");
    // The site's first is the best fit: preselected, with its roles right away (BOT-13).
    expect(picker.components?.[0]?.components[0]?.options).toEqual([
      { label: "Lia Thornwhisper · 37 Priest", value: "LIA", default: true, description: "Healer / Damage · fits" },
      { label: "Zul Kazrek · 30 Warlock", value: "ZUL", description: "Damage · 2 below · tough" },
    ]);
    expect(picker.embeds[0]?.description).toBe("**Lia Thornwhisper** · fits\nPick a role, or another character.");
    expect(picker.components?.[1]?.components.map((c) => [c.label, c.custom_id])).toEqual([
      ["Healer", "run:7:role:LIA:healer"],
      ["Damage", "run:7:role:LIA:damage"],
    ]);

    // Picking the same character again keeps it, with its roles.
    const chosen = pressed("run:7:char", ["LIA"]);
    await actions.press(chosen.press, signal);
    expect(chosen.deferred).toEqual(["update"]);
    const roles = chosen.shown[0]!.content;
    expect(roles.components?.[0]?.components[0]?.options?.find((o) => o.default)?.value).toBe("LIA");

    site.runAnswers.set("POST runs/7/answers", {
      ok: true,
      body: {
        stored: { answer: "in", role: "healer", reserve: false },
        run: siteRun({ answers: [{ ...siteRun().answers[1], guid: "LIA" }] }),
      },
    });
    const role = pressed("run:7:role:LIA:healer");
    await actions.press(role.press, signal);
    expect(site.runCalls.at(-1)?.body).toEqual({
      discordUserId: USER,
      answer: "in",
      characterId: "LIA",
      role: "healer",
    });
    expect(role.shown[0]?.content.embeds[0]?.description).toBe(
      "You're in as Lia Thornwhisper (healer). The game shows it after the next sync.",
    );

    // A class with one role answers at once after the character is picked; 2 below may say I'm in (WEB-52).
    const warlock = pressed("run:7:char", ["ZUL"]);
    await actions.press(warlock.press, signal);
    expect(site.runCalls.at(-1)?.body).toMatchObject({ characterId: "ZUL", role: "damage" });
  });

  it("a full role makes a reserve; refusals in words; an old post's Pick my character still opens the picker", async () => {
    const { site, actions } = setup();
    const signal = new AbortController().signal;
    site.runAnswers.set("GET runs/7", { ok: true, body: { run: siteRun() } });
    site.runAnswers.set("GET runs/7/characters", { ok: true, body: { characters: [zul] } });
    site.runAnswers.set("POST runs/7/answers", {
      ok: true,
      body: { stored: { answer: "maybe", role: "damage", reserve: true, waitlisted: true }, run: siteRun() },
    });
    const imIn = pressed("run:7:role:ZUL:damage");
    await actions.press(imIn.press, signal);
    expect(site.runCalls.at(-1)?.body).toEqual({
      discordUserId: USER,
      answer: "in",
      characterId: "ZUL",
      role: "damage",
    });
    expect(imIn.shown[0]?.content.embeds[0]?.description).toBe(
      "Damage is full: you're reserve and move up first when a slot frees.",
    );

    site.runAnswers.set("POST runs/7/answers", { ok: false, status: 409, error: "closed" });
    const late = pressed("run:7:maybe");
    await actions.press(late.press, signal);
    expect(late.shown[0]?.content.embeds[0]?.description).toBe(
      "This run has started or was cancelled: answers are closed.",
    );

    site.runAnswers.set("GET runs/7/characters", { ok: false, status: 403, error: "not_linked" });
    const unlinked = pressed("run:7:pick");
    await actions.press(unlinked.press, signal);
    expect(unlinked.shown[0]?.content.embeds[0]?.title).toBe("Link your Discord first");
  });

  it("autocomplete: dungeons with who leads, days in the asker's calendar, only your own runs", () => {
    const read = readPlanChoices(choices);
    expect(dungeonChoices(read, "scar")).toEqual([
      { name: "Scarlet Monastery: Armory · 32–42 · fits Lia Thornwhisper", value: "sm-armory" },
    ]);
    expect(dayChoices(read, "")).toEqual([
      { name: "Today · Thu 19", value: "0" },
      { name: "Tomorrow · Fri 20", value: "1" },
    ]);
    const runs = [run(), run({ id: 8, organiser: { name: "Mira", discordId: "100000000000000009" } })];
    expect(runChoices(runs, IDS.nico, false, "Europe/Amsterdam", "")).toEqual([
      { name: "Scarlet Monastery: Armory · Tue 27 Oct 18:40", value: "7" },
    ]);
    expect(runChoices(runs, IDS.nico, true, "Europe/Amsterdam", "")).toHaveLength(2);
  });
});
