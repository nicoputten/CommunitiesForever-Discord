// The weekly Doomsday ladder post (BOT-16, board `bot-doomsday-weekly`) and the recap's Doomsday section (board
// `bot-recap-doomsday`). Pure: the site's `doomsdayLadder` event and the recap's `doomsday` field come in as read from
// the site. PvE and PvP are two rankings side by side, never one; a PvP Virgin is never on the PvP ladder.
import { type Embed, GOLD, type MessageContent, escapeMarkdown, marker } from "./milestones.js";
import { thousands } from "./feats.js";
import { clip, count, isObject, list, names, opt, text } from "./read.js";

export interface LadderRow {
  place: number;
  name: string;
  points: number;
  move?: { kind: "up" | "down" | "same" | "new"; by?: number };
}

/** The `doomsdayLadder` event's data: the week that just ended. */
export interface Ladder {
  /** Asked of the site (2026-10-28): "week 44"; without it the post names the week by its start. */
  label?: string;
  start?: number;
  pve: LadderRow[];
  pvp: LadderRow[];
  duelChampion?: { name: string; rating?: number; wins?: number; losses?: number };
  mostKillsInZone?: { name: string; zone: string; kills: number };
  battlegrounds?: {
    friends: { place: number; name: string; points: number; wins?: number; losses?: number; kills?: number }[];
    games: { name: string; wins: number; losses: number }[];
  };
  pvpVirgins: string[];
  withoutData: string[];
}

function readRows(value: unknown): LadderRow[] {
  return list(value).flatMap((r): LadderRow[] => {
    const place = count(r.place);
    const name = text(r.name);
    const points = count(r.points);
    if (place === undefined || name === undefined || points === undefined) return [];
    const m = isObject(r.move) ? r.move : undefined;
    const kind = m?.kind === "up" || m?.kind === "down" || m?.kind === "same" || m?.kind === "new" ? m.kind : undefined;
    return [{ place, name, points, ...(kind !== undefined ? { move: { kind, ...opt("by", count(m?.by)) } } : {}) }];
  });
}

/** A `doomsdayLadder` event's data; undefined when it holds no ladder at all. */
export function readLadder(data: unknown): Ladder | undefined {
  if (!isObject(data) || (!Array.isArray(data.pve) && !Array.isArray(data.pvp))) return undefined;
  const duel = isObject(data.duelChampion) ? data.duelChampion : {};
  const zone = isObject(data.mostKillsInZone) ? data.mostKillsInZone : {};
  const bg = isObject(data.battlegrounds) ? data.battlegrounds : undefined;
  const duelName = text(duel.name);
  const zoneName = text(zone.name);
  const zoneZone = text(zone.zone);
  const zoneKills = count(zone.kills);
  const start = count(data.start);
  return {
    ...opt("label", text(data.label)),
    ...opt("start", start !== undefined && start > 0 ? start : undefined),
    pve: readRows(data.pve),
    pvp: readRows(data.pvp),
    ...(duelName !== undefined
      ? {
          duelChampion: {
            name: duelName,
            ...opt("rating", count(duel.rating)),
            ...opt("wins", count(duel.wins)),
            ...opt("losses", count(duel.losses)),
          },
        }
      : {}),
    ...(zoneName !== undefined && zoneZone !== undefined && zoneKills !== undefined
      ? { mostKillsInZone: { name: zoneName, zone: zoneZone, kills: zoneKills } }
      : {}),
    ...(bg !== undefined
      ? {
          battlegrounds: {
            friends: list(bg.friends).flatMap((f) => {
              const place = count(f.place);
              const name = text(f.name);
              const points = count(f.points);
              if (place === undefined || name === undefined || points === undefined) return [];
              return [
                {
                  place,
                  name,
                  points,
                  ...opt("wins", count(f.wins)),
                  ...opt("losses", count(f.losses)),
                  ...opt("kills", count(f.kills)),
                },
              ];
            }),
            games: list(bg.games).flatMap((g) => {
              const name = text(g.name);
              const wins = count(g.wins);
              const losses = count(g.losses);
              return name !== undefined && wins !== undefined && losses !== undefined ? [{ name, wins, losses }] : [];
            }),
          },
        }
      : {}),
    pvpVirgins: names(data.pvpVirgins),
    withoutData: names(data.withoutData),
  };
}

/** " ▲1", " ▼2", " –", " new" (board `bot-doomsday-weekly`). */
function move(row: LadderRow): string {
  switch (row.move?.kind) {
    case "up":
      return ` ▲${row.move.by ?? ""}`;
    case "down":
      return ` ▼${row.move.by ?? ""}`;
    case "same":
      return " –";
    case "new":
      return " new";
    default:
      return "";
  }
}

function ladderLines(rows: readonly LadderRow[]): string {
  return rows.length === 0
    ? "Nobody yet"
    : rows.map((r) => `${r.place}. **${escapeMarkdown(r.name)}** ${thousands(r.points)}${move(r)}`).join("\n");
}

function winsLosses(wins?: number, losses?: number): string | undefined {
  return wins !== undefined && losses !== undefined ? `${wins}–${losses}` : undefined;
}

/**
 * The weekly ladder post, Sunday at the reset: PvP and PvE top 5 side by side with movement, the duel champion, the
 * most kills in one zone, the battlegrounds apart from the kills, the PvP Virgins of the week and the link to the
 * all-time ladder on the site. The intro and the PvP Virgin line are fixed texts without facts (Nico, 2026-10-28).
 * `eventId` marks the post.
 */
export function ladderMessage(
  ladder: Ladder,
  eventId: number,
  siteUrl: string,
  siteHost: string,
  pageUrl: string,
): MessageContent {
  const week = ladder.label !== undefined ? escapeMarkdown(ladder.label) : undefined;
  const intro =
    week !== undefined
      ? `${week.charAt(0).toUpperCase()}${week.slice(1)} is done. Proud of the grind.`
      : ladder.start !== undefined
        ? `The week of <t:${ladder.start}:D> is done. Proud of the grind.`
        : "The week is done. Proud of the grind.";
  const fields: NonNullable<Embed["fields"]> = [
    { name: "PvP top 5", value: ladderLines(ladder.pvp), inline: true },
    { name: "PvE top 5", value: ladderLines(ladder.pve), inline: true },
  ];
  const champion = ladder.duelChampion;
  if (champion !== undefined) {
    const value = [
      `**${escapeMarkdown(champion.name)}**`,
      winsLosses(champion.wins, champion.losses),
      champion.rating !== undefined ? `rating ${thousands(champion.rating)}` : undefined,
    ].filter(Boolean);
    fields.push({ name: "Duel champion", value: value.join(" · "), inline: true });
  }
  const zone = ladder.mostKillsInZone;
  if (zone !== undefined) {
    fields.push({
      name: "Most kills in one zone",
      value: `**${escapeMarkdown(zone.name)}** · ${thousands(zone.kills)} in ${escapeMarkdown(zone.zone)}`,
      inline: true,
    });
  }
  const bg = ladder.battlegrounds;
  if (bg !== undefined && (bg.games.length > 0 || bg.friends.length > 0)) {
    const lines: string[] = [];
    if (bg.games.length > 0) {
      lines.push(bg.games.map((g) => `${escapeMarkdown(g.name)} ${g.wins} W · ${g.losses} L`).join("  ·  "));
    }
    for (const f of bg.friends) {
      const parts = [
        `${f.place}. **${escapeMarkdown(f.name)}** ${thousands(f.points)}`,
        winsLosses(f.wins, f.losses),
        f.kills !== undefined ? `${thousands(f.kills)} kills` : undefined,
      ];
      lines.push(parts.filter(Boolean).join(" · "));
    }
    fields.push({ name: "Battlegrounds · kept apart from the kills above", value: lines.join("\n"), inline: false });
  }
  const notes: string[] = [];
  const virgins = ladder.pvpVirgins.map(escapeMarkdown);
  if (virgins.length === 1) {
    notes.push(`PvP Virgin of the week: ${virgins[0]}. Still pure. The Night Elves of Ashenvale send their thanks.`);
  } else if (virgins.length > 1) {
    notes.push(`PvP Virgins of the week: ${virgins.join(", ")}. Still pure.`);
  }
  if (ladder.withoutData.length > 0) {
    notes.push(`No Doomsday data yet: ${ladder.withoutData.map(escapeMarkdown).join(", ")}.`);
  }
  notes.push(`[The all-time ladder on ${siteHost} ↗](${pageUrl})`);
  return {
    embeds: [
      {
        title: `Doomsday ladder${week !== undefined ? ` · ${week}` : ""}`,
        url: `${siteUrl}/doomsday${marker(eventId)}`,
        description: clip(`${intro}\n\n${notes.join("\n")}`, 4096),
        fields: fields.map((f) => ({ ...f, value: clip(f.value, 1024) })),
        color: GOLD,
      },
    ],
    allowed_mentions: { parse: [] },
  };
}

// --- the recap's Doomsday section ------------------------------------------------------------------------------

/** The recap's optional `doomsday` field (BOT-API.md "Recap: `doomsday`"). */
export interface RecapDoomsday {
  mostDevoted?: { name: string; days: number };
  perfectWeek: string[];
  points: { pve: { name: string; points: number }[]; pvp: { name: string; points: number }[] };
  /** Asked of the site (2026-10-28): crowns per friend that week, most first. */
  crowns: { name: string; count: number }[];
}

/** The recap's `doomsday`; undefined when it isn't there (nobody has Doomsday data, or an older site). */
export function readRecapDoomsday(value: unknown): RecapDoomsday | undefined {
  if (!isObject(value)) return undefined;
  const devoted = isObject(value.mostDevoted) ? value.mostDevoted : {};
  const devotedName = text(devoted.name);
  const devotedDays = count(devoted.days);
  const points = isObject(value.points) ? value.points : {};
  const scores = (v: unknown) =>
    list(v).flatMap((p) => {
      const name = text(p.name);
      const n = count(p.points);
      return name !== undefined && n !== undefined ? [{ name, points: n }] : [];
    });
  return {
    ...(devotedName !== undefined && devotedDays !== undefined
      ? { mostDevoted: { name: devotedName, days: devotedDays } }
      : {}),
    perfectWeek: names(value.perfectWeek),
    points: { pve: scores(points.pve), pvp: scores(points.pvp) },
    crowns: list(value.crowns).flatMap((c) => {
      const name = text(c.name);
      const n = count(c.count);
      return name !== undefined && n !== undefined && n > 0 ? [{ name, count: n }] : [];
    }),
  };
}

/**
 * The recap's "Doomsday · this week" section (board `bot-recap-doomsday`): Most devoted, Perfect week, the PvE and PvP
 * points side by side, the crowns and the link to the ladder on the site. Undefined when there is nothing to say.
 */
export function recapDoomsdayField(
  d: RecapDoomsday,
  pageUrl: string,
): { name: string; value: string; inline: false } | undefined {
  const lines: string[] = [];
  if (d.mostDevoted !== undefined) {
    const days = d.mostDevoted.days;
    lines.push(
      `**Most devoted:** ${escapeMarkdown(d.mostDevoted.name)}, goals on ${days >= 7 ? "all 7 days" : `${days} ${days === 1 ? "day" : "days"}`}`,
    );
  }
  if (d.perfectWeek.length > 0) {
    lines.push(`**Perfect week:** ${d.perfectWeek.map(escapeMarkdown).join(", ")}, every PvE goal`);
  }
  const top = (rows: readonly { name: string; points: number }[]) =>
    rows.map((r) => `${escapeMarkdown(r.name)} ${thousands(r.points)}`).join(" · ");
  if (d.points.pve.length > 0) lines.push(`**PvE** ${top(d.points.pve)}`);
  if (d.points.pvp.length > 0) lines.push(`**PvP** ${top(d.points.pvp)}`);
  if (lines.length === 0) return undefined;
  const crowns =
    d.crowns.length > 0
      ? `Crowns this week: ${d.crowns.map((c) => `${escapeMarkdown(c.name)} ${c.count}`).join(", ")}. `
      : "";
  lines.push(`${crowns}[Full ladder ↗](${pageUrl})`);
  return { name: "Doomsday · this week", value: clip(lines.join("\n"), 1024), inline: false };
}
