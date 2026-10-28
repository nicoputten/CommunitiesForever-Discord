// Test posts per kind (BOT-17, web WEB-58 part 2): the Discord page's test buttons for feats, the recap and
// Doomsday. Each sample is made up with names no friend has (Nico, 2026-10-28), carries no card image, says "Test ·" in
// its title and "not real" in its footer, and is marked like any post so it is posted once. Pure.
import { boardMessage, readBoard } from "./doomsday.js";
import { type MessageContent, groupedMessage } from "./milestones.js";
import { readRecap, recapMessage } from "./recap.js";

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

function feats(eventId: number, siteUrl: string, siteHost: string): MessageContent {
  const message = groupedMessage(
    [
      {
        eventId,
        milestones: [
          {
            kind: "pvpRank",
            character: CHARACTER,
            rank: 6,
            rankName: "Stone Guard",
            title: "Mailbox Menace",
            firstInGroup: true,
          },
        ],
      },
    ],
    siteUrl,
    siteHost,
  );
  return message as MessageContent;
}

function recap(eventId: number, siteUrl: string, siteHost: string, doomsdayUrl: string): MessageContent {
  const sample = readRecap({
    week: 1,
    headline: { text: "A week of tests" },
    numbers: { levels: 3, friendsPlayed: 2, runs: 1, newCharacters: 0 },
    cards: [{ id: "S2", name: "Class census", title: "One Warlock", text: `${CHARACTER.name} holds the line alone.` }],
    challenge: { text: "Send one more test post" },
    doomsday: {
      mostDevoted: { name: FRIEND, days: 3 },
      perfectWeek: [],
      points: { pve: [{ name: FRIEND, points: 15 }], pvp: [{ name: OTHER, points: 5 }] },
    },
  });
  return recapMessage(sample!, siteUrl, siteHost, [], eventId, doomsdayUrl);
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

/**
 * The sample of a test kind, marked as a test. `now`: Unix seconds, for the board's times. `pageUrl`: the site's
 * Doomsday page.
 */
export function testSample(
  kind: TestKind,
  eventId: number,
  siteUrl: string,
  siteHost: string,
  now: number,
  pageUrl: string,
): MessageContent {
  switch (kind) {
    case "feats":
      return asTest(feats(eventId, siteUrl, siteHost));
    case "recap":
      return asTest(recap(eventId, siteUrl, siteHost, pageUrl));
    case "doomsday":
      return asTest(board(eventId, siteUrl, now, pageUrl));
  }
}
