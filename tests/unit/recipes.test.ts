import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { answerCraft } from "../../src/app/craft.js";
import { runPoster } from "../../src/app/poster.js";
import type { SlashCommand } from "../../src/adapters/discord.js";
import { PUBLIC_COMMANDS } from "../../src/core/commands.js";
import { decide } from "../../src/core/events.js";
import type { MessageContent } from "../../src/core/message.js";
import {
  craftCard,
  itemName,
  readCraft,
  readRecipeFinds,
  recipeFindsMessage,
  sourceText,
} from "../../src/core/recipes.js";
import { CHANNEL, FakeDiscord, FakeSite, logger } from "./fakes.js";

// BOT-25 (board `bot-recipes` = RC08, web BOT-API.md "Recipes"): the rare-find post and `/craft`. Made-up names and
// data (CLAUDE.md rule 1). The site decides what is a rare find (never a first scan, never a trainer recipe): the bot
// posts the `recipeFinds` events it gets, once.

const SITE = "https://example.com";
const FEATS = "100000000000000020";

const robe = {
  recipeId: 18457,
  item: {
    id: 14152,
    name: "Robe of the Archmage",
    quality: 4,
    qualityColor: "#a335ee",
    iconPath: "/api/item-icons/inv_chest_cloth_38.jpg",
  },
  profession: { skillLine: 197, name: "Tailoring", skill: 300 },
  sources: [{ kind: "drop", place: "Blackrock Spire", npc: "Firebrand Pyromancer" }],
  url: "/professions/tailoring?recipe=18457",
};
const mooncloth = {
  recipeId: 22902,
  item: { id: 18486, name: "Mooncloth Robe", quality: 3, qualityColor: "#0070dd" },
  profession: { skillLine: 197, name: "Tailoring", skill: 300 },
  sources: [{ kind: "rep", faction: "Thorium Brotherhood", rank: "Honored" }],
  url: "/professions/tailoring?recipe=22902",
};
const mira = { guid: "Player-1-MIRA", name: "Mira Sunstrider", classFile: "MAGE", level: 60, ownerName: "Mira" };
const event = (id: number, finds: unknown[]) => ({
  id,
  type: "recipeFinds",
  data: { uploadId: id, uploadedAt: 1793112000, character: mira, color: "#a335ee", finds },
});

describe("rare-find posts", () => {
  it("are posted under the feats switch, once", () => {
    const e = event(31, [robe]);
    expect(decide(e, {}, new Map(), SITE, "example.com").do).toBe("finds");
    expect(decide(e, { milestones: false }, new Map(), SITE, "example.com")).toEqual({ do: "leave" });
    expect(decide(e, {}, new Map([[31, "7"]]), SITE, "example.com")).toEqual({ do: "ack", messageId: "7" });
    // Without a character or a find (an older or broken event): nothing.
    expect(decide({ id: 32, type: "recipeFinds", data: { finds: [robe] } }, {}, new Map(), SITE, "x").do).toBe("leave");
    expect(decide(event(33, []), {}, new Map(), SITE, "example.com").do).toBe("leave");
  });

  it("one find: author line, the item as title, the profession and Learned from, the item's icon", () => {
    const content = recipeFindsMessage(readRecipeFinds(event(31, [robe]).data)!, 31, SITE, ["class-mage.png"]);
    expect(content.embeds).toEqual([
      {
        author: { name: "Mira Sunstrider learned a rare recipe", icon_url: "attachment://class-mage.png" },
        title: "Robe of the Archmage — Epic",
        url: `${SITE}/professions/tailoring?recipe=18457#e31`,
        color: 0xa335ee,
        thumbnail: { url: `${SITE}/api/item-icons/inv_chest_cloth_38.jpg` },
        fields: [
          { name: "Tailoring", value: "300", inline: true },
          { name: "Learned from", value: "Drop · Blackrock Spire", inline: true },
        ],
      },
    ]);
  });

  it("two or more: one line per recipe, the best item's colour and icon", () => {
    const content = recipeFindsMessage(readRecipeFinds(event(32, [robe, mooncloth]).data)!, 32, SITE);
    expect(content.embeds[0]).toEqual({
      author: { name: "Mira Sunstrider learned 2 rare recipes" },
      color: 0xa335ee,
      thumbnail: { url: `${SITE}/api/item-icons/inv_chest_cloth_38.jpg` },
      description: [
        `[**Robe of the Archmage**](${SITE}/professions/tailoring?recipe=18457#e32) — Epic · Drop · Blackrock Spire`,
        `[**Mooncloth Robe**](${SITE}/professions/tailoring?recipe=22902) — Rare · Rep · Thorium Brotherhood`,
      ].join("\n"),
    });
  });

  it("only the site's icon route becomes a picture", () => {
    const odd = { ...robe, item: { ...robe.item, iconPath: "https://elsewhere.example/x.jpg" } };
    expect(readRecipeFinds(event(31, [odd]).data)!.finds[0]!.item.iconPath).toBeUndefined();
  });

  describe("the poster", () => {
    let site: FakeSite;
    let discord: FakeDiscord;
    let stop: AbortController;

    beforeEach(() => {
      vi.useFakeTimers();
      site = new FakeSite();
      site.settingsBody = {
        siteName: "Doombringers",
        posts: { milestones: true },
        channels: { posts: CHANNEL, feats: FEATS },
      };
      discord = new FakeDiscord();
      stop = new AbortController();
    });

    afterEach(() => {
      stop.abort();
      vi.useRealTimers();
    });

    it("posts a drop recipe once, in the feats channel, and acknowledges it", async () => {
      site.add(event(31, [robe]));
      const running = runPoster(
        { siteUrl: SITE, site, discord, log: logger().log, now: () => 1_793_112_000_000 },
        stop.signal,
      );
      await vi.waitFor(() => expect(site.acked.size).toBe(1));
      expect(discord.messages).toHaveLength(1);
      expect(discord.messages[0]?.channel).toBe(FEATS);
      expect(site.acked.get(31)).toBe(discord.messages[0]?.id);
      expect(discord.messages[0]?.content.embeds[0]?.title).toBe("Robe of the Archmage — Epic");
      stop.abort();
      await running;
    });
  });
});

describe("/craft", () => {
  const crafter = (name: string, difficulty: string) => ({ guid: `G-${name}`, name, skill: 300, difficulty });
  const answer = {
    recipe: { id: 18457, name: "Robe of the Archmage", skillLine: 197, profession: "Tailoring", skill: 300 },
    item: robe.item,
    crafters: [crafter("Mira Sunstrider", "orange")],
    reagents: [
      { id: 14048, name: "Bolt of Runecloth", count: 12 },
      { id: 14342, name: "Mooncloth", count: 4 },
      { id: 7080, name: "Essence of Water", count: 2 },
      { id: 14341, name: "Rune Thread", count: 1 },
    ],
    sources: robe.sources,
    url: robe.url,
  };

  it("answers in the channel, for everyone (RC08)", () => {
    expect(PUBLIC_COMMANDS).toEqual(["craft"]);
  });

  it("someone can make it: crafters with their dot, the reagents and the recipe's link", () => {
    expect(craftCard(readCraft(answer)!, SITE).embeds).toEqual([
      {
        title: "Robe of the Archmage — Epic",
        url: `${SITE}/professions/tailoring?recipe=18457`,
        color: 0xa335ee,
        thumbnail: { url: `${SITE}/api/item-icons/inv_chest_cloth_38.jpg` },
        description: "Tailoring 300",
        fields: [
          { name: "Can make it", value: "🟠 Mira Sunstrider" },
          {
            name: "Reagents",
            value: "12 × Bolt of Runecloth · 4 × Mooncloth · 2 × Essence of Water · 1 × Rune Thread",
          },
          { name: "​", value: `[Open the recipe ›](${SITE}/professions/tailoring?recipe=18457)` },
        ],
      },
    ]);
  });

  it("up to 5 crafters, then +N more linked to the recipe", () => {
    const many = {
      ...answer,
      crafters: ["Ada", "Bo", "Cy", "Di", "Ed", "Fy", "Gu"].map((n, i) =>
        crafter(`${n} Example`, ["orange", "yellow", "green", "grey", "grey", "grey", "grey"][i]!),
      ),
    };
    const field = craftCard(readCraft(many)!, SITE).embeds[0]?.fields?.[0];
    expect(field).toEqual({
      name: "Can make it",
      value: [
        "🟠 Ada Example",
        "🟡 Bo Example",
        "🟢 Cy Example",
        "⚪ Di Example",
        "⚪ Ed Example",
        `[+2 more](${SITE}/professions/tailoring?recipe=18457)`,
      ].join("\n"),
    });
  });

  it("nobody can make it yet: where to learn it", () => {
    const gloves = {
      ...answer,
      item: { id: 16979, name: "Flarecore Gloves", quality: 3, qualityColor: "#0070dd" },
      crafters: [],
      sources: mooncloth.sources,
    };
    expect(craftCard(readCraft(gloves)!, SITE).embeds[0]).toEqual({
      title: "Flarecore Gloves — Rare",
      url: `${SITE}/professions/tailoring?recipe=18457`,
      color: 0x0070dd,
      description: "Nobody can make it yet.",
      fields: [{ name: "Learn from", value: "Rep · Thorium Brotherhood · Honored" }],
    });
  });

  it("asks the site, and says when no recipe makes it", async () => {
    const site = new FakeSite();
    const replies: MessageContent[] = [];
    const command = (item: string): SlashCommand => ({
      name: "craft",
      userId: "100000000000000001",
      options: { item },
      reply: async (content) => {
        replies.push(content);
      },
    });
    const signal = new AbortController().signal;
    site.lookupAnswers.set("craft", { ok: true, body: answer });
    await answerCraft({ siteUrl: SITE, site }, command("18457"), signal);
    expect(site.lookups).toEqual([{ what: "craft", params: { item: "18457" } }]);
    expect(replies[0]?.embeds[0]?.title).toBe("Robe of the Archmage — Epic");

    site.lookupAnswers.set("craft", { ok: false, status: 404, error: "not_found" });
    await answerCraft({ siteUrl: SITE, site }, command("Test Sword"), signal);
    expect(replies[1]?.embeds[0]?.description).toBe("No recipe makes that.");
  });

  it("names the quality after the item, except Poor and Common (Nico, 2026-11-07)", () => {
    const named = (quality: number) => itemName({ name: "Test Item", quality });
    expect([0, 1, 2, 3, 4, 5].map(named)).toEqual([
      "Test Item",
      "Test Item",
      "Test Item — Uncommon",
      "Test Item — Rare",
      "Test Item — Epic",
      "Test Item — Legendary",
    ]);
  });

  it("words every kind of source as RC08 does", () => {
    expect(sourceText({ kind: "trainer" })).toBe("Trainer");
    expect(sourceText({ kind: "vendor_limited", npc: "Qia" })).toBe("Vendor · Limited · Qia");
    expect(sourceText({ kind: "quest", quest: "A Test Quest" })).toBe("Quest · A Test Quest");
    expect(sourceText({ kind: "drop" })).toBe("Drop");
  });
});
