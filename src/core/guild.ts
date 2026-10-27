// The server's channels and roles for the site's dropdowns (BOT-08, web repo docs/BOT-API.md "Guild"). Pure: the
// adapter hands in what Discord knows, this decides what the site gets.

export interface GuildChannel {
  id: string;
  name: string;
  kind: "text" | "announcement" | "other";
  position: number;
  /** The bot may view the channel, send messages and embed links in it. */
  canPost: boolean;
}

export interface GuildRole {
  id: string;
  name: string;
  position: number;
  mentionable: boolean;
  /** A bot's or integration's own role. */
  managed: boolean;
  /** The @everyone role. */
  everyone: boolean;
}

export interface GuildSnapshot {
  channels: GuildChannel[];
  roles: GuildRole[];
}

export interface GuildReport {
  channels: { id: string; name: string }[];
  roles: { id: string; name: string }[];
}

// BOT-API.md "Guild": at most 500 channels and 250 roles, names at most 100 characters without control characters.
export const MAX_CHANNELS = 500;
export const MAX_ROLES = 250;
const MAX_NAME = 100;

/**
 * What the site gets: text and announcement channels the bot can post in, in Discord's order; roles it can mention
 * (mentionable, not @everyone, not a bot's or integration's own), highest first as Discord lists them.
 */
export function guildReport(snapshot: GuildSnapshot): GuildReport {
  const channels = snapshot.channels
    .filter((c) => c.kind !== "other" && c.canPost)
    .sort((a, b) => a.position - b.position || compareIds(a.id, b.id))
    .slice(0, MAX_CHANNELS)
    .map((c) => ({ id: c.id, name: cleanName(c.name) }));
  const roles = snapshot.roles
    .filter((r) => r.mentionable && !r.managed && !r.everyone)
    .sort((a, b) => b.position - a.position || compareIds(a.id, b.id))
    .slice(0, MAX_ROLES)
    .map((r) => ({ id: r.id, name: cleanName(r.name) }));
  return { channels, roles };
}

function compareIds(a: string, b: string): number {
  return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
}

const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;

function cleanName(name: string): string {
  const clean = name.replace(CONTROL, "").trim();
  return [...(clean || "?")].slice(0, MAX_NAME).join("");
}

/** The log line for a report: counts only (docs/ARCHITECTURE.md "Privacy"). */
export function reportText(report: GuildReport): string {
  return `site: reported ${report.channels.length} channels and ${report.roles.length} roles`;
}
