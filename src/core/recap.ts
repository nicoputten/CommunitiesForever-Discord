// The weekly recap post (BOT-05, board `bot-recap`): the site computes the recap (web WEB-41, BOT-API.md "`recap`")
// and the bot posts its texts exactly as the site wrote them. Pure: the event comes in as read from the site, the
// message goes out as Discord's JSON, the card images (web WEB-41d) as files for the poster to fetch and attach.
import { type Emojis, NO_EMOJI, cardIcon } from "./emoji.js";
import { type RecapDoomsday, readRecapDoomsday, recapDoomsdayField } from "./ladder.js";
import { type Embed, GOLD, type MessageContent, marker } from "./message.js";
import { clip, count, isObject, text } from "./read.js";

export interface RecapCard {
  id: string;
  name: string;
  title: string;
  text: string;
}

export interface Recap {
  week: number;
  quiet: boolean;
  headline: string;
  numbers: { levels?: number; friendsPlayed?: number; runs?: number; newCharacters?: number };
  award?: RecapCard;
  cards: RecapCard[];
  challenge?: string;
  closing?: string;
  /** BOT-16: the Doomsday section, when the site sent one. */
  doomsday?: RecapDoomsday;
}

/** A card image to fetch from the site (`cards/<id>.png`) and attach under `name`. */
export interface CardFile {
  name: string;
  path: string;
}

/** Discord's limits: embed description 4096, field value 1024, title 256 characters. */
const LIMIT = { description: 4096, field: 1024, title: 256 } as const;

function card(value: unknown): RecapCard | undefined {
  if (!isObject(value)) return undefined;
  const id = text(value.id);
  const name = text(value.name);
  const title = text(value.title);
  if (id === undefined || name === undefined || title === undefined) return undefined;
  return { id, name, title, text: text(value.text) ?? "" };
}

/** The `recap` event's data (or `GET recap/latest`), read defensively; undefined when it isn't a recap. */
export function readRecap(data: unknown): Recap | undefined {
  if (!isObject(data)) return undefined;
  const week = count(data.week);
  const headline = isObject(data.headline) ? text(data.headline.text) : undefined;
  if (week === undefined || week < 1 || headline === undefined) return undefined;
  const numbers = isObject(data.numbers) ? data.numbers : {};
  const recap: Recap = {
    week,
    quiet: data.quiet === true,
    headline,
    numbers: {
      levels: count(numbers.levels),
      friendsPlayed: count(numbers.friendsPlayed),
      runs: count(numbers.runs),
      newCharacters: count(numbers.newCharacters),
    },
    cards: Array.isArray(data.cards) ? data.cards.flatMap((c) => card(c) ?? []) : [],
  };
  const award = card(data.award);
  if (award !== undefined) recap.award = award;
  const challenge = isObject(data.challenge) ? text(data.challenge.text) : undefined;
  if (challenge !== undefined) recap.challenge = challenge;
  const closing = text(data.closing);
  if (closing !== undefined) recap.closing = closing;
  const doomsday = readRecapDoomsday(data.doomsday);
  if (doomsday !== undefined) recap.doomsday = doomsday;
  return recap;
}

/** "+18 levels · 5 friends played · 7 dungeon runs · 2 new characters", leaving out what the site didn't send. */
export function numbersLine(n: Recap["numbers"]): string {
  const part = (value: number | undefined, one: string, many: string, plus = false) =>
    value === undefined ? undefined : `${plus ? "+" : ""}${value} ${value === 1 ? one : many}`;
  return [
    part(n.levels, "level", "levels", true),
    part(n.friendsPlayed, "friend played", "friends played"),
    part(n.runs, "dungeon run", "dungeon runs"),
    part(n.newCharacters, "new character", "new characters"),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The card images of a recap (web BOT-API.md "Card images"): the header always, the zone map with the S1 card. */
export function recapFiles(recap: Recap): CardFile[] {
  const files = [{ name: `recap-${recap.week}-header.png`, path: `cards/recap-${recap.week}-header.png` }];
  if (recap.cards.some((c) => c.id === "S1")) {
    files.push({ name: `recap-${recap.week}-zone.png`, path: `cards/recap-${recap.week}-zone.png` });
  }
  return files;
}

/**
 * The recap as one message: the header image and headline with the numbers, the award, the cards two by two, the
 * challenge and the closing line. Texts exactly as the site wrote them ("Who am I?" answers are Discord spoilers);
 * mentions are off. `attached`: the images the poster could fetch; a missing one is left out. `eventId` marks the post
 * (core/milestones.ts `marker`) so a restart finds it; undefined for `/recap`, which is not a post. BOT-16: the
 * Doomsday section before the challenge, its "Full ladder" linking to `doomsdayUrl`. BOT-14: a card's icon starts
 * its first line, since Discord shows no custom emoji in a field name or title (DESIGN-NOTES "Deviations").
 */
export function recapMessage(
  recap: Recap,
  siteUrl: string,
  siteHost: string,
  attached: readonly string[],
  eventId?: number,
  doomsdayUrl = `${siteUrl}/doomsday`,
  icons: Emojis = NO_EMOJI,
): MessageContent {
  const image = (name: string) => (attached.includes(name) ? { image: { url: `attachment://${name}` } } : {});
  const [header, zone] = recapFiles(recap).map((f) => f.name);
  const embeds: Embed[] = [
    {
      title: clip(recap.headline, LIMIT.title),
      url: `${siteUrl}/${eventId !== undefined ? marker(eventId) : ""}`,
      description: clip(numbersLine(recap.numbers), LIMIT.description),
      color: GOLD,
      ...image(header!),
    },
  ];
  if (recap.award !== undefined) {
    embeds.push({
      title: clip(recap.award.name, LIMIT.title),
      description: clip(
        `${cardIcon(icons, recap.award.id)}**${recap.award.title}**\n${recap.award.text}`,
        LIMIT.description,
      ),
      color: GOLD,
    });
  }
  const fields = recap.cards.map((c) => ({
    name: clip(c.name, LIMIT.title),
    value: clip(`${cardIcon(icons, c.id)}**${c.title}**\n${c.text}`, LIMIT.field),
    inline: true,
  }));
  const doomsday = recap.doomsday !== undefined ? recapDoomsdayField(recap.doomsday, doomsdayUrl) : undefined;
  if (doomsday !== undefined) fields.push(doomsday);
  if (recap.challenge !== undefined) {
    fields.push({ name: "This week's challenge", value: clip(recap.challenge, LIMIT.field), inline: false });
  }
  if (fields.length > 0 || recap.closing !== undefined) {
    embeds.push({
      ...(fields.length > 0 ? { fields } : {}),
      description: clip(
        `${recap.closing ?? ""}\n[${siteHost} · the full week ↗](${siteUrl}/)`.trim(),
        LIMIT.description,
      ),
      color: GOLD,
      ...(zone !== undefined ? image(zone) : {}),
    });
  }
  return { embeds, allowed_mentions: { parse: [] } };
}

/** `/recap` before the site's first recap, or when the site can't be reached. */
export function noRecapMessage(siteUrl: string, siteHost: string, reachable: boolean): MessageContent {
  return {
    embeds: [
      {
        title: reachable ? "No recap yet" : "The recap isn't available right now",
        description: reachable
          ? `The first weekly recap comes on Sunday. [${siteHost} ↗](${siteUrl}/)`
          : `Try again in a moment. [${siteHost} ↗](${siteUrl}/)`,
        color: GOLD,
      },
    ],
    allowed_mentions: { parse: [] },
  };
}
