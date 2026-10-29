import { describe, expect, it } from "vitest";
import { readEmojiFile, syncEmoji } from "../../src/app/emoji.js";
import { CLASS_ICONS, NO_EMOJI, emojiName, icon, optionEmoji, syncPlan } from "../../src/core/emoji.js";
import { whoMessage } from "../../src/core/lookups.js";
import { groupedMessage } from "../../src/core/milestones.js";
import { pickerMessage } from "../../src/core/runReplies.js";
import { type Run, readRun, runMessage } from "../../src/core/runs.js";
import { FakeDiscord, logger } from "./fakes.js";

// BOT-11: the class icons (and since BOT-15 and BOT-14 the boxes and recap icons) as the bot's own application emoji, named with a hash of their picture (Nico, 2026-10-28),
// before every character name; without the emoji the name shows without an icon. Made-up ids (CLAUDE.md rule 1).
const SITE = "https://example.com";
const MAGE = "<:cf_mage_3fa9c1:1100000000000000101>";

describe("the class to emoji mapping", () => {
  it("has an icon file for all nine classes, named cf_<class>_<hash>", async () => {
    expect(CLASS_ICONS.map((c) => c.key)).toEqual([
      "WARRIOR",
      "PALADIN",
      "HUNTER",
      "ROGUE",
      "PRIEST",
      "SHAMAN",
      "MAGE",
      "WARLOCK",
      "DRUID",
    ]);
    for (const { file } of CLASS_ICONS) {
      const png = await readEmojiFile(file);
      // A PNG, under Discord's 256 KiB emoji limit.
      expect(png?.slice(1, 4)).toEqual(new TextEncoder().encode("PNG"));
      expect(png!.length).toBeLessThan(256 * 1024);
    }
    expect(emojiName("DRUID", "ABCDEF0123")).toBe("cf_druid_abcdef");
    for (const { key } of CLASS_ICONS) expect(emojiName(key, "abcdef")).toMatch(/^[a-z_]{2,26}abcdef$/);
  });

  it("puts the icon before a name, or nothing without one (never a broken one)", () => {
    expect(icon({ MAGE }, "MAGE")).toBe(`${MAGE} `);
    expect(icon({ MAGE }, "PRIEST")).toBe("");
    expect(icon(NO_EMOJI, undefined)).toBe("");
    expect(optionEmoji({ MAGE }, "MAGE")).toEqual({ name: "cf_mage_3fa9c1", id: "1100000000000000101" });
    expect(optionEmoji({ MAGE }, "ROGUE")).toBeUndefined();
  });
});

describe("the start-up sync", () => {
  const hashes = { MAGE: "3fa9c1aaaa", PRIEST: "00aa11bbbb" };

  it("plans uploads for missing and changed icons, deletes the older ones, leaves other emoji alone", () => {
    const plan = syncPlan(hashes, [
      { id: "1", name: "cf_mage_3fa9c1" },
      { id: "2", name: "cf_priest_999999" },
      { id: "3", name: "party_parrot" },
    ]);
    expect(plan.icons).toEqual({ MAGE: "<:cf_mage_3fa9c1:1>" });
    expect(plan.upload).toEqual([{ key: "PRIEST", name: "cf_priest_00aa11", file: "class-icons/priest.png" }]);
    expect(plan.remove).toEqual([{ id: "2", name: "cf_priest_999999" }]);
  });

  it("uploads all nine class icons and the three Doomsday boxes and the 12 recap card icons the first time, nothing when unchanged, and only a changed one after that", async () => {
    const discord = new FakeDiscord();
    const log = logger();
    const first = await syncEmoji(discord, log.log);
    expect(Object.keys(first)).toHaveLength(24);
    expect(first.BOX_PVE).toMatch(/^<:cf_box_pve_[0-9a-f]{6}:\d+>$/);
    expect(discord.emojiList.map((e) => e.name).every((n) => /^cf_[a-z_]+_[0-9a-f]{6}$/.test(n))).toBe(true);
    expect(log.texts()).toContain("emoji: 24 of 24 ready (24 uploaded)");

    const again = await syncEmoji(discord, log.log);
    expect(again).toEqual(first);
    expect(discord.emojiList).toHaveLength(24);
    expect(log.texts().at(-1)).toBe("emoji: 24 of 24 ready (0 uploaded)");

    // A new mage picture: the mage is uploaded again and its old emoji deleted after.
    const oldMage = discord.emojiList.find((e) => e.name.startsWith("cf_mage_"))!;
    const changed = await syncEmoji(discord, log.log, async (file) =>
      file === "class-icons/mage.png" ? new Uint8Array([1, 2, 3]) : readEmojiFile(file),
    );
    expect(changed.MAGE).not.toBe(first.MAGE);
    expect(discord.deletedEmoji).toEqual([oldMage.id]);
    expect(discord.emojiList).toHaveLength(24);
  });

  it("goes on without icons when Discord refuses, and without one icon when its upload fails", async () => {
    const discord = new FakeDiscord();
    const log = logger();
    discord.emojiReadFails = true;
    expect(await syncEmoji(discord, log.log)).toEqual(NO_EMOJI);
    expect(log.texts()).toContain("discord: reading the bot's emoji failed (code 50001); names show without icons");

    discord.emojiReadFails = false;
    discord.emojiFailures = 1;
    const icons = await syncEmoji(discord, log.log);
    expect(Object.keys(icons)).toHaveLength(23);
    expect(icons.WARRIOR).toBeUndefined();
    expect(log.texts()).toContain("discord: uploading the warrior emoji failed (code 50035)");
  });
});

describe("names with their icon", () => {
  const run = readRun({
    id: 7,
    dungeon: { name: "Scarlet Monastery: Armory", typicalLevels: { min: 32, max: 42 } },
    startsAt: 1_793_122_800,
    organiser: { name: "Mira", character: "Mira Sunstrider", classFile: "MAGE", level: 38 },
    answers: [
      { name: "Mira", character: "Mira Sunstrider", classFile: "MAGE", level: 38, answer: "in", role: "damage" },
    ],
  }) as Run;
  const ctx = { siteUrl: SITE, siteHost: "example.com", now: 1_793_112_000, reminderMinutes: 30 };

  it("in the run post's slots, not in its author line (Discord shows no emoji there)", () => {
    const m = runMessage(run, { ...ctx, icons: { MAGE } });
    expect(m.embeds[0]?.description).toContain(`Damage · ${MAGE} Mira Sunstrider 38 · Mira`);
    expect(m.embeds[0]?.author?.name).toBe("Mira on Mira Sunstrider (38 Mage)");
    expect(runMessage(run, ctx).embeds[0]?.description).toContain("Damage · Mira Sunstrider 38 · Mira");
  });

  it("in the look-ups, the milestones and the picker", () => {
    const mira = {
      guid: "Player-1-MIRA",
      name: "Mira Sunstrider",
      classFile: "MAGE",
      className: "Mage",
      level: 38,
      professions: [],
    };
    expect(whoMessage(1, [mira], {}, 0, { MAGE }).embeds[0]?.description).toMatch(
      new RegExp(`^${MAGE.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&")} \\*\\*Mira Sunstrider\\*\\* 38 Mage`),
    );
    const milestone = groupedMessage(
      [
        {
          eventId: 1,
          milestones: [
            {
              kind: "level",
              character: { guid: "Player-1-MIRA", name: "Mira Sunstrider", classFile: "MAGE" },
              level: 40,
            },
          ],
        },
      ],
      SITE,
      "example.com",
      [],
      { MAGE },
    );
    expect(milestone?.embeds[0]?.description?.startsWith(`${MAGE} **`)).toBe(true);
    const picker = pickerMessage(
      run,
      [{ guid: "MIRA", name: "Mira Sunstrider", classFile: "MAGE", roles: ["damage"] }],
      SITE,
      { MAGE },
    );
    expect(picker.components?.[0]?.components[0]?.options?.[0]?.emoji).toEqual({
      name: "cf_mage_3fa9c1",
      id: "1100000000000000101",
    });
  });
});
