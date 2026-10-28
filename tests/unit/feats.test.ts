import { describe, expect, it } from "vitest";
import { decide, readMilestones } from "../../src/core/events.js";
import { featLine, featSentence, ordinal, thousands } from "../../src/core/feats.js";
import { type Milestone, milestoneMessage } from "../../src/core/milestones.js";

// Made-up names (CLAUDE.md rule 1).
const SITE = "https://example.com";
const HOST = "example.com";
const ada = { guid: "Player-1-ADA", name: "Ada Nightshade", classFile: "WARLOCK" };
const WHO = "**Ada Nightshade**";

/** A feat as the site sends it (BOT-API.md "Feats"), read the way the bot reads the feed. */
function feat(fields: Record<string, unknown>): Milestone {
  const [read] = readMilestones({ milestones: [{ character: ada, ...fields }] });
  if (read === undefined) throw new Error("not read");
  return read;
}

describe("feat wording per kind (BOT-14)", () => {
  const cases: { fields: Record<string, unknown>; sentence: string; line: string }[] = [
    { fields: { kind: "level", level: 30, from: 28 }, sentence: `${WHO} hit level 30.`, line: "Level 30" },
    { fields: { kind: "maxLevel", level: 60 }, sentence: `${WHO} reached level 60.`, line: "Level 60" },
    {
      fields: { kind: "professionCap", profession: "Alchemy", rank: 225 },
      sentence: `${WHO} maxed Alchemy at 225.`,
      line: "Alchemy 225, maxed",
    },
    {
      fields: { kind: "professionCap", profession: "First Aid", rank: 300, title: "Field Medic" },
      sentence: `${WHO} is now a **Field Medic**: maxed First Aid at 300.`,
      line: "**Field Medic** · First Aid 300",
    },
    {
      fields: { kind: "newCharacter", character: { ...ada, level: 12 } },
      sentence: `New character: ${WHO}, level 12 Warlock.`,
      line: "New character · level 12 Warlock",
    },
    { fields: { kind: "honorKills", kills: 1 }, sentence: `First blood: ${WHO}.`, line: "First blood" },
    {
      fields: { kind: "honorKills", kills: 1000 },
      sentence: `${WHO} reached **1,000** honorable kills.`,
      line: "1,000 honorable kills",
    },
    {
      fields: { kind: "pvpRank", rank: 6, rankName: "Stone Guard", title: "Mailbox Menace" },
      sentence: `${WHO} is now a **Stone Guard**, a.k.a. **Mailbox Menace**.`,
      line: "**Stone Guard**, a.k.a. **Mailbox Menace** · rank 6",
    },
    {
      fields: { kind: "pvpRank", rank: 3, rankName: "Sergeant", title: "Lowbie Botherer" },
      sentence: `${WHO} is now a **Sergeant**, a.k.a. **Lowbie Botherer**. Cards start at rank 6, keep going.`,
      line: "**Sergeant**, a.k.a. **Lowbie Botherer** · rank 3",
    },
    { fields: { kind: "duelWins", wins: 50 }, sentence: `${WHO} won **50** duels.`, line: "50 duel wins" },
    {
      fields: { kind: "bgFirstWin", battleground: "Warsong Gulch" },
      sentence: `${WHO} won **Warsong Gulch** for the first time.`,
      line: "First win in Warsong Gulch",
    },
    {
      fields: { kind: "deaths100", deaths: 100 },
      sentence: `${WHO} died 100 times. A spirit healer's best friend.`,
      line: "100 deaths · a spirit healer's best friend",
    },
    {
      fields: { kind: "firstEpic", item: { id: 1, name: "Robes of the Exalted", slot: "Chest", level: 58 } },
      sentence: `First epic for ${WHO}: **Robes of the Exalted** · chest · looted at level 58.`,
      line: "**First epic:** **Robes of the Exalted** · chest · looted at level 58",
    },
    {
      fields: { kind: "mount", riding: 75, level: 40, place: 3 },
      sentence: `${WHO} got a mount at level 40, the 3rd mount in the group.`,
      line: "Mount · riding 75 · the 3rd mount in the group",
    },
    {
      fields: { kind: "epicMount", riding: 150, level: 60, place: 1 },
      sentence: `${WHO} got an epic mount at level 60, the first epic mount in the group.`,
      line: "Epic mount · riding 150 · the first epic mount in the group",
    },
    { fields: { kind: "firstCatch" }, sentence: `${WHO} caught a first fish.`, line: "First catch" },
    {
      fields: {
        kind: "jackOfAllTrades",
        professions: ["Alchemy", "Herbalism", "Cooking", "First Aid", "Fishing"],
      },
      sentence: `${WHO} is a **Jack of all trades**: Alchemy, Herbalism, Cooking, First Aid and Fishing at 300.`,
      line: "**Jack of all trades** · Alchemy, Herbalism, Cooking, First Aid and Fishing at 300",
    },
    {
      fields: { kind: "notableItem", notable: "arcaniteReaper", item: { id: 2, name: "Arcanite Reaper" } },
      sentence: `${WHO} made an **Arcanite Reaper**.`,
      line: "Arcanite Reaper made",
    },
    {
      fields: { kind: "notableItem", notable: "arcaniteTransmute", item: { id: 3, name: "Arcanite Bar" } },
      sentence: `${WHO} did a first Arcanite transmute.`,
      line: "First Arcanite transmute",
    },
    {
      fields: { kind: "notableItem", notable: "mooncloth", item: { id: 4, name: "Mooncloth" } },
      sentence: `${WHO} made a first **Mooncloth**.`,
      line: "First Mooncloth",
    },
    {
      fields: { kind: "notableItem", notable: "devilsaur", item: { id: 5, name: "Devilsaur Leggings" } },
      sentence: `${WHO} made **Devilsaur Leggings**.`,
      line: "Devilsaur set · **Devilsaur Leggings**",
    },
    {
      fields: { kind: "notableItem", notable: "extravaganzaJoined", item: { id: 6, name: "Speckled Tastyfish" } },
      sentence: `${WHO} joined the Stranglethorn Fishing Extravaganza.`,
      line: "Joined the Fishing Extravaganza",
    },
    {
      fields: { kind: "notableItem", notable: "extravaganzaWon", item: { id: 7, name: "Arcanite Fishing Pole" } },
      sentence: `${WHO} won the Stranglethorn Fishing Extravaganza: **Arcanite Fishing Pole**.`,
      line: "Won the Fishing Extravaganza · **Arcanite Fishing Pole**",
    },
    {
      fields: { kind: "notableItem", notable: "somethingNewer", item: { id: 8, name: "Shiny Thing" } },
      sentence: `${WHO} got **Shiny Thing**.`,
      line: "**Shiny Thing**",
    },
  ];

  for (const { fields, sentence, line } of cases) {
    it(`words ${String(fields.kind)}${fields.notable ? ` (${String(fields.notable)})` : ""}`, () => {
      const m = feat(fields);
      expect(featSentence(m, WHO)).toBe(sentence);
      expect(featLine(m)).toBe(line);
    });
  }

  it("leaves wording to the site's text when the fields it needs are missing", () => {
    for (const kind of ["honorKills", "pvpRank", "duelWins", "bgFirstWin", "firstEpic", "notableItem"]) {
      const m = feat({ kind });
      expect(featSentence(m, WHO)).toBeUndefined();
      expect(featLine(m)).toBeUndefined();
    }
  });

  it("formats numbers and places", () => {
    expect(thousands(10000)).toBe("10,000");
    expect(thousands(100)).toBe("100");
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 103].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "103rd",
    ]);
  });

  it("escapes names from the game", () => {
    expect(featLine(feat({ kind: "bgFirstWin", battleground: "*Gulch*" }))).toBe("First win in \\*Gulch\\*");
  });
});

describe("feats from the site (BOT-14)", () => {
  it("reads the badge, the text and the card on every kind, and the event's card", () => {
    const data = {
      card: "milestone-50-0",
      milestones: [
        { kind: "honorKills", character: ada, kills: 1, text: "First blood: Ada Nightshade", firstInGroup: true },
        { kind: "duelWins", character: ada, wins: 10, card: "nope", firstInGroup: "yes" },
      ],
    };
    expect(readMilestones(data)).toEqual([
      {
        index: 0,
        kind: "honorKills",
        character: { ...ada, level: undefined, ownerName: undefined },
        kills: 1,
        text: "First blood: Ada Nightshade",
        firstInGroup: true,
      },
      {
        index: 1,
        kind: "duelWins",
        character: { ...ada, level: undefined, ownerName: undefined },
        wins: 10,
        card: "nope",
      },
    ]);
    expect(decide({ id: 50, type: "milestones", data }, {}, new Map(), SITE, HOST)).toMatchObject({
      do: "post",
      card: "milestone-50-0",
    });
  });

  it("posts a kind it doesn't know with the site's text, and skips one without text", () => {
    const read = readMilestones({
      milestones: [
        { kind: "reputation", character: ada, text: "Ada Nightshade is Exalted with the Argent Dawn" },
        { kind: "reputation2", character: ada },
      ],
    });
    expect(read).toEqual([
      {
        index: 0,
        kind: "other",
        character: { ...ada, level: undefined, ownerName: undefined },
        text: "Ada Nightshade is Exalted with the Argent Dawn",
      },
    ]);
    expect(milestoneMessage(51, read, SITE, HOST)?.embeds[0]?.description).toBe(
      "Ada Nightshade is Exalted with the Argent Dawn\n**[Ada Nightshade](https://example.com/character/Player-1-ADA#e51)**",
    );
    expect(
      decide(
        { id: 52, type: "milestones", data: { milestones: [{ kind: "x", character: ada }] } },
        {},
        new Map(),
        SITE,
        HOST,
      ).do,
    ).toBe("leave");
  });

  it("uses the site's text for a known kind it can't word", () => {
    const m = feat({ kind: "honorKills", text: "First blood: Ada Nightshade" });
    expect(milestoneMessage(53, [m], SITE, HOST)?.embeds[0]?.description).toBe(
      // Escaped like any text from the site: Discord shows "First blood: Ada Nightshade".
      "First blood\\: Ada Nightshade\n**[Ada Nightshade](https://example.com/character/Player-1-ADA#e53)**",
    );
  });

  it("puts the badge under one feat and after a feat's line among several", () => {
    const rank = feat({
      kind: "pvpRank",
      rank: 6,
      rankName: "Stone Guard",
      title: "Mailbox Menace",
      firstInGroup: true,
    });
    expect(milestoneMessage(54, [rank], SITE, HOST)?.embeds[0]?.description).toBe(
      "**[Ada Nightshade](https://example.com/character/Player-1-ADA#e54)** is now a **Stone Guard**, a.k.a. **Mailbox Menace**.\n**First in the group**",
    );
    const mount = feat({ kind: "mount", riding: 75, level: 40, place: 1, firstInGroup: true });
    expect(milestoneMessage(55, [rank, mount], SITE, HOST)?.embeds[0]?.description).toContain(
      "- Mount · riding 75 · the first mount in the group · **First in the group**",
    );
  });
});
