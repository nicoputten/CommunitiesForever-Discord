// Test posts per kind (BOT-17, web WEB-58 part 2): the Discord page's test buttons for feats, the recap and
// Doomsday. Each sample is made up with names no friend has (Nico, 2026-10-28), carries no image of the site's, says
// "Test ·" in its title and "not real" in its footer (only test posts do, BOT-20), and is marked like any post so it
// is posted once. BOT-20: the samples look like the visual posts, with the bot's own pictures (the class icon, the
// recap icons) attached. Pure.
import { boardMessage, readBoard } from "./doomsday.js";
import { type Group, groupedMessage, milestoneFiles } from "./milestones.js";
import { type FileSource, type MessageContent } from "./message.js";
import { type Recap, readRecap, recapFiles, recapMessage } from "./recap.js";

/** The test kinds with a sample of their own; any other kind gets the plain test message. */
export type TestKind = "feats" | "recap" | "doomsday";

export const TEST_FOOTER = "Test post from the site's Discord page · not real";

const CHARACTER = { guid: "Test-0-TESTY", name: "Testy McTestface", classFile: "WARLOCK" };
const FRIEND = "Test Friend";
const OTHER = "Another Test";

/** Marks a sample: "Test ·" before the first title, the footer on the last embed. */
function asTest(content: MessageContent): MessageContent {
  const embeds = content.embeds.map((e, i) => ({
    ...e,
    ...(i === 0 ? { title: `Test · ${e.title ?? "post"}` } : {}),
    ...(i === content.embeds.length - 1 ? { footer: { text: TEST_FOOTER } } : {}),
  }));
  return { ...content, embeds };
}

function featGroup(eventId: number): Group {
  return {
    eventId,
    milestones: [
      {
        kind: "pvpRank",
        character: CHARACTER,
        rank: 6,
        rankName: "Stone Guard",
        title: "Mailbox Menace",
        firstInGroup: true,
        headline: "Stone Guard",
        line: "Rank 6, a.k.a. Mailbox Menace. First in the group.",
      },
    ],
  };
}

function feats(eventId: number, siteUrl: string, siteHost: string, attached: readonly string[]): MessageContent {
  return groupedMessage([featGroup(eventId)], siteUrl, siteHost, attached) as MessageContent;
}

function recapSample(): Recap {
  return readRecap({
    week: 1,
    headline: { text: "A week of tests" },
    numbers: { honorKills: 12, battlegrounds: 1, levels: 3, friendsPlayed: 2, runs: 1, feats: 4 },
    award: {
      id: "A11",
      name: "Doombringer of the week · Warmonger",
      title: `${CHARACTER.name} took 12 honorable kills`,
      text: "All of them test dummies.",
      classFile: CHARACTER.classFile,
    },
    cards: [
      {
        id: "S2",
        slot: "stat",
        name: "Class census",
        title: "One Warlock",
        text: `${CHARACTER.name} holds the line alone.`,
      },
      { id: "F16", slot: "fun", name: "Most deaths", title: `${FRIEND}: 3 deaths`, text: "The spirit healer waves." },
    ],
    challenge: { text: "Send one more test post" },
    doomsday: {
      mostDevoted: { name: FRIEND, days: 3 },
      perfectWeek: [],
      points: { pve: [{ name: FRIEND, points: 15 }], pvp: [{ name: OTHER, points: 5 }] },
    },
  }) as Recap;
}

function recap(eventId: number, siteUrl: string, doomsdayUrl: string, attached: readonly string[]): MessageContent {
  return recapMessage(recapSample(), siteUrl, attached, eventId, doomsdayUrl);
}

function board(eventId: number, siteUrl: string, now: number, pageUrl: string): MessageContent {
  const sample = readBoard({
    label: "Test day",
    end: now + 3600,
    goals: [
      { slot: "pve1", id: "d.test", title: "Send a test post", track: "pve", points: 5 },
      { slot: "hunt", id: "hunt", title: "The Hunt: a test dummy", track: "pvp", points: 5 },
    ],
    friends: [
      {
        name: FRIEND,
        goals: [{ slot: "pve1", done: true, at: now }],
        doneCount: 1,
        crossedOut: false,
        today: { pve: 5, pvp: 0 },
        pvpVirgin: false,
      },
      { name: OTHER, goals: [], doneCount: 0, crossedOut: false, today: { pve: 0, pvp: null }, pvpVirgin: true },
    ],
    withoutData: [],
  });
  const message = boardMessage(sample!, eventId, siteUrl, pageUrl);
  // Only "Open the board ↗": "My goals" answers with real data, and the sample is never edited.
  return {
    ...message,
    components: (message.components ?? []).map((row) => ({
      ...row,
      components: row.components.filter((c) => c.url !== undefined),
    })),
  };
}

/** The bot's own pictures a sample attaches (BOT-20): the class icon of the feat, the recap's icons. Never the site's. */
export function testFiles(kind: TestKind): FileSource[] {
  const own = (files: FileSource[]) => files.filter((f) => "asset" in f);
  if (kind === "feats") return own(milestoneFiles([featGroup(0)]));
  if (kind === "recap") return own(recapFiles(recapSample()));
  return [];
}

/**
 * The sample of a test kind, marked as a test. `now`: Unix seconds, for the board's times. `pageUrl`: the site's
 * Doomsday page. `attached`: the files of `testFiles` the poster could read.
 */
export function testSample(
  kind: TestKind,
  eventId: number,
  siteUrl: string,
  siteHost: string,
  now: number,
  pageUrl: string,
  attached: readonly string[] = [],
): MessageContent {
  switch (kind) {
    case "feats":
      return asTest(feats(eventId, siteUrl, siteHost, attached));
    case "recap":
      return asTest(recap(eventId, siteUrl, pageUrl, attached));
    case "doomsday":
      return asTest(board(eventId, siteUrl, now, pageUrl));
  }
}
