import { describe, expect, it } from "vitest";
import { type Embed, GOLD, LIMITS, type MessageContent, fitLimits } from "../../src/core/message.js";
import { recapMessage, readRecap, type Recap } from "../../src/core/recap.js";

// Discord's limits (finding 4 of the launch bug hunt): a post over them is refused with 50035. Made-up texts.
const message = (embeds: Embed[], content?: string): MessageContent => ({
  ...(content !== undefined ? { content } : {}),
  embeds,
  allowed_mentions: { parse: [] },
});
const total = (m: MessageContent) =>
  m.embeds.reduce(
    (n, e) =>
      n +
      (e.title?.length ?? 0) +
      (e.description?.length ?? 0) +
      (e.fields ?? []).reduce((k, f) => k + f.name.length + f.value.length, 0) +
      (e.footer?.text.length ?? 0) +
      (e.author?.name.length ?? 0),
    0,
  );

describe("fitLimits", () => {
  it("leaves a message within the limits as it is", () => {
    const m = message([{ title: "Feat unlocked", description: "Mira reached level 40.", color: GOLD }], "@here");
    expect(fitLimits(m)).toEqual(m);
  });

  it("cuts each text to its limit with …", () => {
    const m = fitLimits(
      message(
        [
          {
            title: "t".repeat(300),
            description: "d".repeat(5000),
            color: GOLD,
            fields: Array.from({ length: 30 }, (_, i) => ({ name: `n${i}`, value: "v".repeat(10) })),
            footer: { text: "f".repeat(3000) },
            author: { name: "a".repeat(300) },
          },
        ],
        "c".repeat(2500),
      ),
    );
    const e = m.embeds[0] as Embed;
    expect(e.title).toHaveLength(LIMITS.title);
    expect(e.title?.endsWith("…")).toBe(true);
    expect(e.fields).toHaveLength(LIMITS.fields);
    expect(e.author?.name).toHaveLength(LIMITS.author);
    expect(m.content).toHaveLength(LIMITS.content);
    expect(total(m)).toBeLessThanOrEqual(LIMITS.total);
  });

  it("keeps at most 10 embeds and all of them under 6000 characters together, the longest cut first", () => {
    const embeds = Array.from({ length: 12 }, (_, i) => ({
      title: `Card ${i}`,
      description: i === 3 ? "x".repeat(4000) : "y".repeat(600),
      color: GOLD,
    }));
    const m = fitLimits(message(embeds));
    expect(m.embeds).toHaveLength(LIMITS.embeds);
    expect(total(m)).toBeLessThanOrEqual(LIMITS.total);
    // The short ones stay whole.
    expect(m.embeds[0]?.description).toBe("y".repeat(600));
    expect(m.embeds[3]?.description?.endsWith("…")).toBe(true);
  });

  it("never cuts an emoji in half", () => {
    const m = fitLimits(message([{ title: `${"a".repeat(254)}🐉🐉`, color: GOLD }]));
    expect(m.embeds[0]?.title).toBe(`${"a".repeat(254)}…`);
  });

  it("keeps a weekly recap with long site texts postable", () => {
    const long = "A long story about the week. ".repeat(60);
    const recap = readRecap({
      week: 45,
      headline: { text: long },
      award: { id: "A1", name: "Most levels", title: long, text: long },
      cards: [1, 2, 3, 4].map((n) => ({ id: `S${n}`, name: `Card ${n}`, title: long, text: long })),
      challenge: { text: long },
    }) as Recap;
    const m = fitLimits(recapMessage(recap, "https://example.com", [], 7));
    expect(total(m)).toBeLessThanOrEqual(LIMITS.total);
    expect(m.embeds[0]?.url).toBe("https://example.com/#e7");
  });
});
