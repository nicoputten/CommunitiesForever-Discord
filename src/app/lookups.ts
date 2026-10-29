// The look-up commands (BOT-06, board `bot-commands-runs`): `/whereis`, `/who`, `/whocancraft`, `/character`,
// `/alts`, `/me`, their autocomplete, and Share. Answers are only for the asker; Share posts a copy in the channel with
// "Shared by <display name>". They answer anyone in the server (only friends are in it, Nico 2026-10-28); only `/me`
// needs the asker's Discord linked on the site, and `/doomsday` (alias `/doom`, BOT-16) without a friend. The site has the data (CLAUDE.md rule 2); src/core formats it.
import type { Attachment, Autocomplete, ButtonPress, SlashCommand } from "../adapters/discord.js";
import type { Log } from "../adapters/log.js";
import type { Site, SiteAnswer } from "../adapters/site.js";
import {
  altsMessage,
  characterMessage,
  craftMessage,
  notLinkedMessage,
  nothingMessage,
  readAlts,
  readAsker,
  readCharacter,
  readCrafters,
  readNames,
  readProfessions,
  readWhereis,
  readWho,
  sharedMessage,
  whereisMessage,
  whoMessage,
} from "../core/lookups.js";
import { NO_EMOJI } from "../core/emoji.js";
import { boardUrl, boxes, doomsdayReply, notAvailableMessage, readLookup } from "../core/doomsday.js";
import type { MessageContent } from "../core/message.js";
import { isObject } from "../core/read.js";
import type { EmojiBox } from "./emoji.js";

export const LOOKUPS = ["whereis", "who", "whocancraft", "character", "alts", "me", "doomsday", "doom"] as const;

/** How long a Share button works, and how many answers are kept for it: bounded (CLAUDE.md rule 11 spirit). */
export const SHARE_FOR_MS = 15 * 60_000;
export const SHARE_KEEP = 100;

interface Kept {
  content: MessageContent;
  files: Attachment[];
  asker?: string;
  at: number;
}

/** The answers a Share button may still post, oldest dropped first. */
export class SharedAnswers {
  private next = 1;
  private kept = new Map<number, Kept>();

  keep(answer: Kept): string {
    const id = this.next++;
    this.kept.set(id, answer);
    for (const old of this.kept.keys()) {
      if (this.kept.size <= SHARE_KEEP) break;
      this.kept.delete(old);
    }
    return `share:${id}`;
  }

  take(customId: string, now: number): Kept | undefined {
    const id = Number(/^share:(\d+)$/.exec(customId)?.[1]);
    const kept = this.kept.get(id);
    if (kept === undefined || now - kept.at > SHARE_FOR_MS) return undefined;
    this.kept.delete(id);
    return kept;
  }
}

export interface LookupDeps {
  siteUrl: string;
  site: Site;
  log: Log;
  now(): number;
  shares: SharedAnswers;
  /** BOT-11: the bot's emoji, once the start-up sync has them. */
  icons?: EmojiBox;
  /** BOT-16: the site's Doomsday page (settings `doomsday.url`), when it sent one. */
  doomsdayUrl?(): string | undefined;
}

function failure(answer: Extract<SiteAnswer, { ok: false }>, what: string): MessageContent {
  if (answer.status === 404) return nothingMessage("Not found", `Nothing found for ${what}.`);
  return nothingMessage("The site isn't answering", "Try again in a moment.");
}

/** Answers one look-up command; the answer is only for the asker, with Share and a link to the site. */
export async function answerLookup(deps: LookupDeps, command: SlashCommand, signal: AbortSignal): Promise<void> {
  const host = new URL(deps.siteUrl).host;
  const nowSeconds = Math.floor(deps.now() / 1000);
  const icons = deps.icons?.current ?? NO_EMOJI;
  const o = command.options;
  const param = (name: string) => (typeof o[name] === "string" ? (o[name] as string) : undefined);
  const ask = (what: string, params: Record<string, string | undefined>) => {
    const query: Record<string, string> = { discordUserId: command.userId };
    for (const [k, v] of Object.entries(params)) if (v !== undefined) query[k] = v;
    return deps.site.lookup(what, query, signal);
  };

  let content: MessageContent;
  const files: Attachment[] = [];
  let siteLink = `${deps.siteUrl}/`;
  let answer: SiteAnswer;
  switch (command.name) {
    case "whereis": {
      const friend = param("friend");
      const character = param("character");
      if (friend === undefined && character === undefined) {
        await command.reply(nothingMessage("Whose characters?", "Give a friend or a character."));
        return;
      }
      answer = await ask("whereis", { friend, character });
      if (!answer.ok) {
        await command.reply(failure(answer, friend ?? character ?? "that"));
        return;
      }
      const { friend: whose, characters: chars, card } = readWhereis(answer.body);
      if (card !== undefined) {
        const name = `whereis-${card.replace(/[^\w-]/g, "")}.png`;
        const data = await deps.site.image(`cards/whereis-${encodeURIComponent(card)}.png`, signal);
        if (data !== undefined) files.push({ name, data });
      }
      const title = whose !== undefined ? `${whose}'s characters` : (chars[0]?.name ?? "Where");
      content = whereisMessage(title, chars, nowSeconds, deps.siteUrl, host, files[0]?.name, icons);
      break;
    }
    case "who": {
      answer = await ask("who", {
        level: param("level"),
        role: param("role"),
        class: param("class"),
        ...(o.recent === true ? { recent: "true" } : {}),
      });
      if (!answer.ok) {
        await command.reply(failure(answer, "that"));
        return;
      }
      const { total, characters: chars } = readWho(answer.body);
      const className = param("class") ? param("class")!.charAt(0) + param("class")!.slice(1).toLowerCase() : undefined;
      content = whoMessage(
        total,
        chars,
        { level: param("level"), role: param("role"), className, recent: o.recent === true },
        nowSeconds,
        icons,
      );
      break;
    }
    case "whocancraft": {
      answer = await ask("whocancraft", { profession: param("profession") });
      if (!answer.ok) {
        await command.reply(failure(answer, param("profession") ?? "that"));
        return;
      }
      const { profession, crafters } = readCrafters(answer.body);
      content = craftMessage(profession ?? param("profession") ?? "", crafters, icons);
      siteLink = `${deps.siteUrl}/professions`;
      break;
    }
    case "character": {
      answer = await ask("character", { name: param("name") });
      if (!answer.ok) {
        await command.reply(failure(answer, param("name") ?? "that"));
        return;
      }
      const c = readCharacter(isObject(answer.body) ? answer.body.character : undefined);
      if (c === undefined) {
        await command.reply(nothingMessage("Not found", "No such character."));
        return;
      }
      content = characterMessage(c, nowSeconds, deps.siteUrl, icons);
      siteLink = `${deps.siteUrl}/character/${encodeURIComponent(c.guid)}`;
      break;
    }
    case "alts":
    case "me": {
      answer = command.name === "me" ? await ask("me", {}) : await ask("alts", { friend: param("friend") });
      if (!answer.ok) {
        await command.reply(
          command.name === "me" && answer.status === 403
            ? notLinkedMessage(deps.siteUrl, host, undefined)
            : failure(answer, param("friend") ?? "that"),
        );
        return;
      }
      const alts = readAlts(answer.body);
      content = altsMessage(alts.friend ?? "You", alts.characters, nowSeconds, alts.week, icons);
      siteLink = `${deps.siteUrl}/roster`;
      break;
    }
    case "doomsday":
    case "doom": {
      const friend = param("friend");
      answer = await ask("doomsday", { friend });
      if (!answer.ok) {
        await command.reply(
          answer.status === 403
            ? notLinkedMessage(deps.siteUrl, host, undefined)
            : friend !== undefined && answer.error === "not_found"
              ? nothingMessage("Not found", "No friend by that name.")
              : notAvailableMessage(answer.status),
        );
        return;
      }
      const look = readLookup(answer.body);
      if (look === undefined) {
        await command.reply(notAvailableMessage(404));
        return;
      }
      siteLink = boardUrl(deps.siteUrl, deps.doomsdayUrl?.());
      content = doomsdayReply(look, friend === undefined, siteLink, boxes(icons));
      break;
    }
    default:
      return;
  }

  const asker = readAsker(answer.body);
  const customId = deps.shares.keep({ content, files, ...(asker !== undefined ? { asker } : {}), at: deps.now() });
  await command.reply(
    {
      ...content,
      components: [
        {
          type: 1,
          components: [
            { type: 2, style: 2, label: "Share", custom_id: customId },
            { type: 2, style: 5, label: "Open on site ↗", url: siteLink },
          ],
        },
      ],
    },
    files,
  );
}

/** Share: posts the kept answer in the channel, "Shared by <display name>" under it; once. */
export async function answerShare(deps: LookupDeps, press: ButtonPress): Promise<void> {
  if (!press.customId.startsWith("share:")) return;
  const kept = deps.shares.take(press.customId, deps.now());
  if (kept === undefined) return;
  await press.share(sharedMessage(kept.content, kept.asker), kept.files);
}

/** Autocomplete: friends and characters from the site's names, professions from its list. */
export async function answerAutocomplete(deps: LookupDeps, request: Autocomplete, signal: AbortSignal): Promise<void> {
  if (request.option === "profession") {
    const answer = await deps.site.lookup("professions", {}, signal);
    const wanted = request.value.toLowerCase();
    await request.respond(
      (answer.ok ? readProfessions(answer.body) : [])
        .filter((p) => p.toLowerCase().includes(wanted))
        .map((p) => ({ name: p, value: p })),
    );
    return;
  }
  const kind =
    request.option === "friend"
      ? "friend"
      : request.option === "character" || request.option === "name"
        ? "character"
        : undefined;
  if (kind === undefined) return;
  const answer = await deps.site.lookup("names", { q: request.value, kind }, signal);
  await request.respond(answer.ok ? readNames(answer.body) : []);
}
