// The bot's Discord messages (BOT-03 onwards): the JSON shapes it sends (embeds, buttons, select menus), the web's
// colour tokens, Markdown escaping, links to the site and the markers that make every post findable after a restart
// (CLAUDE.md rule 9). Pure; shared by every message the bot builds.

export interface Embed {
  title?: string;
  url?: string;
  description?: string;
  color: number;
  /** BOT-05: the recap's cards, `inline` two or three to a row. */
  fields?: { name: string; value: string; inline?: boolean }[];
  /** BOT-05: a card image attached to the message (`attachment://<name>`). */
  image?: { url: string };
  /** BOT-04: the line above the title ("Nico on Ves Doombringer (39 Warlock)") and the small line under the embed. */
  author?: { name: string };
  footer?: { text: string };
}

/** A button (type 2) or, BOT-04, a select menu (type 3) in an action row. */
export interface Component {
  type: 2 | 3;
  style?: number;
  label?: string;
  custom_id?: string;
  url?: string;
  placeholder?: string;
  /** BOT-11: a select option's class icon. */
  options?: {
    label: string;
    value: string;
    description?: string;
    emoji?: { id: string; name: string };
    /** BOT-13: preselected. */
    default?: boolean;
  }[];
}

export interface MessageContent {
  /** BOT-04: text above the embeds, where mentions notify (the reminder, a new run). */
  content?: string;
  embeds: Embed[];
  /** Nothing is parsed; BOT-04 names the users and the role a message may notify. */
  allowed_mentions: { parse: never[]; users?: string[]; roles?: string[] };
  /** BOT-06: buttons under the message (Discord's action rows), e.g. Share; BOT-04 select menus too. */
  components?: { type: 1; components: Component[] }[];
}

/** The gold embed border (web token `--gold`). */
export const GOLD = 0xd4af6a;

/** Class colours (web tokens). */
export const CLASS_COLOURS: Readonly<Record<string, number>> = {
  WARRIOR: 0xc69b6d,
  PALADIN: 0xf48cba,
  HUNTER: 0xaad372,
  ROGUE: 0xfff468,
  PRIEST: 0xffffff,
  SHAMAN: 0x0070dd,
  MAGE: 0x3fc7eb,
  WARLOCK: 0x8788ee,
  DRUID: 0xff7c0a,
};

const CLASS_NAMES: Readonly<Record<string, string>> = {
  WARRIOR: "Warrior",
  PALADIN: "Paladin",
  HUNTER: "Hunter",
  ROGUE: "Rogue",
  PRIEST: "Priest",
  SHAMAN: "Shaman",
  MAGE: "Mage",
  WARLOCK: "Warlock",
  DRUID: "Druid",
};

/** The class's name, or undefined. */
export function className(classFile: string | undefined): string | undefined {
  return classFile ? CLASS_NAMES[classFile] : undefined;
}

/** Names and item names come from players and the game: no Discord markdown from them. */
export function escapeMarkdown(text: string): string {
  return text.replace(/[\\*_~`|>[\]()<@#:]/g, "\\$&");
}

/** The character page on the site. */
export function characterUrl(siteUrl: string, guid: string): string {
  return `${siteUrl}/character/${encodeURIComponent(guid)}`;
}

/** The marker that says a post belongs to an event: a fragment on the first character link, ignored by the site. */
export function marker(eventId: number): string {
  return `#e${eventId}`;
}

export interface PostedMessage {
  id: string;
  /** The message's embed links and descriptions. */
  texts: string[];
}

/** Event id → message id for the bot's posts that carry a marker on a link to this site. */
export function markedEvents(siteUrl: string, messages: readonly PostedMessage[]): Map<number, string> {
  const pattern = new RegExp(`${escapeRegExp(siteUrl)}/[^\\s)#]*#e(\\d+)`, "g");
  const found = new Map<number, string>();
  for (const message of messages) {
    for (const text of message.texts) {
      for (const match of text.matchAll(pattern)) {
        const id = Number(match[1]);
        if (!found.has(id)) found.set(id, message.id);
      }
    }
  }
  return found;
}

/** A text to match literally in a RegExp (the site URL in the markers). */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The admin's "Send a test post" (web WEB-39, BOT-API.md "test"): a short gold embed, marked like any post. */
export function testMessage(eventId: number, siteUrl: string, siteHost: string): MessageContent {
  return {
    embeds: [
      {
        title: "Test post",
        url: `${siteUrl}/discord${marker(eventId)}`,
        description: `Posts from ${siteHost} arrive in this channel. Sent from the site's Discord page.`,
        color: GOLD,
      },
    ],
    allowed_mentions: { parse: [] },
  };
}
