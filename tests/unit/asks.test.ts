import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ButtonPress, SlashCommand } from "../../src/adapters/discord.js";
import { runPoster } from "../../src/app/poster.js";
import { RunActions } from "../../src/app/runActions.js";
import type { MessageContent } from "../../src/core/message.js";
import { askMessage, markedAsks, readAsk } from "../../src/core/runs.js";
import { CHANNEL, FakeDiscord, FakeSite, logger } from "./fakes.js";

// BOT-12: `/ask` and answering asks (web WEB-51). One post per ask, edited as answers come in, "Expired" without
// buttons after its 10 minutes, also after a restart. Made-up names and ids (CLAUDE.md rule 1).
const SITE = "https://example.com";
const NOW = 1_793_112_000;
const RUNS_CHANNEL = "100000000000000060";
const IDS = { nico: "100000000000000001", femke: "100000000000000003" };

function siteAsk(over: Record<string, unknown> = {}) {
  return {
    id: 12,
    dungeon: { id: "dm", name: "The Deadmines", typicalLevels: { min: 17, max: 26 } },
    from: { name: "Nico", discordId: IDS.nico },
    character: "Grom Ashfeller",
    role: "tank",
    source: "discord",
    at: NOW,
    expiresAt: NOW + 600,
    state: "open",
    answers: [
      { name: "Nico", character: "Grom Ashfeller", discordId: IDS.nico, answer: "in", role: "tank", level: 24 },
    ],
    ...over,
  };
}

const ask = (over: Record<string, unknown> = {}) => readAsk({ ask: siteAsk(over) })!;
const labels = (m: MessageContent) => (m.components ?? []).flatMap((r) => r.components.map((c) => c.label));

describe("the ask post", () => {
  it("lists the answers and has the answer buttons while open", () => {
    const m = askMessage(
      ask({
        answers: [
          { name: "Nico", character: "Grom Ashfeller", answer: "in", role: "tank" },
          { name: "Mira", character: "Kel Dawnhammer", answer: "in", role: "healer" },
          { name: "Femke", answer: "cant", role: "damage" },
        ],
      }),
      { siteUrl: SITE, now: NOW + 60, eventId: 5 },
    );
    const e = m.embeds[0]!;
    expect(e.title).toBe("The Deadmines · now");
    expect(e.url).toBe(`${SITE}/runs#a12`);
    expect(e.description).toContain(`Levels 17–26 · ends <t:${NOW + 600}:R>`);
    expect(e.description).toContain("**In** · Grom Ashfeller (Nico) · Kel Dawnhammer (Mira)");
    expect(e.description).toContain("**Can't** · Femke");
    expect(e.footer?.text).toBe("asked on Discord · ends in a party invite in game");
    expect(labels(m)).toEqual(["I'm in", "Maybe", "Can't"]);
  });

  it("is Expired without buttons after its 10 minutes, by the site's state or by the time", () => {
    for (const m of [
      askMessage(ask({ state: "expired" }), { siteUrl: SITE, now: NOW + 60, eventId: 5 }),
      askMessage(ask(), { siteUrl: SITE, now: NOW + 600, eventId: 5 }),
    ]) {
      expect(m.embeds[0]?.title).toBe("The Deadmines · Expired");
      expect(m.embeds[0]?.description).toContain(`Asked at <t:${NOW}:t> · 1 answered`);
      expect(m.components).toEqual([]);
    }
    expect([...markedAsks(SITE, [{ id: "m1", texts: [`${SITE}/runs#a12`] }])]).toEqual([[12, "m1"]]);
  });
});

describe("ask events in the runs channel", () => {
  let site: FakeSite;
  let discord: FakeDiscord;
  let now: number;
  let stop: AbortController;

  beforeEach(() => {
    vi.useFakeTimers();
    site = new FakeSite();
    site.settingsBody = { posts: { milestones: true, runs: true }, channels: { posts: CHANNEL, runs: RUNS_CHANNEL } };
    discord = new FakeDiscord();
    now = NOW * 1000;
    stop = new AbortController();
  });

  afterEach(() => {
    stop.abort();
    vi.useRealTimers();
  });

  const start = () => runPoster({ siteUrl: SITE, site, discord, log: logger().log, now: () => now }, stop.signal);

  it("posts an ask once, edits it as answers come in, and ends it after a restart", async () => {
    site.add({ id: 1, type: "askNow", data: { ask: siteAsk() } });
    const first = start();
    await vi.waitFor(() => expect(site.acked.size).toBe(1));
    site.add({
      id: 2,
      type: "askChanged",
      data: {
        ask: siteAsk({
          answers: [
            ...siteAsk().answers,
            { name: "Femke", character: "Lia Thornwhisper", answer: "in", role: "healer" },
          ],
        }),
      },
    });
    await vi.waitFor(() => expect(site.acked.size).toBe(2));
    expect(discord.messages).toHaveLength(1);
    expect(discord.messages[0]?.content.embeds[0]?.description).toContain("Lia Thornwhisper (Femke)");
    stop.abort();
    await first;

    // After a restart: the expiry finds the post by its marker and ends it.
    stop = new AbortController();
    now = (NOW + 600) * 1000;
    site.add({ id: 3, type: "askExpired", data: { ask: siteAsk({ state: "expired" }) } });
    const second = start();
    await vi.waitFor(() => expect(site.acked.size).toBe(3));
    expect(discord.messages).toHaveLength(1);
    const post = discord.messages[0]!;
    expect(post.content.embeds[0]?.title).toBe("The Deadmines · Expired");
    expect(post.content.components).toEqual([]);
    expect(site.acked.get(3)).toBe(post.id);
    stop.abort();
    await second;
  });
});

describe("/ask and answering an ask", () => {
  const choices = {
    timeZone: "Europe/Amsterdam",
    admin: false,
    days: [],
    dungeons: [
      {
        id: "dm",
        name: "The Deadmines",
        typicalLevels: { min: 17, max: 26 },
        lead: { guid: "GROM", name: "Grom Ashfeller", level: 24, role: "tank", fit: { kind: "fits", label: "fits" } },
      },
    ],
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

  function pressed(customId: string, values: string[] = []) {
    const shown: MessageContent[] = [];
    const press: ButtonPress = {
      customId,
      userId: IDS.femke,
      values,
      share: async () => undefined,
      defer: () => undefined,
      reply: async (content) => void shown.push(content),
      update: async (content) => void shown.push(content),
    };
    return { press, shown };
  }

  it("/ask asks on the site's suggested character and says Discord can't whisper in game", async () => {
    const { site, actions } = setup();
    site.runAnswers.set("GET plan", { ok: true, body: choices });
    site.runAnswers.set("POST asks", { ok: true, body: { ask: siteAsk() } });
    const answers: MessageContent[] = [];
    const command: SlashCommand = {
      name: "ask",
      userId: IDS.nico,
      options: { dungeon: "dm", note: "Quick one" },
      reply: async (content) => void answers.push(content),
    };
    await actions.command(command, new AbortController().signal);
    expect(site.runCalls.find((c) => c.method === "POST")).toEqual({
      method: "POST",
      path: "asks",
      body: { discordUserId: IDS.nico, dungeonId: "dm", note: "Quick one", leadGuid: "GROM" },
    });
    const e = answers[0]!.embeds[0]!;
    expect(e.title).toBe("Asked · The Deadmines, now");
    expect(e.description).toContain(`Posted in <#${RUNS_CHANNEL}>. It expires <t:${NOW + 600}:R>.`);
    expect(e.description).toContain("You're in as Grom Ashfeller (tank).");
    expect(e.description).toContain("Discord can't whisper anyone in game.");
  });

  it("answers an ask from its buttons, and refuses once it expired", async () => {
    const { site, actions } = setup();
    const signal = new AbortController().signal;
    site.runAnswers.set("GET asks/12", { ok: true, body: { ask: siteAsk() } });
    site.runAnswers.set("GET asks/12/characters", {
      ok: true,
      body: {
        characters: [
          { guid: "LIA", name: "Lia Thornwhisper", level: 37, roles: ["healer", "damage"], fit: "carry · +11" },
        ],
      },
    });
    site.runAnswers.set("POST asks/12/answers", {
      ok: true,
      body: {
        stored: { answer: "in", role: "healer" },
        ask: siteAsk({
          answers: [{ name: "Femke", character: "Lia Thornwhisper", guid: "LIA", answer: "in", role: "healer" }],
        }),
      },
    });
    // I'm in opens the picker with the best character; its role button answers (BOT-13).
    const imIn = pressed("ask:12:in");
    await actions.press(imIn.press, signal);
    expect(imIn.shown[0]?.components?.[1]?.components[0]?.custom_id).toBe("ask:12:role:LIA:healer");
    imIn.shown.length = 0;
    const role = pressed("ask:12:role:LIA:healer");
    await actions.press(role.press, signal);
    imIn.shown.push(...role.shown);
    expect(site.runCalls.at(-1)).toMatchObject({
      method: "POST",
      path: "asks/12/answers",
      body: { discordUserId: IDS.femke, answer: "in", characterId: "LIA", role: "healer" },
    });
    expect(imIn.shown[0]?.embeds[0]?.description).toBe(
      "You're in as Lia Thornwhisper (healer). The game shows it after the next sync.",
    );
    // Pick my character: the picker's ids are the ask's.
    const pick = pressed("ask:12:pick");
    await actions.press(pick.press, signal);
    expect(pick.shown[0]?.components?.[0]?.components[0]?.custom_id).toBe("ask:12:char");

    site.runAnswers.set("POST asks/12/answers", { ok: false, status: 409, error: "expired" });
    const late = pressed("ask:12:maybe");
    await actions.press(late.press, signal);
    expect(late.shown[0]?.embeds[0]?.description).toBe("This ask has expired: its 10 minutes are over.");
  });
});
