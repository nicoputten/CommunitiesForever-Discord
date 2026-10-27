import { describe, expect, it } from "vitest";
import type { Attachment, SlashCommand } from "../../src/adapters/discord.js";
import { commandHandler } from "../../src/app/commands.js";
import type { MessageContent } from "../../src/core/milestones.js";
import { FakeSite, logger } from "./fakes.js";

// BOT-05: `/recap` answers the asker with the last recap as posted, with its card images; for anyone in the server
// (Nico, 2026-10-28). Made-up names (CLAUDE.md rule 1).
const SITE = "https://example.com";

function asked(name = "recap") {
  const answers: { content: MessageContent; files: string[] }[] = [];
  let done: () => void = () => undefined;
  const answered = new Promise<void>((resolve) => (done = resolve));
  const command: SlashCommand = {
    name,
    async reply(content, files: readonly Attachment[] = []) {
      answers.push({ content, files: files.map((f) => f.name) });
      done();
    },
  };
  return { command, answers, answered };
}

describe("/recap", () => {
  it("answers with the last recap and its images, without the post's marker", async () => {
    const site = new FakeSite();
    site.recap = { week: 5, headline: { text: "Dungeon week" }, numbers: { levels: 9 }, cards: [] };
    site.images.set("cards/recap-5-header.png", new Uint8Array([1]));
    const { command, answers, answered } = asked();
    commandHandler({ siteUrl: SITE, site, log: logger().log }, new AbortController().signal)(command);
    await answered;
    expect(answers[0]?.files).toEqual(["recap-5-header.png"]);
    expect(answers[0]?.content.embeds[0]).toMatchObject({ title: "Dungeon week", url: "https://example.com/" });
  });

  it("says there is no recap yet before the first one", async () => {
    const site = new FakeSite();
    const { command, answers, answered } = asked();
    commandHandler({ siteUrl: SITE, site, log: logger().log }, new AbortController().signal)(command);
    await answered;
    expect(answers[0]?.content.embeds[0]?.title).toBe("No recap yet");
  });

  it("ignores commands it doesn't know", () => {
    const { command, answers } = asked("whereis");
    commandHandler({ siteUrl: SITE, site: new FakeSite(), log: logger().log }, new AbortController().signal)(command);
    expect(answers).toHaveLength(0);
  });
});
