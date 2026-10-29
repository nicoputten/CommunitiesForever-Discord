import { describe, expect, it } from "vitest";
import { CLASS_COLOURS, GOLD, markedEvents } from "../../src/core/message.js";
import { MAP_CREDIT, numberFields, readRecap, recapFiles, recapMessage } from "../../src/core/recap.js";

// BOT-05, BOT-20 (board `bot-visual-recap`): the weekly recap post from the site's `recap` event (web BOT-API.md).
// Made-up names (CLAUDE.md rule 1).
const SITE = "https://example.com";
const LADDER = "https://example.com/doomsday";

const EVENT = {
  week: 3,
  start: 1792929600,
  end: 1793534400,
  quiet: false,
  headline: { id: "sixty", text: "The week Mira Sunstrider hit 60" },
  numbers: { honorKills: 412, battlegrounds: 11, levels: 18, friendsPlayed: 5, runs: 7, feats: 14, newCharacters: 1 },
  url: "https://example.com/recap/3",
  award: {
    id: "A11",
    slot: "award",
    name: "Doombringer of the week · Warmonger",
    title: "Ves Doombringer took 142 honorable kills",
    text: "Runner-up: Bob Example with 97.",
    classFile: "WARLOCK",
    image: "recap-3-header",
    facts: { friend: "Ves" },
    friends: ["Ves#1001"],
  },
  cards: [
    {
      id: "S13",
      slot: "stat",
      name: "Bloodbath zone",
      title: "Stranglethorn Vale",
      text: "87 honorable kills.",
      image: "recap-3-s13",
    },
    { id: "P14", slot: "progress", name: "Rank race", title: "Stone Guard vs Stone Guard", text: "By a hair." },
    { id: "F12", slot: "social", name: "Who am I?", title: "Who am I?", text: "Answer: ||Lia Thornwhisper||" },
    { id: "F16", slot: "fun", name: "Most deaths", title: "12 deaths", text: "The graveyard sends a fruit basket." },
  ],
  challenge: { id: "bgGroup", text: "Win 3 battlegrounds as a group" },
  closing: "See you next week.",
  doomsday: {
    mostDevoted: { name: "Mira", days: 7 },
    perfectWeek: ["Tok"],
    points: {
      pve: [
        { name: "Mira", points: 120 },
        { name: "Tok", points: 95 },
      ],
      pvp: [{ name: "Bob", points: 310 }],
    },
  },
};

describe("readRecap", () => {
  it("reads the site's recap, leaving out what it doesn't know", () => {
    const recap = readRecap(EVENT)!;
    expect(recap).toMatchObject({
      week: 3,
      headline: "The week Mira Sunstrider hit 60",
      closing: "See you next week.",
      url: "https://example.com/recap/3",
    });
    expect(recap.cards.map((c) => [c.id, c.slot, c.image])).toEqual([
      ["S13", "stat", "recap-3-s13"],
      ["P14", "progress", undefined],
      ["F12", "social", undefined],
      ["F16", "fun", undefined],
    ]);
    expect(recap.award).toMatchObject({ classFile: "WARLOCK", image: "recap-3-header" });
    // The friends' keys are the site's business, never the bot's.
    expect(JSON.stringify(recap)).not.toContain("#1001");
    expect(readRecap({ ...EVENT, cards: [{ id: "S1" }, "x"], award: null })).toMatchObject({ cards: [] });
    expect(readRecap({ ...EVENT, url: "javascript:alert(1)" })?.url).toBeUndefined();
    expect(readRecap({ ...EVENT, cards: [{ ...EVENT.cards[0], image: "../x" }] })?.cards[0]?.image).toBeUndefined();
    expect(readRecap({ week: 0, headline: { text: "x" } })).toBeUndefined();
    expect(readRecap({ week: 2 })).toBeUndefined();
    expect(readRecap(null)).toBeUndefined();
  });

  it("writes the numbers the site sent as inline fields", () => {
    expect(numberFields({ honorKills: 1412, levels: 9, runs: 0 })).toEqual([
      { name: "Honorable kills", value: "1,412", inline: true },
      { name: "Levels", value: "+9", inline: true },
      { name: "Dungeon runs", value: "0", inline: true },
    ]);
  });
});

describe("recapMessage (board `bot-visual-recap`)", () => {
  const recap = readRecap(EVENT)!;
  const all = recapFiles(recap).map((f) => f.name);

  it("attaches the site's header and maps, and the bot's own icons", () => {
    expect(recapFiles(recap)).toEqual([
      { name: "recap-3-header.png", path: "cards/recap-3-header.png" },
      { name: "recap-3-s13.png", path: "cards/recap-3-s13.png" },
      { name: "recap_pvp.png", asset: "recap-icons/recap_pvp.png" },
      { name: "recap_deaths.png", asset: "recap-icons/recap_deaths.png" },
    ]);
    // An older site: the header by its old name, the zone map with Zone of the week.
    const old = readRecap({ ...EVENT, award: undefined, cards: [{ id: "S1", name: "Zone of the week", title: "x" }] })!;
    expect(recapFiles(old).map((f) => f.name)).toEqual(["recap-3-header.png", "recap-3-zone.png"]);
  });

  it("is one message of 8 embeds in the board's order, with the link buttons", () => {
    const message = recapMessage(recap, SITE, all, 41, LADDER);
    const [head, award, stat, progress, social, fun, doomsday, challenge] = message.embeds;
    expect(message.embeds).toHaveLength(8);
    expect(head).toMatchObject({
      title: "Weekly recap · week 3",
      url: "https://example.com/#e41",
      // The headline only: the closing line stays on the site, as the board shows.
      description: "**The week Mira Sunstrider hit 60**",
      color: GOLD,
    });
    expect(head?.fields?.map((f) => `${f.name} ${f.value}`)).toEqual([
      "Honorable kills 412",
      "Battlegrounds 11",
      "Levels +18",
      "Friends played 5",
      "Dungeon runs 7",
      "Feats 14",
    ]);
    expect(award).toEqual({
      author: { name: "Doombringer of the week · Warmonger", icon_url: "attachment://recap_pvp.png" },
      description: "**Ves Doombringer took 142 honorable kills**\nRunner-up: Bob Example with 97.",
      color: CLASS_COLOURS.WARLOCK,
      image: { url: "attachment://recap-3-header.png" },
    });
    expect(stat).toMatchObject({
      title: "Bloodbath zone",
      color: 0xe0625a,
      image: { url: "attachment://recap-3-s13.png" },
      footer: { text: MAP_CREDIT },
    });
    expect(stat?.thumbnail).toBeUndefined();
    expect(progress).toMatchObject({ title: "Rank race", thumbnail: { url: "attachment://recap_pvp.png" } });
    // A card without an icon: gold, no thumbnail; "Who am I?" keeps its spoiler.
    expect(social).toMatchObject({ title: "Who am I?", color: GOLD });
    expect(social?.thumbnail).toBeUndefined();
    expect(social?.description).toContain("||Lia Thornwhisper||");
    expect(fun).toMatchObject({ color: 0xd9d4c7, thumbnail: { url: "attachment://recap_deaths.png" } });
    expect(doomsday).toMatchObject({
      title: "Doomsday · this week",
      fields: [
        { name: "PvE top 3", value: "1. **Mira** 120\n2. **Tok** 95", inline: true },
        { name: "PvP top 3", value: "1. **Bob** 310", inline: true },
      ],
      footer: { text: "Most devoted: Mira, goals on all 7 days" },
    });
    expect(challenge).toEqual({
      title: "This week's challenge",
      description: "Win 3 battlegrounds as a group",
      color: 0x4e5058,
    });
    expect(message.components).toEqual([
      {
        type: 1,
        components: [
          { type: 2, style: 5, label: "The full week ↗", url: "https://example.com/recap/3" },
          { type: 2, style: 5, label: "Doomsday ladder ↗", url: LADDER },
        ],
      },
    ]);
    expect(message.allowed_mentions).toEqual({ parse: [] });
    // A restart finds the post by its marker (rule 9); no test footer on a real post.
    expect(markedEvents(SITE, [{ id: "m1", texts: [head!.url!] }]).get(41)).toBe("m1");
    expect(JSON.stringify(message)).not.toContain("not real");
  });

  it("goes out without the images it couldn't get, and /recap carries no marker", () => {
    const message = recapMessage(recap, SITE, [], undefined);
    expect(message.embeds.every((e) => e.image === undefined && e.thumbnail === undefined)).toBe(true);
    expect(message.embeds[1]?.author).toEqual({ name: "Doombringer of the week · Warmonger" });
    expect(message.embeds[2]?.footer).toBeUndefined();
    expect(message.embeds[0]?.url).toBe("https://example.com/");
  });

  it("without an award, puts the header image on top; without Doomsday, no ladder button", () => {
    const quiet = readRecap({ ...EVENT, award: undefined, doomsday: undefined, cards: [], url: undefined })!;
    const message = recapMessage(quiet, SITE, ["recap-3-header.png"], 41);
    expect(message.embeds[0]?.image).toEqual({ url: "attachment://recap-3-header.png" });
    expect(message.embeds.map((e) => e.title)).toEqual(["Weekly recap · week 3", "This week's challenge"]);
    expect(message.components?.[0]?.components).toEqual([
      { type: 2, style: 5, label: "The full week ↗", url: "https://example.com/" },
    ]);
  });

  it("keeps within Discord's limits", () => {
    const long = readRecap({ ...EVENT, cards: [{ id: "S2", name: "x", title: "y", text: "z".repeat(5000) }] })!;
    expect(recapMessage(long, SITE, []).embeds[2]?.description?.length).toBeLessThanOrEqual(4096);
  });
});
