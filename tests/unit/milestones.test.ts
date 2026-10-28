import { describe, expect, it } from "vitest";
import { decide, readEvents, readMilestones } from "../../src/core/events.js";
import {
  EPIC_PURPLE,
  type Milestone,
  groupedMessage,
  joinsPost,
  milestoneFiles,
  milestoneMessage,
} from "../../src/core/milestones.js";
import { GOLD, escapeMarkdown, markedEvents } from "../../src/core/message.js";

// Made-up names (CLAUDE.md rule 1).
const SITE = "https://example.com";
const HOST = "example.com";
const mira = { guid: "Player-1-MIRA", name: "Mira Sunstrider", classFile: "MAGE", level: 60, ownerName: "Mira" };
const ves = { guid: "Player-1-VES", name: "Ves Doombringer", classFile: "WARRIOR", level: 40, ownerName: "Nico" };
const lia = { guid: "Player-1-LIA", name: "Lia Thornwhisper", classFile: "PRIEST", ownerName: "Femke" };
const zul = { guid: "Player-1-ZUL", name: "Zul Kazrek", classFile: "WARLOCK", level: 15, ownerName: "Femke" };

describe("milestoneMessage (feats, BOT-14)", () => {
  it('posts one feat as "Feat unlocked" with a sentence, the marker on the character link', () => {
    const message = milestoneMessage(12, [{ kind: "maxLevel", character: mira, level: 60, from: 58 }], SITE, HOST);
    expect(message).toEqual({
      embeds: [
        {
          title: "Feat unlocked",
          description: "**[Mira Sunstrider](https://example.com/character/Player-1-MIRA#e12)** reached level 60.",
          color: GOLD,
          footer: { text: "example.com · feats" },
        },
      ],
      allowed_mentions: { parse: [] },
    });
  });

  it('posts several feats as "Feats unlocked · N", a block per character, the marker on each upload\'s first link', () => {
    const milestones: Milestone[] = [
      { kind: "level", character: ves, level: 40, from: 38 },
      { kind: "professionCap", character: lia, profession: "Tailoring", rank: 225, skillLine: 197, firstInGroup: true },
      { kind: "newCharacter", character: zul },
    ];
    const message = milestoneMessage(13, milestones, SITE, HOST);
    expect(message?.embeds).toHaveLength(1);
    expect(message?.embeds[0]).toMatchObject({
      title: "Feats unlocked · 3",
      color: GOLD,
      footer: { text: "3 feats from one upload · example.com · feats" },
    });
    expect(message?.embeds[0]?.description).toBe(
      [
        "**[Ves Doombringer](https://example.com/character/Player-1-VES#e13)**\n- Level 40",
        "**[Lia Thornwhisper](https://example.com/character/Player-1-LIA)**\n- Tailoring 225, maxed · **First in the group**",
        "**[Zul Kazrek](https://example.com/character/Player-1-ZUL)**\n- New character · level 15 Warlock",
      ].join("\n\n"),
    );
  });

  it('says "had a big upload" when all feats are one character\'s', () => {
    const message = milestoneMessage(
      14,
      [
        { kind: "maxLevel", character: mira, level: 60 },
        { kind: "epicMount", character: mira, riding: 150, level: 60, place: 3 },
      ],
      SITE,
      HOST,
    );
    expect(message?.embeds[0]?.description).toBe(
      "**[Mira Sunstrider](https://example.com/character/Player-1-MIRA#e14)** had a big upload.\n" +
        "- Level 60\n- Epic mount · riding 150 · the 3rd epic mount in the group",
    );
  });

  it("shows at most 10 feats and points to the site for the rest", () => {
    const many: Milestone[] = Array.from({ length: 13 }, (_, i) => ({
      kind: "newCharacter",
      character: { guid: `Player-1-${i}`, name: `Alt ${i}` },
    }));
    const embed = milestoneMessage(15, many, SITE, HOST)?.embeds[0];
    expect(embed?.title).toBe("Feats unlocked · 13");
    expect(embed?.description?.match(/New character/g)).toHaveLength(10);
    expect(embed?.description).toMatch(/and 3 more on example\.com$/);
  });

  it("falls back for missing fields and leaves out characters without a name", () => {
    const message = milestoneMessage(
      16,
      [
        { kind: "level", character: { guid: "Player-1-X", name: "Xan" } },
        { kind: "professionCap", character: { guid: "Player-1-Y", name: "Yri" } },
        { kind: "newCharacter", character: { guid: "Player-1-N" } },
      ],
      SITE,
      HOST,
    );
    expect(message?.embeds[0]?.description).toContain("**\n- Levelled up");
    expect(message?.embeds[0]?.description).toContain("**\n- A profession, maxed");
    expect(milestoneMessage(17, [{ kind: "newCharacter", character: { guid: "Player-1-N" } }], SITE, HOST)).toBe(
      undefined,
    );
  });

  it("escapes Discord markdown and mentions in names, and allows no mentions", () => {
    expect(escapeMarkdown("*Bo_b* @everyone")).toBe("\\*Bo\\_b\\* \\@everyone");
    const message = milestoneMessage(
      18,
      [{ kind: "level", character: { guid: "Player-1-Q", name: "@everyone" }, level: 10 }],
      SITE,
      HOST,
    );
    expect(message?.embeds[0]?.description).toContain("**[\\@everyone](");
    expect(message?.allowed_mentions).toEqual({ parse: [] });
  });
});

describe("markedEvents", () => {
  it("finds the event ids of posts on this site, with their message ids", () => {
    const found = markedEvents(SITE, [
      { id: "1100000000000000001", texts: ["https://example.com/character/Player-1-MIRA#e12", ""] },
      { id: "1100000000000000002", texts: ["", "**[Ves](https://example.com/character/Player-1-VES#e13) hit**"] },
      { id: "1100000000000000003", texts: ["https://other.example/character/Player-1-X#e14"] },
    ]);
    expect([...found]).toEqual([
      [12, "1100000000000000001"],
      [13, "1100000000000000002"],
    ]);
  });
});

describe("readEvents and readMilestones", () => {
  it("reads the feed defensively", () => {
    expect(readEvents({ events: [{ id: 1, type: "milestones", data: {} }, { id: "x" }], cursor: "1" })).toEqual({
      events: [{ id: 1, type: "milestones", data: {} }],
      cursor: "1",
    });
    expect(readEvents("nope")).toEqual({ events: [] });
    expect(readEvents({ events: [], cursor: "abc" }).cursor).toBeUndefined();
  });

  it("keeps known milestone kinds with a guid, and ignores the rest", () => {
    const read = readMilestones({
      milestones: [
        { kind: "level", character: { guid: "G", name: " Ves ", level: "40" }, level: 40, from: 38 },
        { kind: "somethingNew", character: { guid: "H" } },
        { kind: "newCharacter", character: {} },
      ],
    });
    expect(read).toEqual([
      {
        // Its place in the site's list names its card image (BOT-05).
        index: 0,
        kind: "level",
        character: { guid: "G", name: "Ves", classFile: undefined, level: undefined, ownerName: undefined },
        level: 40,
        from: 38,
      },
    ]);
  });
});

describe("decide", () => {
  const event = { id: 20, type: "milestones", data: { milestones: [{ kind: "newCharacter", character: zul }] } };
  it("posts, acknowledges what is posted already, and leaves the rest", () => {
    expect(decide(event, {}, new Map(), SITE, HOST).do).toBe("post");
    expect(decide(event, {}, new Map([[20, "1100000000000000009"]]), SITE, HOST)).toEqual({
      do: "ack",
      messageId: "1100000000000000009",
    });
    expect(decide(event, { milestones: false }, new Map(), SITE, HOST).do).toBe("leave");
    expect(decide({ ...event, type: "runPosted" }, {}, new Map(), SITE, HOST).do).toBe("leave");
    expect(decide({ ...event, data: {} }, {}, new Map(), SITE, HOST).do).toBe("leave");
  });
});

describe("groupedMessage and joinsPost (BOT-09)", () => {
  it("adds later uploads as blocks, each marked once", () => {
    const message = groupedMessage(
      [
        { eventId: 30, milestones: [{ kind: "level", character: ves, level: 40 }] },
        { eventId: 31, milestones: [{ kind: "maxLevel", character: mira, level: 60 }] },
        { eventId: 32, milestones: [{ kind: "newCharacter", character: zul }] },
      ],
      SITE,
      HOST,
    );
    expect(message?.embeds).toHaveLength(1);
    expect(message?.embeds[0]?.footer).toEqual({ text: "example.com · feats" });
    expect(message?.embeds[0]?.description).toContain("Player-1-VES#e30)");
    expect(message?.embeds[0]?.description).toContain("Player-1-MIRA#e31)");
    expect(message?.embeds[0]?.description).toContain("Player-1-ZUL#e32)");
    expect(
      markedEvents(SITE, [{ id: "1", texts: message?.embeds.flatMap((e) => [e.url ?? "", e.description ?? ""]) ?? [] }])
        .size,
    ).toBe(3);
  });

  it("joins within 5 minutes of the post and up to 10 milestones", () => {
    const at = 1_793_112_000_000;
    expect(joinsPost(at, 3, 2, at + 4 * 60_000)).toBe(true);
    expect(joinsPost(at, 3, 2, at + 5 * 60_000)).toBe(false);
    expect(joinsPost(at, 9, 2, at)).toBe(false);
    expect(joinsPost(at, 9, 1, at)).toBe(true);
  });
});

describe("the test post", () => {
  it("posts the admin's test with a marker, acknowledges a posted one, and samples other kinds", () => {
    const test = { id: 40, type: "test", data: { kind: "posts" } };
    const action = decide(test, { milestones: false }, new Map(), SITE, HOST);
    expect(action).toEqual({
      do: "send",
      content: {
        embeds: [
          {
            title: "Test post",
            url: "https://example.com/discord#e40",
            description: "Posts from example.com arrive in this channel. Sent from the site's Discord page.",
            color: GOLD,
          },
        ],
        allowed_mentions: { parse: [] },
      },
    });
    expect(
      markedEvents(SITE, [{ id: "1100000000000000040", texts: ["https://example.com/discord#e40"] }]).get(40),
    ).toBe("1100000000000000040");
    expect(decide(test, {}, new Map([[40, "1100000000000000040"]]), SITE, HOST)).toEqual({
      do: "ack",
      messageId: "1100000000000000040",
    });
    // BOT-17: a kind with a sample of its own, and a kind the bot doesn't know as the plain test.
    expect(decide({ ...test, data: { kind: "recap" } }, {}, new Map(), SITE, HOST)).toEqual({
      do: "sample",
      kind: "recap",
    });
    expect(decide({ ...test, data: { kind: "somethingNew" } }, {}, new Map(), SITE, HOST).do).toBe("send");
  });
});

describe("feat card images (BOT-05, BOT-14)", () => {
  const sixty = { index: 2, kind: "maxLevel" as const, character: mira, level: 60, from: 58 };
  const tailor = { index: 0, kind: "professionCap" as const, character: lia, profession: "Tailoring", rank: 300 };
  const low = { index: 3, kind: "professionCap" as const, character: zul, profession: "Alchemy", rank: 150 };

  it("shows one card per post: the event's, the most special feat's", () => {
    const epic = {
      index: 1,
      kind: "firstEpic" as const,
      character: mira,
      item: { name: "Robes of the Exalted", slot: "Chest", level: 58 },
      card: "milestone-30-1",
    };
    const groups = [{ eventId: 30, milestones: [tailor, epic, sixty], card: "milestone-30-1" }];
    expect(milestoneFiles(groups)).toEqual([{ name: "milestone-30-1.png", path: "cards/milestone-30-1.png" }]);
    const message = groupedMessage(groups, SITE, HOST, ["milestone-30-1.png"])!;
    expect(message.embeds).toHaveLength(1);
    expect(message.embeds[0]?.image).toEqual({ url: "attachment://milestone-30-1.png" });
    // The first epic's card: the border in epic purple (board `bot-doomsday-feats`).
    expect(message.embeds[0]?.color).toBe(EPIC_PURPLE);
  });

  it("takes the first feat's card without an event card, and an older site's level 60 card", () => {
    const withCard = { ...low, card: "milestone-31-3" };
    expect(milestoneFiles([{ eventId: 31, milestones: [withCard] }]).map((f) => f.path)).toEqual([
      "cards/milestone-31-3.png",
    ]);
    expect(milestoneFiles([{ eventId: 30, milestones: [low, tailor, sixty] }]).map((f) => f.path)).toEqual([
      "cards/milestone-30-0.png",
    ]);
    expect(milestoneFiles([{ eventId: 30, milestones: [low] }])).toEqual([]);
    // Ids that aren't a card name are never fetched.
    expect(milestoneFiles([{ eventId: 30, milestones: [low], card: "../settings" }])).toEqual([]);
  });

  it("leaves the image out when the poster couldn't fetch it", () => {
    const message = groupedMessage([{ eventId: 30, milestones: [sixty] }], SITE, HOST, [])!;
    expect(message.embeds[0]?.image).toBeUndefined();
    expect(message.embeds[0]?.color).toBe(GOLD);
  });
});
