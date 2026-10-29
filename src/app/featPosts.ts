// Feat posts (BOT-03, BOT-09, BOT-14): one post per upload, with the site's one card image (BOT-05), and the feats of
// uploads within 5 minutes of a post added to it by editing, up to 10. The poster hands each `milestones` event here
// and acknowledges it with the message id this resolves.
import type { Attachment, Discord } from "../adapters/discord.js";
import { PostError } from "../adapters/discord.js";
import type { Log } from "../adapters/log.js";
import type { Site } from "../adapters/site.js";
import type { MessageContent } from "../core/message.js";
import { type Group, type Milestone, groupedMessage, joinsPost, milestoneFiles } from "../core/milestones.js";
import type { EmojiBox } from "./emoji.js";

export interface FeatDeps {
  siteUrl: string;
  site: Site;
  discord: Discord;
  log: Log;
  now(): number;
  icons?: EmojiBox;
}

/** The post that still takes feats; at most MAX_LINES feats, so bounded. `attached`: its card image, kept by edits. */
interface Open {
  id: string;
  channel: string;
  at: number;
  groups: Group[];
  attached: string[];
}

export class FeatPosts {
  private open: Open | undefined;

  constructor(
    private readonly deps: FeatDeps,
    private readonly signal: AbortSignal,
  ) {}

  /** A new posts or feats channel: no post is open any more. */
  forget(): void {
    this.open = undefined;
  }

  /**
   * Adds an upload's feats to the open post in `channel`, or posts them; resolves the message id, or undefined when
   * the bot is stopping. Throws a PostError to retry.
   */
  async handle(eventId: number, milestones: Milestone[], card: string | undefined, channel: string) {
    const { siteUrl, site, discord, log, now, icons } = this.deps;
    const host = new URL(siteUrl).host;
    const group: Group = { eventId, milestones, ...(card !== undefined ? { card } : {}) };
    const open = this.open;
    const shownInOpen = open?.groups.reduce((n, g) => n + g.milestones.length, 0) ?? 0;
    if (open?.channel === channel && joinsPost(open.at, shownInOpen, milestones.length, now())) {
      const groups = [...open.groups, group];
      try {
        await discord.edit(
          channel,
          open.id,
          groupedMessage(groups, siteUrl, host, open.attached, icons?.current) as MessageContent,
        );
        open.groups = groups;
        log.info(`added event ${eventId} to the post of event ${groups[0]?.eventId}`);
        return open.id;
      } catch (error) {
        // Deleted or not editable: a new post instead.
        log.error(`discord: adding event ${eventId} to the open post failed (${codeOf(error)}); posting it`);
        this.open = undefined;
      }
    }
    const files: Attachment[] = [];
    for (const file of milestoneFiles([group])) {
      const data = await site.image(file.path, this.signal);
      if (data !== undefined) files.push({ name: file.name, data });
    }
    if (this.signal.aborted) return undefined;
    const attached = files.map((f) => f.name);
    const id = await discord.post(
      channel,
      groupedMessage([group], siteUrl, host, attached, icons?.current) as MessageContent,
      files,
    );
    this.open = { id, channel, at: now(), groups: [group], attached };
    log.info(`posted event ${eventId}`);
    return id;
  }
}

function codeOf(error: unknown): string {
  return error instanceof PostError ? `code ${error.code ?? "none"}` : "no answer";
}
