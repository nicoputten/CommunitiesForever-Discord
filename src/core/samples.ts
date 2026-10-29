// Test posts per kind (BOT-17, web WEB-58 part 2): the Discord page's test buttons for feats, the recap and
// Doomsday. Each sample is made up with names no friend has (Nico, 2026-10-28), says "Test ·" in its title and "not
// real" in its footer (only test posts do, BOT-20), and is marked like any post so it is posted once. BOT-20: the
// samples look like the visual posts, with the bot's own pictures (the class icon, the recap icons) attached. BOT-21
// (web WEB-68): the test event names the site's sample images (`images`), drawn with the same made-up names; they go
// into the sample's data where the real event has its image ids, so the real builders and the real fetch-and-attach
// path show them. Without `images` (an older site) the samples look as before: the board as text. Pure.
import { type Board, boardMessage, readBoard } from "./doomsday.js";
import { type Group, groupedMessage, milestoneFiles } from "./milestones.js";
import { type FileSource, type MessageContent } from "./message.js";
import { type Recap, readRecap, recapFiles, recapMessage } from "./recap.js";
import { isObject, opt, text } from "./read.js";

/** The test kinds with a sample of their own; any other kind gets the plain test message. */
export type TestKind = "feats" | "recap" | "doomsday";

/** BOT-21 (web WEB-68): the site's sample images for a test, by role; each a card id (`cards/<id>.png`). */
export interface TestImages {
  board?: string;
  feat?: string;
  strip?: string;
  award?: string;
  zone?: string;
}

/** The test event's `images`, read defensively: only card ids (`[a-z0-9-]`) are kept. */
export function readTestImages(data: unknown): TestImages {
  const images = isObject(data) && isObject(data.images) ? data.images : {};
  const id = (value: unknown) => {
    const t = text(value);
    return t !== undefined && /^[a-z0-9][a-z0-9-]{0,80}$/i.test(t) ? t : undefined;
  };
  return {
    ...opt("board", id(images.board)),
    ...opt("feat", id(images.feat)),
    ...opt("strip", id(images.strip)),
    ...opt("award", id(images.award)),
    ...opt("zone", id(images.zone)),
  };
}

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

function featGroup(eventId: number, images: TestImages = {}): Group {
  return {
    eventId,
    // The sample's one card: the site's big feat card (the rank 6 sample), as the event's `card` is on a real post.
    ...opt("card", images.feat),
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
        ...opt("card", images.feat),
      },
    ],
  };
}

function feats(
  eventId: number,
  siteUrl: string,
  siteHost: string,
  attached: readonly string[],
  images: TestImages,
): MessageContent {
  return groupedMessage([featGroup(eventId, images)], siteUrl, siteHost, attached) as MessageContent;
}

function recapSample(images: TestImages = {}): Recap {
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
      ...opt("image", images.award),
    },
    cards: [
      // With the site's zone map: the Bloodbath zone card it is drawn for; else a card without a map.
      images.zone !== undefined
        ? {
            id: "S13",
            slot: "stat",
            name: "Bloodbath zone",
            title: "The test grounds",
            text: "12 honorable kills, all of them test dummies.",
            image: images.zone,
          }
        : {
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

function recap(
  eventId: number,
  siteUrl: string,
  doomsdayUrl: string,
  attached: readonly string[],
  images: TestImages,
): MessageContent {
  return recapMessage(recapSample(images), siteUrl, attached, eventId, doomsdayUrl);
}

/** The sample board's data, with the site's sample picture when there is one. */
function boardSample(now: number, images: TestImages = {}): Board {
  return readBoard({
    label: "Test day",
    ...opt("image", images.board),
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
  }) as Board;
}

function board(
  eventId: number,
  siteUrl: string,
  now: number,
  pageUrl: string,
  attached: readonly string[],
  images: TestImages,
): MessageContent {
  const sample = boardSample(now, images);
  // The picture as on the real board when it could be had, else the text board (as before).
  const picture =
    sample.image !== undefined && attached.includes(`${sample.image}.png`) ? `${sample.image}.png` : undefined;
  const message = boardMessage(sample, eventId, siteUrl, pageUrl, undefined, picture);
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
 * The files a sample attaches, by the real posts' functions: the bot's own pictures (BOT-20: the class icon of the
 * feat, the recap's icons) and, BOT-21, the site's sample images the test event named. Never another image of the
 * site's (a real recap's header, say): only the ids in `images`.
 */
export function testFiles(kind: TestKind, images: TestImages = {}): FileSource[] {
  const named = new Set(Object.values(images).map((id) => `${id}.png`));
  const ours = (files: FileSource[]) => files.filter((f) => "asset" in f || named.has(f.name));
  if (kind === "feats") return ours(milestoneFiles([featGroup(0, images)]));
  if (kind === "recap") return ours(recapFiles(recapSample(images)));
  const image = boardSample(0, images).image;
  return image !== undefined ? [{ name: `${image}.png`, path: `cards/${image}.png` }] : [];
}

/**
 * The sample of a test kind, marked as a test. `now`: Unix seconds, for the board's times. `pageUrl`: the site's
 * Doomsday page. `attached`: the files of `testFiles` the poster could get. `images`: the test event's (BOT-21).
 */
export function testSample(
  kind: TestKind,
  eventId: number,
  siteUrl: string,
  siteHost: string,
  now: number,
  pageUrl: string,
  attached: readonly string[] = [],
  images: TestImages = {},
): MessageContent {
  switch (kind) {
    case "feats":
      return asTest(feats(eventId, siteUrl, siteHost, attached, images));
    case "recap":
      return asTest(recap(eventId, siteUrl, pageUrl, attached, images));
    case "doomsday":
      return asTest(board(eventId, siteUrl, now, pageUrl, attached, images));
  }
}
