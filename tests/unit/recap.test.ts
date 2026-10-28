import { describe, expect, it } from "vitest";
import { markedEvents } from "../../src/core/message.js";
import { numbersLine, readRecap, recapFiles, recapMessage } from "../../src/core/recap.js";

// BOT-05: the weekly recap post from the site's `recap` event (web BOT-API.md). Made-up names (CLAUDE.md rule 1).
const SITE = "https://example.com";
const HOST = "example.com";

const EVENT = {
  week: 3,
  start: 1792929600,
  end: 1793534400,
  quiet: false,
  headline: { id: "sixty", text: "The week Mira Sunstrider hit 60" },
  numbers: { levels: 18, friendsPlayed: 5, runs: 7, newCharacters: 1 },
  award: {
    id: "A1",
    slot: "award",
    name: "Doombringers of the week · The Grinder",
    title: "Mira gained 9 levels",
    text: "Nobody climbed faster this week. Runner-up: Ves with 5 levels.",
    facts: { friend: "Mira" },
    friends: ["Mira#1001"],
  },
  cards: [
    {
      id: "S1",
      slot: "stat",
      name: "Zone of the week",
      title: "Stranglethorn Vale",
      text: "4 friends passed through.",
    },
    {
      id: "F12",
      slot: "fun",
      name: "Who am I?",
      title: "Who am I?",
      text: "A Troll Priest. Answer: ||Lia Thornwhisper||",
    },
  ],
  challenge: { id: "groupDungeon", text: "Three friends, one Shadowfang Keep: Ves, Lia, Tok." },
  closing: "See you next week.",
};

describe("readRecap", () => {
  it("reads the site's recap, leaving out what it doesn't know", () => {
    const recap = readRecap(EVENT)!;
    expect(recap).toMatchObject({
      week: 3,
      headline: "The week Mira Sunstrider hit 60",
      closing: "See you next week.",
    });
    expect(recap.cards.map((c) => c.id)).toEqual(["S1", "F12"]);
    expect(recap.award?.name).toBe("Doombringers of the week · The Grinder");
    // The friends' keys are the site's business, never the bot's.
    expect(JSON.stringify(recap)).not.toContain("#1001");
    expect(readRecap({ ...EVENT, cards: [{ id: "S1" }, "x"], award: null })).toMatchObject({ cards: [] });
    expect(readRecap({ week: 0, headline: { text: "x" } })).toBeUndefined();
    expect(readRecap({ week: 2 })).toBeUndefined();
    expect(readRecap(null)).toBeUndefined();
  });

  it("writes the numbers the site sent", () => {
    expect(numbersLine({ levels: 18, friendsPlayed: 5, runs: 1, newCharacters: 0 })).toBe(
      "+18 levels · 5 friends played · 1 dungeon run · 0 new characters",
    );
    expect(numbersLine({ levels: 2 })).toBe("+2 levels");
  });
});

describe("recapMessage", () => {
  const recap = readRecap(EVENT)!;

  it("asks for the header and, with Zone of the week, the zone map", () => {
    expect(recapFiles(recap)).toEqual([
      { name: "recap-3-header.png", path: "cards/recap-3-header.png" },
      { name: "recap-3-zone.png", path: "cards/recap-3-zone.png" },
    ]);
    expect(recapFiles({ ...recap, cards: [] })).toHaveLength(1);
  });

  it("posts the site's texts as written, with the images it could attach and the event's marker", () => {
    const message = recapMessage(recap, SITE, HOST, ["recap-3-header.png", "recap-3-zone.png"], 41);
    const [head, award, cards] = message.embeds;
    expect(head).toMatchObject({
      title: "The week Mira Sunstrider hit 60",
      url: "https://example.com/#e41",
      description: "+18 levels · 5 friends played · 7 dungeon runs · 1 new character",
      image: { url: "attachment://recap-3-header.png" },
    });
    expect(award).toMatchObject({ title: "Doombringers of the week · The Grinder" });
    expect(award?.description).toContain("Runner-up: Ves with 5 levels.");
    expect(cards?.fields?.map((f) => f.name)).toEqual(["Zone of the week", "Who am I?", "This week's challenge"]);
    expect(cards?.fields?.[1]?.value).toContain("||Lia Thornwhisper||");
    expect(cards?.image).toEqual({ url: "attachment://recap-3-zone.png" });
    expect(message.allowed_mentions).toEqual({ parse: [] });
    // A restart finds the post by its marker (rule 9).
    expect(markedEvents(SITE, [{ id: "m1", texts: [head!.url!] }]).get(41)).toBe("m1");
  });

  it("goes out without an image the bot couldn't fetch, and /recap carries no marker", () => {
    const message = recapMessage(recap, SITE, HOST, [], undefined);
    expect(message.embeds[0]?.image).toBeUndefined();
    expect(message.embeds[0]?.url).toBe("https://example.com/");
    expect(message.embeds.at(-1)?.image).toBeUndefined();
  });

  it("keeps within Discord's limits", () => {
    const long = readRecap({ ...EVENT, cards: [{ id: "S2", name: "x", title: "y", text: "z".repeat(2000) }] })!;
    expect(recapMessage(long, SITE, HOST, []).embeds.at(-1)?.fields?.[0]?.value.length).toBeLessThanOrEqual(1024);
  });
});

describe("recap card icons (BOT-14, board `bot-recap-v2-icons`)", () => {
  const SKULL = "<:cf_recap_deaths_abcdef:100000000000000301>";
  const SWORDS = "<:cf_recap_pvp_abcdef:100000000000000302>";
  const icons = { RECAP_DEATHS: SKULL, RECAP_PVP: SWORDS };
  const v2 = readRecap({
    ...EVENT,
    award: { id: "A11", name: "Doombringer of the week · Warmonger", title: "Ves took 142 kills", text: "Ouch." },
    cards: [
      { id: "F16", name: "Most deaths", title: "12 deaths", text: "The graveyard sends a fruit basket." },
      { id: "S2", name: "Class census", title: "Mages", text: "3 of them." },
      { id: "X99", name: "From a newer site", title: "Something", text: "New." },
    ],
  })!;

  it("starts each card's first line with its icon, the award's too", () => {
    const message = recapMessage(v2, SITE, HOST, [], 42, undefined, icons);
    expect(message.embeds[1]?.description?.startsWith(`${SWORDS} **Ves took 142 kills**`)).toBe(true);
    const values = message.embeds.at(-1)?.fields?.map((f) => f.value);
    expect(values?.[0]?.startsWith(`${SKULL} **12 deaths**`)).toBe(true);
  });

  it("shows no icon for a card without one, an unknown card, or before the emoji are uploaded", () => {
    const values = recapMessage(v2, SITE, HOST, [], 42, undefined, icons)
      .embeds.at(-1)
      ?.fields?.map((f) => f.value);
    expect(values?.[1]?.startsWith("**Mages**")).toBe(true);
    expect(values?.[2]?.startsWith("**Something**")).toBe(true);
    expect(recapMessage(v2, SITE, HOST, [], 42).embeds.at(-1)?.fields?.[0]?.value.startsWith("**12 deaths**")).toBe(
      true,
    );
  });
});
