// The weekly recap post (BOT-05, BOT-20; boards `bot-recap`, `bot-visual-recap`): the site computes the recap (web
// WEB-41, WEB-57, BOT-API.md "`recap`") and the bot posts its texts exactly as the site wrote them. One message of up
// to 8 embeds: the header with the numbers, the award, the cards (each its own embed, with the recap icon as thumbnail
// or its map), the Doomsday section and the challenge, then the link buttons. Pure: the event comes in as read from
// the site, the message goes out as Discord's JSON, the images as files for the poster to fetch or read and attach.
import { RECAP_CARD_ICONS, RECAP_ICONS } from "./emoji.js";
import { thousands } from "./feats.js";
import { type RecapDoomsday, readRecapDoomsday, recapDoomsdayEmbed } from "./ladder.js";
import { CLASS_COLOURS, type Embed, type FileSource, GOLD, type MessageContent, marker } from "./message.js";
import { clip, count, isObject, opt, text } from "./read.js";

export interface RecapCard {
  id: string;
  name: string;
  title: string;
  text: string;
  /** "award", "stat", "progress", "social" or "fun" (web WEB-41). */
  slot?: string;
  /** BOT-20 (web WEB-66): the card's image (`cards/<image>.png`): the award header, a zone map. */
  image?: string;
  /** BOT-20: the award winner's class, for the award's colour. */
  classFile?: string;
}

export interface Recap {
  week: number;
  quiet: boolean;
  headline: string;
  numbers: {
    honorKills?: number;
    battlegrounds?: number;
    levels?: number;
    friendsPlayed?: number;
    runs?: number;
    feats?: number;
  };
  award?: RecapCard;
  cards: RecapCard[];
  challenge?: string;
  closing?: string;
  /** BOT-16: the Doomsday section, when the site sent one. */
  doomsday?: RecapDoomsday;
  /** BOT-20: the site's page of this week, for "The full week ↗". */
  url?: string;
}

/** Discord's limits: embed description 4096, field value 1024, title 256 characters. */
const LIMIT = { description: 4096, field: 1024, title: 256 } as const;

/** The bar of the challenge (board `bot-visual-recap`). */
const CHALLENGE_GREY = 0x4e5058;

/** Each recap icon's colour, from its disc on board `bot-recap-v2-icons`: the bar of its card (BOT-20). */
const ICON_COLOURS: Readonly<Record<string, number>> = {
  RECAP_PVP: 0xe0625a,
  RECAP_DEATHS: 0xd9d4c7,
  RECAP_FALL: 0xe0a050,
  RECAP_FIRE: 0xf07f3c,
  RECAP_EPIC: 0xa335ee,
  RECAP_MOUNT: 0xd4af6a,
  RECAP_NIGHT_OWL: 0x8fa8e8,
  RECAP_EARLY_BIRD: 0xf0d08e,
  RECAP_BATTLEGROUND: 0x6fb0e0,
  RECAP_MARATHON: 0xc69b6d,
  RECAP_UNTOUCHABLE: 0x7fd99a,
  RECAP_GROUP: 0xf48cba,
};

/** The credit a picture with the site's map carries (CC BY-SA 4.0). */
export const MAP_CREDIT = "Map: Syrio, CC BY-SA 4.0";

function card(value: unknown): RecapCard | undefined {
  if (!isObject(value)) return undefined;
  const id = text(value.id);
  const name = text(value.name);
  const title = text(value.title);
  if (id === undefined || name === undefined || title === undefined) return undefined;
  const image = text(value.image);
  return {
    id,
    name,
    title,
    text: text(value.text) ?? "",
    ...opt("slot", text(value.slot)),
    ...opt("image", image !== undefined && /^[a-z0-9][a-z0-9-]{0,80}$/i.test(image) ? image : undefined),
    ...opt("classFile", text(value.classFile)),
  };
}

/** The `recap` event's data (or `GET recap/latest`), read defensively; undefined when it isn't a recap. */
export function readRecap(data: unknown): Recap | undefined {
  if (!isObject(data)) return undefined;
  const week = count(data.week);
  const headline = isObject(data.headline) ? text(data.headline.text) : undefined;
  if (week === undefined || week < 1 || headline === undefined) return undefined;
  const numbers = isObject(data.numbers) ? data.numbers : {};
  const url = text(data.url);
  const recap: Recap = {
    week,
    quiet: data.quiet === true,
    headline,
    numbers: {
      ...opt("honorKills", count(numbers.honorKills)),
      ...opt("battlegrounds", count(numbers.battlegrounds)),
      ...opt("levels", count(numbers.levels)),
      ...opt("friendsPlayed", count(numbers.friendsPlayed)),
      ...opt("runs", count(numbers.runs)),
      ...opt("feats", count(numbers.feats)),
    },
    cards: Array.isArray(data.cards) ? data.cards.flatMap((c) => card(c) ?? []) : [],
    ...opt("url", url !== undefined && /^https?:\/\/\S+$/.test(url) ? url : undefined),
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

/** The six numbers as inline fields (board `bot-visual-recap`), leaving out what the site didn't send. */
export function numberFields(n: Recap["numbers"]): NonNullable<Embed["fields"]> {
  const field = (name: string, value: number | undefined, plus = false) =>
    value === undefined ? [] : [{ name, value: `${plus && value > 0 ? "+" : ""}${thousands(value)}`, inline: true }];
  return [
    ...field("Honorable kills", n.honorKills),
    ...field("Battlegrounds", n.battlegrounds),
    ...field("Levels", n.levels, true),
    ...field("Friends played", n.friendsPlayed),
    ...field("Dungeon runs", n.runs),
    ...field("Feats", n.feats),
  ];
}

/** A recap card's icon: its key in the bot's emoji (core/emoji.ts), the file under `assets/` and the attachment's name. */
function iconOf(cardId: string): { key: string; asset: string; name: string } | undefined {
  const key = RECAP_CARD_ICONS[cardId];
  const file = RECAP_ICONS.find((i) => i.key === key)?.file;
  return key === undefined || file === undefined
    ? undefined
    : { key, asset: file, name: file.split("/").pop() as string };
}

/** The award's header image: the site's `image`, else the recap's header (web WEB-41d). */
function headerImage(recap: Recap): string {
  return recap.award?.image ?? `recap-${recap.week}-header`;
}

/** A card's map: the site's `image`, else (an older site) the zone map of the Zone of the week (S1). */
function cardImage(recap: Recap, c: RecapCard): string | undefined {
  return c.image ?? (c.id === "S1" ? `recap-${recap.week}-zone` : undefined);
}

/**
 * The files of a recap: the header image and the cards' maps from the site, and the recap icons of the bot's own for
 * the cards' thumbnails and the award's author line (BOT-20).
 */
export function recapFiles(recap: Recap): FileSource[] {
  const files: FileSource[] = [];
  const site = (id: string) => files.push({ name: `${id}.png`, path: `cards/${id}.png` });
  site(headerImage(recap));
  for (const c of recap.cards) {
    const map = cardImage(recap, c);
    if (map !== undefined) site(map);
  }
  for (const c of [...(recap.award !== undefined ? [recap.award] : []), ...recap.cards]) {
    const icon = iconOf(c.id);
    if (icon !== undefined && !files.some((f) => f.name === icon.name))
      files.push({ name: icon.name, asset: icon.asset });
  }
  return files;
}

/**
 * The recap as one message (board `bot-visual-recap`):
 * 1. the header (gold): "Weekly recap · week N", the headline (and the closing line), the numbers as inline fields
 * 2. the award (the winner's class colour): the award icon and name in the author line, the header image
 * 3. to 6. the cards, each its own embed in its icon's colour: a map with its credit, or the icon as thumbnail
 * 7. the Doomsday section (gold): PvE and PvP top 3 side by side, never added together; "Most devoted" underneath
 * 8. the challenge (grey)
 * and the link buttons "The full week ↗" and "Doomsday ladder ↗". Texts exactly as the site wrote them ("Who am I?"
 * answers are Discord spoilers); mentions are off. `attached`: the files the poster could get; a missing image is left
 * out and the rest goes out anyway. `eventId` marks the post so a restart finds it; undefined for `/recap`.
 */
export function recapMessage(
  recap: Recap,
  siteUrl: string,
  attached: readonly string[],
  eventId?: number,
  doomsdayUrl = `${siteUrl}/doomsday`,
): MessageContent {
  const has = (name: string) => attached.includes(name);
  const header = `${headerImage(recap)}.png`;
  const embeds: Embed[] = [
    {
      title: clip(`Weekly recap · week ${recap.week}`, LIMIT.title),
      url: `${siteUrl}/${eventId !== undefined ? marker(eventId) : ""}`,
      description: clip(
        // The board shows the headline only; the closing line stays on the site (Nico, 2026-10-29).
        `**${recap.headline}**`,
        LIMIT.description,
      ),
      color: GOLD,
      ...(numberFields(recap.numbers).length > 0 ? { fields: numberFields(recap.numbers) } : {}),
      // Without an award the header image goes on top.
      ...(recap.award === undefined && has(header) ? { image: { url: `attachment://${header}` } } : {}),
    },
  ];
  const award = recap.award;
  if (award !== undefined) {
    const icon = iconOf(award.id);
    embeds.push({
      author: {
        name: clip(award.name, LIMIT.title),
        ...(icon !== undefined && has(icon.name) ? { icon_url: `attachment://${icon.name}` } : {}),
      },
      description: clip(`**${award.title}**\n${award.text}`, LIMIT.description),
      color:
        (award.classFile && CLASS_COLOURS[award.classFile]) ||
        (icon !== undefined ? ICON_COLOURS[icon.key] : undefined) ||
        GOLD,
      ...(has(header) ? { image: { url: `attachment://${header}` } } : {}),
    });
  }
  for (const c of recap.cards.slice(0, 4)) {
    const icon = iconOf(c.id);
    const map = cardImage(recap, c);
    const mapName = map !== undefined && has(`${map}.png`) ? `${map}.png` : undefined;
    embeds.push({
      title: clip(c.name, LIMIT.title),
      description: clip(`**${c.title}**\n${c.text}`, LIMIT.description),
      color: (icon !== undefined ? ICON_COLOURS[icon.key] : undefined) ?? GOLD,
      ...(mapName !== undefined
        ? { image: { url: `attachment://${mapName}` }, footer: { text: MAP_CREDIT } }
        : icon !== undefined && has(icon.name)
          ? { thumbnail: { url: `attachment://${icon.name}` } }
          : {}),
    });
  }
  const doomsday = recap.doomsday !== undefined ? recapDoomsdayEmbed(recap.doomsday) : undefined;
  if (doomsday !== undefined) embeds.push(doomsday);
  if (recap.challenge !== undefined) {
    embeds.push({
      title: "This week's challenge",
      description: clip(recap.challenge, LIMIT.description),
      color: CHALLENGE_GREY,
    });
  }
  return {
    embeds,
    allowed_mentions: { parse: [] },
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 5, label: "The full week ↗", url: recap.url ?? `${siteUrl}/` },
          ...(recap.doomsday !== undefined
            ? [{ type: 2 as const, style: 5, label: "Doomsday ladder ↗", url: doomsdayUrl }]
            : []),
        ],
      },
    ],
  };
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
