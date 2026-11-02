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
  /** BOT-20: a small picture at the top right (a recap card's icon). */
  thumbnail?: { url: string };
  /**
   * BOT-04: the line above the title ("Nico on Ves Doombringer (39 Warlock)") and the small line under the embed.
   * BOT-20: the author line's picture (a class icon, attached).
   */
  author?: { name: string; icon_url?: string };
  footer?: { text: string };
}

/**
 * BOT-20: a file a message attaches and references as `attachment://<name>`: an image the site renders
 * (`cards/<id>.png`), or a picture of the bot's own under `assets/`.
 */
export type FileSource = { name: string; path: string } | { name: string; asset: string };

/** The files a message references (`attachment://<name>` in images, thumbnails and author lines). */
export function attachmentNames(content: MessageContent): string[] {
  const urls = content.embeds.flatMap((e) => [e.image?.url, e.thumbnail?.url, e.author?.icon_url]);
  return [...new Set(urls.flatMap((u) => (u?.startsWith("attachment://") ? [u.slice("attachment://".length)] : [])))];
}

/** The class icon of the bot's own (`assets/class-icons/`) as a file to attach, for an author line (BOT-20). */
export function classIconFile(classFile: string | undefined): FileSource | undefined {
  if (classFile === undefined || !/^[A-Z]+$/.test(classFile) || CLASS_COLOURS[classFile] === undefined)
    return undefined;
  const file = `${classFile.toLowerCase()}.png`;
  return { name: `class-${file}`, asset: `class-icons/${file}` };
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

/** Discord's limits on a message (characters; Discord counts fewer than JavaScript's length for emoji, so this is safe). */
export const LIMITS = {
  content: 2000,
  embeds: 10,
  title: 256,
  description: 4096,
  fields: 25,
  fieldName: 256,
  fieldValue: 1024,
  footer: 2048,
  author: 256,
  /** All embeds of a message together: titles, descriptions, field names and values, footers and author names. */
  total: 6000,
} as const;

/**
 * The message within Discord's limits, so a long text from the site or many names never get a post refused (50035):
 * each text is cut with "…", and over the total the longest description or field value is cut first.
 */
export function fitLimits(message: MessageContent): MessageContent {
  const embeds: Embed[] = message.embeds.slice(0, LIMITS.embeds).map((e) => ({
    ...e,
    ...(e.title !== undefined ? { title: cut(e.title, LIMITS.title) } : {}),
    ...(e.description !== undefined ? { description: cut(e.description, LIMITS.description) } : {}),
    ...(e.fields !== undefined
      ? {
          fields: e.fields
            .slice(0, LIMITS.fields)
            .map((f) => ({ ...f, name: cut(f.name, LIMITS.fieldName), value: cut(f.value, LIMITS.fieldValue) })),
        }
      : {}),
    ...(e.footer !== undefined ? { footer: { ...e.footer, text: cut(e.footer.text, LIMITS.footer) } } : {}),
    ...(e.author !== undefined ? { author: { ...e.author, name: cut(e.author.name, LIMITS.author) } } : {}),
  }));
  let over = embeds.reduce((n, e) => n + embedLength(e), 0) - LIMITS.total;
  while (over > 0) {
    // The longest text that can still give.
    let longest: { text: string; set: (text: string) => void } | undefined;
    for (const e of embeds) {
      const texts = [
        ...(e.description !== undefined ? [{ text: e.description, set: (t: string) => (e.description = t) }] : []),
        ...(e.fields ?? []).map((f) => ({ text: f.value, set: (t: string) => (f.value = t) })),
      ];
      for (const t of texts) if (longest === undefined || t.text.length > longest.text.length) longest = t;
    }
    if (longest === undefined || longest.text.length <= 1) break;
    const shorter = cut(longest.text, Math.max(1, longest.text.length - over));
    over -= longest.text.length - shorter.length;
    longest.set(shorter);
  }
  return {
    ...message,
    ...(message.content !== undefined ? { content: cut(message.content, LIMITS.content) } : {}),
    embeds,
  };
}

function embedLength(e: Embed): number {
  return (
    (e.title?.length ?? 0) +
    (e.description?.length ?? 0) +
    (e.fields ?? []).reduce((n, f) => n + f.name.length + f.value.length, 0) +
    (e.footer?.text.length ?? 0) +
    (e.author?.name.length ?? 0)
  );
}

/** At most `max` characters, "…" last when cut, never half an emoji (a lone surrogate). */
function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  let kept = text.slice(0, Math.max(0, max - 1));
  if (/[\uD800-\uDBFF]$/.test(kept)) kept = kept.slice(0, -1);
  return `${kept}…`;
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
