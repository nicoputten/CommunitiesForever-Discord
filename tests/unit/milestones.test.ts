import { describe, expect, it } from "vitest";
import { decide, readEvents, readMilestones } from "../../src/core/events.js";
import {
  CLASS_COLOURS,
  GOLD,
  type Milestone,
  escapeMarkdown,
  groupedMessage,
  joinsPost,
  markedEvents,
  milestoneFiles,
  milestoneMessage,
} from "../../src/core/milestones.js";

// Made-up names (CLAUDE.md rule 1).
const SITE = "https://example.com";
const HOST = "example.com";
const mira = { guid: "Player-1-MIRA", name: "Mira Sunstrider", classFile: "MAGE", level: 60, ownerName: "Mira" };
const ves = { guid: "Player-1-VES", name: "Ves Doombringer", classFile: "WARRIOR", level: 40, ownerName: "Nico" };
const lia = { guid: "Player-1-LIA", name: "Lia Thornwhisper", classFile: "PRIEST", ownerName: "Femke" };
const zul = { guid: "Player-1-ZUL", name: "Zul Kazrek", classFile: "WARLOCK", level: 15, ownerName: "Femke" };

describe("milestoneMessage", () => {
  it("gives level 60 its own embed in the class colour, with the marker on its link", () => {
    const message = milestoneMessage(12, [{ kind: "maxLevel", character: mira, level: 60, from: 58 }], SITE, HOST);
    expect(message).toEqual({
      embeds: [
        {
          title: "Mira Sunstrider reached level 60",
          url: "https://example.com/character/Player-1-MIRA#e12",
          description: "Mira\nMage\n[Open character ↗](https://example.com/character/Player-1-MIRA)",
          color: CLASS_COLOURS.MAGE,
        },
      ],
      allowed_mentions: { parse: [] },
    });
  });

  it("groups the other milestones of one upload in one gold embed, the marker on the first link only", () => {
    const milestones: Milestone[] = [
      { kind: "level", character: ves, level: 40, from: 38 },
      { kind: "professionCap", character: lia, profession: "Tailoring", rank: 225, skillLine: 197 },
      { kind: "newCharacter", character: zul },
    ];
    const message = milestoneMessage(13, milestones, SITE, HOST);
    expect(message?.embeds).toHaveLength(1);
    expect(message?.embeds[0]?.color).toBe(GOLD);
    expect(message?.embeds[0]?.description).toBe(
      [
        "**[Ves Doombringer](https://example.com/character/Player-1-VES#e13) hit level 40** · Nico",
        "**[Lia Thornwhisper](https://example.com/character/Player-1-LIA) maxed Tailoring at 225** · Femke",
        "**New character: [Zul Kazrek](https://example.com/character/Player-1-ZUL)** · Femke\nLevel 15 Warlock",
      ].join("\n\n"),
    );
  });

  it("puts level 60 first and the rest after it in one message", () => {
    const message = milestoneMessage(
      14,
      [
        { kind: "maxLevel", character: mira, level: 60 },
        { kind: "level", character: ves, level: 40 },
      ],
      SITE,
      HOST,
    );
    expect(message?.embeds.map((e) => e.color)).toEqual([CLASS_COLOURS.MAGE, GOLD]);
    expect(message?.embeds[1]?.description).not.toContain("#e14");
  });

  it("shows at most 10 milestones and points to the site for the rest", () => {
    const many: Milestone[] = Array.from({ length: 13 }, (_, i) => ({
      kind: "newCharacter",
      character: { guid: `Player-1-${i}`, name: `Alt ${i}` },
    }));
    const description = milestoneMessage(15, many, SITE, HOST)?.embeds[0]?.description ?? "";
    expect(description.match(/New character/g)).toHaveLength(10);
    expect(description).toMatch(/and 3 more on example\.com$/);
  });

  it("falls back for missing fields and leaves out characters without a name", () => {
    const message = milestoneMessage(
      16,
      [
        { kind: "level", character: { guid: "Player-1-X", name: "Xan" } },
        { kind: "professionCap", character: { guid: "Player-1-Y", name: "Yri" } },
        { kind: "maxLevel", character: { guid: "Player-1-Z", name: "Zed", classFile: "UNKNOWN" } },
        { kind: "newCharacter", character: { guid: "Player-1-N" } },
      ],
      SITE,
      HOST,
    );
    expect(message?.embeds[0]).toMatchObject({ title: "Zed reached level 60", color: GOLD });
    expect(message?.embeds[1]?.description).toContain("Xan](https://example.com/character/Player-1-X) levelled up**");
    expect(message?.embeds[1]?.description).toContain("maxed a profession**");
    expect(milestoneMessage(17, [{ kind: "newCharacter", character: { guid: "Player-1-N" } }], SITE, HOST)).toBe(
      undefined,
    );
  });

  it("escapes Discord markdown and mentions in names, and allows no mentions", () => {
    expect(escapeMarkdown("*Bo_b* @everyone")).toBe("\\*Bo\\_b\\* \\@everyone");
    const message = milestoneMessage(
      18,
      [{ kind: "level", character: { guid: "Player-1-Q", name: "Q", ownerName: "@everyone" }, level: 10 }],
      SITE,
      HOST,
    );
    expect(message?.embeds[0]?.description).toContain("· \\@everyone");
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
  it("puts a later upload's level 60 on top and marks each upload once", () => {
    const message = groupedMessage(
      [
        { eventId: 30, milestones: [{ kind: "level", character: ves, level: 40 }] },
        { eventId: 31, milestones: [{ kind: "maxLevel", character: mira, level: 60 }] },
        { eventId: 32, milestones: [{ kind: "newCharacter", character: zul }] },
      ],
      SITE,
      HOST,
    );
    expect(message?.embeds[0]?.url).toBe("https://example.com/character/Player-1-MIRA#e31");
    expect(message?.embeds[1]?.description).toContain("Player-1-VES#e30)");
    expect(message?.embeds[1]?.description).toContain("Player-1-ZUL#e32)");
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
  it("posts the admin's test with a marker, acknowledges a posted one, and leaves other channels' tests", () => {
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
    expect(decide({ ...test, data: { kind: "recap" } }, {}, new Map(), SITE, HOST).do).toBe("leave");
  });
});

describe("milestone card images (BOT-05)", () => {
  const sixty = { index: 2, kind: "maxLevel" as const, character: mira, level: 60, from: 58 };
  const tailor = { index: 0, kind: "professionCap" as const, character: lia, profession: "Tailoring", rank: 300 };
  const newSixty = { index: 1, kind: "newCharacter" as const, character: { ...ves, level: 60 } };
  const low = { index: 3, kind: "professionCap" as const, character: zul, profession: "Alchemy", rank: 150 };

  it("gives level 60, a new character at 60 and a profession at 300 their own embed with the site's card", () => {
    const groups = [{ eventId: 30, milestones: [tailor, newSixty, sixty, low] }];
    expect(milestoneFiles(groups).map((f) => f.path)).toEqual([
      "cards/milestone-30-0.png",
      "cards/milestone-30-1.png",
      "cards/milestone-30-2.png",
    ]);
    const message = groupedMessage(groups, SITE, HOST, ["milestone-30-0.png", "milestone-30-2.png"])!;
    expect(message.embeds.map((e) => e.image?.url)).toEqual([
      "attachment://milestone-30-0.png",
      undefined,
      "attachment://milestone-30-2.png",
      undefined,
    ]);
    // The rank 150 cap stays a line in the gold list.
    expect(message.embeds.at(-1)?.description).toContain("Zul Kazrek");
  });
});
