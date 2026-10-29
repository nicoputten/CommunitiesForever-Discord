import { describe, expect, it } from "vitest";
import type { Attachment, ButtonPress, SlashCommand } from "../../src/adapters/discord.js";
import { commandHandlers } from "../../src/app/commands.js";
import { SHARE_FOR_MS } from "../../src/app/lookups.js";
import type { MessageContent } from "../../src/core/message.js";
import { FakeSite, logger } from "./fakes.js";

// BOT-05 `/recap` and BOT-06 the look-ups: answers only for the asker, anyone in the server (Nico, 2026-10-28), only
// `/me` needs a link; Share posts a copy. Made-up names and ids (CLAUDE.md rule 1).
const SITE = "https://example.com";
const USER = "100000000000000021";
const NOW = 1_793_112_000_000;

function asked(name: string, options: Record<string, string | boolean> = {}) {
  const answers: { content: MessageContent; files: string[] }[] = [];
  let done: () => void = () => undefined;
  const answered = new Promise<void>((resolve) => (done = resolve));
  const command: SlashCommand = {
    name,
    userId: USER,
    options,
    async reply(content, files: readonly Attachment[] = []) {
      answers.push({ content, files: files.map((f) => f.name) });
      done();
    },
  };
  return { command, answers, answered };
}

function setup() {
  const site = new FakeSite();
  let now = NOW;
  const handlers = commandHandlers(
    { siteUrl: SITE, site, log: logger().log, now: () => now },
    new AbortController().signal,
  );
  return { site, handlers, later: (ms: number) => (now += ms) };
}

const ves = {
  guid: "Player-1-VES",
  name: "Ves Doombringer",
  owner: "Nico",
  classFile: "WARLOCK",
  className: "Warlock",
  race: "Undead",
  level: 39,
  role: "dps",
  spec: "Destruction",
  ilvl: 34,
  talents: [10, 0, 20],
  professions: [{ name: "Tailoring", rank: 187, max: 225 }],
  seen: { zone: "Stranglethorn Vale", at: NOW / 1000 - 7200 },
};

describe("/recap", () => {
  it("answers with the last recap and its images, without the post's marker", async () => {
    const { site, handlers } = setup();
    site.recap = { week: 5, headline: { text: "Dungeon week" }, numbers: { levels: 9 }, cards: [] };
    site.images.set("cards/recap-5-header.png", new Uint8Array([1]));
    const { command, answers, answered } = asked("recap");
    handlers.command(command);
    await answered;
    expect(answers[0]?.files).toEqual(["recap-5-header.png"]);
    expect(answers[0]?.content.embeds[0]).toMatchObject({
      title: "Weekly recap · week 5",
      description: "**Dungeon week**",
      url: "https://example.com/",
    });
  });

  it("says there is no recap yet before the first one", async () => {
    const { handlers } = setup();
    const { command, answers, answered } = asked("recap");
    handlers.command(command);
    await answered;
    expect(answers[0]?.content.embeds[0]?.title).toBe("No recap yet");
  });
});

describe("look-ups", () => {
  it("/whereis: the friend's characters with the card image, Share and a link to the site", async () => {
    const { site, handlers } = setup();
    site.lookupAnswers.set("whereis", {
      ok: true,
      body: { asker: "Ada", friend: "Nico", characters: [ves], card: "Player-1-VES" },
    });
    site.images.set("cards/whereis-Player-1-VES.png", new Uint8Array([1]));
    const { command, answers, answered } = asked("whereis", { friend: "Nico" });
    handlers.command(command);
    await answered;
    expect(site.lookups[0]).toEqual({ what: "whereis", params: { discordUserId: USER, friend: "Nico" } });
    const answer = answers[0]!;
    expect(answer.files).toEqual(["whereis-Player-1-VES.png"]);
    expect(answer.content.embeds[0]).toMatchObject({
      title: "Nico's characters",
      image: { url: "attachment://whereis-Player-1-VES.png" },
    });
    expect(answer.content.embeds[0]?.description).toContain(
      "**Ves Doombringer** 39 Warlock · Stranglethorn Vale · 2 h",
    );
    const buttons = answer.content.components?.[0]?.components ?? [];
    expect(buttons.map((b) => b.label)).toEqual(["Share", "Open on site ↗"]);
  });

  it("/who, /whocancraft and /character as on the board", async () => {
    const { site, handlers } = setup();
    site.lookupAnswers.set("who", { ok: true, body: { total: 1, characters: [{ ...ves, role: "heal" }] } });
    site.lookupAnswers.set("whocancraft", {
      ok: true,
      body: { profession: "Tailoring", crafters: [{ ...ves, rank: 300, max: 300, best: true }] },
    });
    site.lookupAnswers.set("character", { ok: true, body: { character: ves } });

    const who = asked("who", { level: "30-40", role: "healer" });
    handlers.command(who.command);
    await who.answered;
    expect(who.answers[0]?.content.embeds[0]?.title).toBe("1 healer between 30 and 40");

    const craft = asked("whocancraft", { profession: "Tailoring" });
    handlers.command(craft.command);
    await craft.answered;
    expect(craft.answers[0]?.content.embeds[0]).toMatchObject({ title: "Tailoring · covered" });
    expect(craft.answers[0]?.content.embeds[0]?.description).toContain(
      "★ **Ves Doombringer** 300 / 300 · Warlock · Nico",
    );

    const card = asked("character", { name: "Player-1-VES" });
    handlers.command(card.command);
    await card.answered;
    const embed = card.answers[0]?.content.embeds[0];
    expect(embed?.title).toBe("Ves Doombringer");
    expect(embed?.description).toContain("39 Undead Warlock · Destruction · Nico");
    expect(embed?.fields?.map((f) => f.value)).toEqual(["34", "10/0/20", "Stranglethorn Vale · 2 h"]);
  });

  it("/me needs a link: 'Link your Discord first' without one, the week line with one", async () => {
    const { site, handlers } = setup();
    site.lookupAnswers.set("me", { ok: false, status: 403 });
    const unlinked = asked("me");
    handlers.command(unlinked.command);
    await unlinked.answered;
    expect(unlinked.answers[0]?.content.embeds[0]?.title).toBe("Link your Discord first");

    site.lookupAnswers.set("me", {
      ok: true,
      body: { friend: "Nico", characters: [ves], week: { levels: 6, quests: 14, runs: 2 } },
    });
    const linked = asked("me");
    handlers.command(linked.command);
    await linked.answered;
    expect(linked.answers[0]?.content.embeds[0]?.title).toBe("Nico · 1 character");
    expect(linked.answers[0]?.content.embeds[0]?.description).toContain(
      "**This week:** +6 levels · 14 quests · 2 dungeon runs",
    );
  });

  it("says when nothing is found or the site is away", async () => {
    const { site, handlers } = setup();
    const missing = asked("alts", { friend: "Nobody" });
    handlers.command(missing.command);
    await missing.answered;
    expect(missing.answers[0]?.content.embeds[0]?.title).toBe("Not found");
    site.lookupAnswers.set("alts", { ok: false });
    const away = asked("alts", { friend: "Nico" });
    handlers.command(away.command);
    await away.answered;
    expect(away.answers[0]?.content.embeds[0]?.title).toBe("The site isn't answering");
  });
});

describe("Share", () => {
  it("posts the answer in the channel once, 'Shared by' the asker, while the button is fresh", async () => {
    const { site, handlers, later } = setup();
    site.lookupAnswers.set("alts", { ok: true, body: { asker: "Ada", friend: "Nico", characters: [ves] } });
    const { command, answers, answered } = asked("alts", { friend: "Nico" });
    handlers.command(command);
    await answered;
    const customId = answers[0]!.content.components![0]!.components[0]!.custom_id!;

    const shared: MessageContent[] = [];
    const press = (id: string): ButtonPress => ({
      customId: id,
      userId: USER,
      values: [],
      async share(content) {
        shared.push(content);
      },
      defer: () => undefined,
      reply: async () => undefined,
      update: async () => undefined,
    });
    handlers.button(press(customId));
    await new Promise((r) => setTimeout(r, 0));
    expect(shared).toHaveLength(1);
    expect(shared[0]?.embeds[0]?.description).toContain("-# Shared by Ada");
    expect(shared[0]?.components).toBeUndefined();
    // Once only.
    handlers.button(press(customId));
    await new Promise((r) => setTimeout(r, 0));
    expect(shared).toHaveLength(1);

    // An old button does nothing.
    const again = asked("alts", { friend: "Nico" });
    handlers.command(again.command);
    await again.answered;
    later(SHARE_FOR_MS + 1);
    handlers.button(press(again.answers[0]!.content.components![0]!.components[0]!.custom_id!));
    await new Promise((r) => setTimeout(r, 0));
    expect(shared).toHaveLength(1);
  });
});

describe("autocomplete", () => {
  it("offers friends, characters and professions from the site", async () => {
    const { site, handlers } = setup();
    site.lookupAnswers.set("names", { ok: true, body: { names: [{ kind: "friend", name: "Nico", value: "Nico" }] } });
    site.lookupAnswers.set("professions", { ok: true, body: { professions: ["Alchemy", "Tailoring"] } });
    const responses: { name: string; value: string }[][] = [];
    const ask = (option: string, value: string) =>
      new Promise<void>((resolve) =>
        handlers.autocomplete({
          command: "whereis",
          userId: USER,
          option,
          value,
          async respond(choices) {
            responses.push([...choices]);
            resolve();
          },
        }),
      );
    await ask("friend", "ni");
    expect(site.lookups.at(-1)).toEqual({ what: "names", params: { q: "ni", kind: "friend" } });
    expect(responses[0]).toEqual([{ name: "Nico", value: "Nico" }]);
    await ask("profession", "tail");
    expect(responses[1]).toEqual([{ name: "Tailoring", value: "Tailoring" }]);
  });
});
