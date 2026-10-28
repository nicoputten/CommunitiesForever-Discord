import { describe, expect, it } from "vitest";
import {
  readAlts,
  readAsker,
  readCrafters,
  readNames,
  readProfessions,
  readWhereis,
  readWho,
} from "../../src/core/lookups.js";

// BOT-18: the look-up answers (web BOT-API.md "Look-ups") read in core, defensively. Made-up names (CLAUDE.md rule 1).
const ves = { guid: "Player-1-VES", name: "Ves Doombringer", classFile: "WARLOCK", level: 39, professions: [] };

describe("reading the look-up answers", () => {
  it("whereis and who", () => {
    expect(
      readWhereis({ friend: " Nico ", characters: [ves, { name: "no guid" }], card: "Player-1-VES" }),
    ).toMatchObject({ friend: "Nico", characters: [{ guid: "Player-1-VES" }], card: "Player-1-VES" });
    expect(readWhereis(undefined)).toEqual({ characters: [] });
    expect(readWho({ total: 7, characters: [ves] }).total).toBe(7);
    expect(readWho({ characters: [ves] }).total).toBe(1);
  });

  it("whocancraft: crafters need a rank; the cap and the star are optional", () => {
    const read = readCrafters({
      profession: "Tailoring",
      crafters: [
        { ...ves, rank: 187, max: 225, best: true },
        { ...ves, guid: "Player-1-X", rank: "high" },
        { ...ves, guid: "Player-1-Y", rank: 50 },
      ],
    });
    expect(read.profession).toBe("Tailoring");
    expect(read.crafters.map((c) => [c.guid, c.rank, c.max, c.best])).toEqual([
      ["Player-1-VES", 187, 225, true],
      ["Player-1-Y", 50, undefined, false],
    ]);
  });

  it("alts and me: the week only with all three numbers", () => {
    expect(readAlts({ friend: "Nico", characters: [ves], week: { levels: 6, quests: 14, runs: 2 } }).week).toEqual({
      levels: 6,
      quests: 14,
      runs: 2,
    });
    expect(readAlts({ characters: [], week: { levels: 6, quests: 14 } })).toEqual({ characters: [] });
  });

  it("the asker, the professions and the autocomplete names", () => {
    expect(readAsker({ asker: "Mira" })).toBe("Mira");
    expect(readAsker({})).toBeUndefined();
    expect(readProfessions({ professions: ["Alchemy", 3, ""] })).toEqual(["Alchemy"]);
    expect(readNames({ names: [{ kind: "friend", name: "Nico", value: "Nico" }, { name: "x" }] })).toEqual([
      { name: "Nico", value: "Nico" },
    ]);
    expect(readNames("nope")).toEqual([]);
  });
});
