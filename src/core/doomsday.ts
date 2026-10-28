// Doomsday (BOT-15, BOT-16; rules in the addon repo's docs/DOOMSDAY.md, contract in web docs/BOT-API.md "Doomsday").
// The site computes everything; this file reads its answers defensively (CLAUDE.md rule 10) and turns them into
// Discord messages: the daily board (board `bot-doomsday-daily`) and the `/doomsday` reply (`bot-doomsday-weekly`).
// Pure: times come in as the site's Unix seconds and are shown with Discord's timestamp markup. PvE and PvP points are
// never added together; a PvP Virgin has no PvP points (`null`), shown, never ranked.
import type { ClassIcons } from "./classIcons.js";
import { ordinal, thousands } from "./feats.js";
import { type Embed, GOLD, type MessageContent, escapeMarkdown, marker } from "./message.js";
import { clip, count, isObject, names, opt, text, time } from "./read.js";

export type Track = "pve" | "pvp";

/** Points per track; `pvp` null for a PvP Virgin. */
export interface Points {
  pve: number;
  pvp: number | null;
}

/** A goal of the day or week (BOT-API.md "Goals"). */
export interface Goal {
  slot: string;
  id: string;
  title: string;
  track: Track;
  points?: number;
}

/** A friend's state of a goal; a slot a board row doesn't list is the day's goal, not done. */
export interface FriendGoal {
  slot: string;
  id?: string;
  done: boolean;
  at?: number;
  swappedFrom?: { id?: string; title: string };
  progress?: { have: number; need: number };
}

export interface BoardFriend {
  name: string;
  goals: FriendGoal[];
  doneCount?: number;
  crossedOut: boolean;
  today?: Points;
  week?: Points;
  streak?: number;
  best?: number;
  pvpVirgin: boolean;
}

/** The `doomsdayBoard` event's data, and an update's (with `update`). */
export interface Board {
  label: string;
  start?: number;
  end?: number;
  goals: Goal[];
  friends: BoardFriend[];
  withoutData: string[];
  crown?: { name: string; at?: number };
  /** Asked of the site (2026-10-28); shown when it is sent. */
  yesterdayCrown?: string;
  update?: BoardUpdate;
}

export interface BoardUpdate {
  boardEvent: number;
  messageId?: string;
  final: boolean;
  summary?: {
    goalsDone?: number;
    hunt?: { name: string; at?: number };
    longestStreak?: { name: string; days: number };
  };
}

/** The daily slots in board order: 3 PvE dailies, the Hunt and the Skirmish. */
export const DAILY_SLOTS = ["pve1", "pve2", "pve3", "hunt", "skirmish"] as const;
/** The weekly slots: 3 PvE weeklies and the Weekly bounty. */
export const WEEKLY_SLOTS = ["week1", "week2", "week3", "bounty"] as const;

/** "My goals" on the board: answered like `/doomsday` (BOT-16), only for the presser. */
export const MY_GOALS = "doomsday:mine";

/** The boxes: the bot's own emoji (BOT-15, synced with the class icons), or plain characters until they are there. */
export interface Boxes {
  pve: string;
  pvp: string;
  open: string;
}

export const PLAIN_BOXES: Boxes = { pve: "✅", pvp: "✅", open: "▢" };

export function boxes(icons: ClassIcons): Boxes {
  const { BOX_PVE: pve, BOX_PVP: pvp, BOX_OPEN: open } = icons;
  return pve !== undefined && pvp !== undefined && open !== undefined ? { pve, pvp, open } : PLAIN_BOXES;
}

// --- reading ---------------------------------------------------------------------------------------------------

export function readPoints(value: unknown): Points | undefined {
  if (!isObject(value)) return undefined;
  const pve = count(value.pve);
  if (pve === undefined) return undefined;
  return { pve, pvp: count(value.pvp) ?? null };
}

export function readGoal(value: unknown): Goal | undefined {
  if (!isObject(value)) return undefined;
  const slot = text(value.slot);
  const title = text(value.title);
  const track = value.track === "pve" || value.track === "pvp" ? value.track : undefined;
  if (slot === undefined || title === undefined || track === undefined) return undefined;
  return { slot, id: text(value.id) ?? slot, title, track, ...opt("points", count(value.points)) };
}

export function readFriendGoal(value: unknown): FriendGoal | undefined {
  if (!isObject(value)) return undefined;
  const slot = text(value.slot);
  if (slot === undefined) return undefined;
  const swapped = isObject(value.swappedFrom) ? text(value.swappedFrom.title) : undefined;
  const progress = isObject(value.progress) ? value.progress : undefined;
  const have = count(progress?.have);
  const need = count(progress?.need);
  return {
    slot,
    ...opt("id", text(value.id)),
    done: value.done === true,
    ...opt("at", value.done === true ? time(value.at) : undefined),
    ...(swapped !== undefined
      ? { swappedFrom: { title: swapped, ...opt("id", text((value.swappedFrom as Record<string, unknown>).id)) } }
      : {}),
    ...(have !== undefined && need !== undefined && need > 0 ? { progress: { have, need } } : {}),
  };
}

function readFriend(value: unknown): BoardFriend | undefined {
  if (!isObject(value)) return undefined;
  const name = text(value.name);
  if (name === undefined) return undefined;
  return {
    name,
    goals: (Array.isArray(value.goals) ? value.goals : []).flatMap((g) => readFriendGoal(g) ?? []),
    ...opt("doneCount", count(value.doneCount)),
    crossedOut: value.crossedOut === true,
    ...opt("today", readPoints(value.today)),
    ...opt("week", readPoints(value.week)),
    ...opt("streak", count(value.streak)),
    ...opt("best", count(value.best)),
    pvpVirgin: value.pvpVirgin === true,
  };
}

/** A `doomsdayBoard` or `doomsdayBoardUpdate` event's data; undefined without a label or goals. */
export function readBoard(data: unknown, isUpdate = false): Board | undefined {
  if (!isObject(data)) return undefined;
  const label = text(data.label);
  const goals = (Array.isArray(data.goals) ? data.goals : []).flatMap((g) => readGoal(g) ?? []);
  if (label === undefined || goals.length === 0) return undefined;
  const crownName = isObject(data.crown) ? text(data.crown.name) : undefined;
  const board: Board = {
    label,
    ...opt("start", time(data.start)),
    ...opt("end", time(data.end)),
    goals,
    friends: (Array.isArray(data.friends) ? data.friends : []).flatMap((f) => readFriend(f) ?? []),
    withoutData: names(data.withoutData),
    ...(crownName !== undefined
      ? { crown: { name: crownName, ...opt("at", time((data.crown as Record<string, unknown>).at)) } }
      : {}),
    ...opt("yesterdayCrown", isObject(data.yesterdayCrown) ? text(data.yesterdayCrown.name) : undefined),
  };
  if (!isUpdate) return board;
  const boardEvent = count(data.boardEvent);
  if (boardEvent === undefined || boardEvent === 0) return undefined;
  const messageId =
    typeof data.messageId === "string" && /^\d{1,20}$/.test(data.messageId) ? data.messageId : undefined;
  const s = data.final === true && isObject(data.summary) ? data.summary : undefined;
  const hunt = s && isObject(s.hunt) ? text(s.hunt.name) : undefined;
  const streakName = s && isObject(s.longestStreak) ? text(s.longestStreak.name) : undefined;
  const streakDays = s && isObject(s.longestStreak) ? count(s.longestStreak.days) : undefined;
  board.update = {
    boardEvent,
    ...opt("messageId", messageId),
    final: data.final === true,
    ...(s !== undefined
      ? {
          summary: {
            ...opt("goalsDone", count(s.goalsDone)),
            ...(hunt !== undefined
              ? { hunt: { name: hunt, ...opt("at", time((s.hunt as Record<string, unknown>).at)) } }
              : {}),
            ...(streakName !== undefined && streakDays !== undefined
              ? { longestStreak: { name: streakName, days: streakDays } }
              : {}),
          },
        }
      : {}),
  };
  return board;
}

// --- the daily board (BOT-15) ----------------------------------------------------------------------------------

/** Discord's timestamp markup, shown in each reader's own time zone. */
const at = (seconds: number, style: "t" | "R") => `<t:${seconds}:${style}>`;

/** "PvE 15 · PvP 11"; a PvP Virgin only "PvE 15". Never one sum. */
export function pointsText(points: Points): string {
  return `PvE ${thousands(points.pve)}${points.pvp === null ? "" : ` · PvP ${thousands(points.pvp)}`}`;
}

/** "PvE dailies · 5 each" with the titles, then the PvP goals and the Duel slot. */
function goalLines(goals: readonly Goal[]): string[] {
  const lines: string[] = [];
  for (const track of ["pve", "pvp"] as const) {
    const these = goals.filter((g) => g.track === track);
    if (these.length === 0) continue;
    const points = [...new Set(these.map((g) => g.points))];
    const each = points.length === 1 && points[0] !== undefined ? ` · ${points[0]} each` : "";
    lines.push(`**${track === "pve" ? "PvE dailies" : "PvP"}${each}**`);
    const titles = these.map((g) => escapeMarkdown(g.title));
    if (track === "pvp") titles.push("plus your first duel with each friend");
    lines.push(titles.join(" · "));
  }
  return lines;
}

/** One friend's row: the name (struck through when the 3 PvE dailies are done), the crown, a box per goal. */
function boardRow(board: Board, friend: BoardFriend, b: Boxes): string {
  const daily = board.goals.filter((g) => (DAILY_SLOTS as readonly string[]).includes(g.slot));
  // A PvP Virgin's row has the PvE boxes only (board `bot-doomsday-daily`).
  const columns = friend.pvpVirgin ? daily.filter((g) => g.track === "pve") : daily;
  const state = (g: Goal) => friend.goals.find((fg) => fg.slot === g.slot);
  const box = (g: Goal) => (state(g)?.done ? (g.track === "pve" ? b.pve : b.pvp) : b.open);
  const pve = columns
    .filter((g) => g.track === "pve")
    .map(box)
    .join("");
  const pvp = columns
    .filter((g) => g.track === "pvp")
    .map(box)
    .join("");
  const name = `**${escapeMarkdown(friend.name)}**`;
  const head = [
    friend.crossedOut ? `~~${name}~~` : name,
    board.crown?.name === friend.name ? " 👑" : "",
    friend.pvpVirgin ? " · PvP Virgin" : "",
  ].join("");
  const done = friend.doneCount ?? columns.filter((g) => state(g)?.done).length;
  const points = friend.today;
  const any = done > 0 || (points !== undefined && (points.pve > 0 || (points.pvp ?? 0) > 0));
  let tail = "";
  if (friend.crossedOut) {
    const finished = Math.max(
      ...columns.filter((g) => g.track === "pve").map((g) => state(g)?.at ?? 0),
      board.crown?.name === friend.name ? (board.crown.at ?? 0) : 0,
    );
    tail = finished > 0 ? `all dailies ${at(finished, "t")}` : "all dailies";
  } else if (any) {
    tail = `${done} / ${columns.length}`;
  } else if (board.update !== undefined) {
    tail = "—";
  }
  if (any && points !== undefined) tail += ` · ${pointsText(points)}`;
  return `${head} ${[pve, pvp].filter(Boolean).join(" ")}${tail ? ` · ${tail}` : ""}`;
}

/** The URL of the Doomsday page for links: the site's setting, else `/doomsday` on the site. */
export function boardUrl(siteUrl: string, settingUrl: string | undefined): string {
  return settingUrl ?? `${siteUrl}/doomsday`;
}

/**
 * The daily board post (board `bot-doomsday-daily`): "Doomsday · Tue 28 Oct", the day's goals, a row per friend with
 * Doomsday data, "resets in …", and the buttons "Open the board ↗" and "My goals". An update (`board.update`) is the
 * same post edited; the final one says "final" with the day's summary and has no buttons. `eventId`: the
 * `doomsdayBoard` event, whose marker is on the title link so a restart finds the post.
 */
export function boardMessage(
  board: Board,
  eventId: number,
  siteUrl: string,
  pageUrl: string,
  b: Boxes = PLAIN_BOXES,
): MessageContent {
  const final = board.update?.final === true;
  const lines = [...goalLines(board.goals), ""];
  lines.push(...board.friends.map((f) => boardRow(board, f, b)));
  if (board.friends.length === 0) lines.push("Nobody has Doomsday data yet.");
  const notes: string[] = [];
  if (board.withoutData.length > 0) {
    notes.push(`No Doomsday data yet: ${board.withoutData.map(escapeMarkdown).join(", ")}.`);
  }
  if (board.yesterdayCrown !== undefined && !final) {
    notes.push(`Yesterday's crown: ${escapeMarkdown(board.yesterdayCrown)}.`);
  }
  const summary = board.update?.summary;
  if (final && summary !== undefined) {
    const parts = [
      summary.goalsDone !== undefined ? `${summary.goalsDone} ${summary.goalsDone === 1 ? "goal" : "goals"} done` : "",
      summary.hunt !== undefined
        ? `${escapeMarkdown(summary.hunt.name)} won the Hunt race${summary.hunt.at ? ` at ${at(summary.hunt.at, "t")}` : ""}`
        : "",
      summary.longestStreak !== undefined
        ? `longest streak ${escapeMarkdown(summary.longestStreak.name)}, ${summary.longestStreak.days} ${summary.longestStreak.days === 1 ? "day" : "days"}`
        : "",
    ].filter(Boolean);
    if (parts.length > 0) notes.push(`Day over: ${parts.join(" · ")}.`);
  }
  if (notes.length > 0) lines.push("", ...notes);
  lines.push("", "-# Columns: 3 PvE dailies, then Hunt and Skirmish · names are crossed out when all dailies are done");
  if (board.end !== undefined) {
    lines.push(
      final
        ? `-# final · new goals ${at(board.end, "R")}`
        : `-# resets ${at(board.end, "R")} · this message updates during the day`,
    );
  }
  const embed: Embed = {
    title: `Doomsday · ${board.label}${final ? " · final" : ""}`,
    url: `${siteUrl}/doomsday${marker(eventId)}`,
    description: clip(lines.join("\n"), 4096),
    color: GOLD,
  };
  return {
    embeds: [embed],
    allowed_mentions: { parse: [] },
    components: final
      ? []
      : [
          {
            type: 1,
            components: [
              { type: 2, style: 5, label: "Open the board ↗", url: pageUrl },
              { type: 2, style: 2, label: "My goals", custom_id: MY_GOALS },
            ],
          },
        ],
  };
}

// --- the reply (BOT-15 "My goals", BOT-16 `/doomsday`) ---------------------------------------------------------

export interface LookupGoal extends Goal, Omit<FriendGoal, "slot" | "id"> {}

export interface DoomsdayLookup {
  friend: string;
  noData: boolean;
  label?: string;
  resetAt?: number;
  weekResetAt?: number;
  goals: LookupGoal[];
  duels: { name: string; won: boolean; disputed: boolean; points?: number }[];
  today?: Points;
  week?: Points;
  allTime?: Points;
  place: { pve?: { place: number; of: number }; pvp?: { place: number; of: number } };
  streak?: number;
  best?: number;
  pvpVirgin: boolean;
  crossedOut: boolean;
  asker?: string;
}

/** The `doomsday` look-up's answer; undefined without a friend. */
export function readLookup(body: unknown): DoomsdayLookup | undefined {
  if (!isObject(body)) return undefined;
  const friend = text(body.friend);
  if (friend === undefined) return undefined;
  const place = isObject(body.place) ? body.place : {};
  const rank = (value: unknown) => {
    const p = isObject(value) ? count(value.place) : undefined;
    const of = isObject(value) ? count(value.of) : undefined;
    return p !== undefined && of !== undefined && p > 0 ? { place: p, of } : undefined;
  };
  return {
    friend,
    noData: body.noData === true,
    ...opt("label", text(body.label)),
    ...opt("resetAt", time(body.resetAt)),
    ...opt("weekResetAt", time(body.weekResetAt)),
    goals: (Array.isArray(body.goals) ? body.goals : []).flatMap((g): LookupGoal[] => {
      const goal = readGoal(g);
      const state = readFriendGoal(g);
      if (goal === undefined || state === undefined) return [];
      // The goal's own slot and id win over the state's.
      return [{ ...state, ...goal }];
    }),
    duels: (Array.isArray(body.duels) ? body.duels : []).flatMap((d) => {
      const name = isObject(d) ? text(d.name) : undefined;
      if (name === undefined || !isObject(d)) return [];
      return [{ name, won: d.won === true, disputed: d.disputed === true, ...opt("points", count(d.points)) }];
    }),
    ...opt("today", readPoints(body.today)),
    ...opt("week", readPoints(body.week)),
    ...opt("allTime", readPoints(body.allTime)),
    place: { ...opt("pve", rank(place.pve)), ...opt("pvp", rank(place.pvp)) },
    ...opt("streak", count(body.streak)),
    ...opt("best", count(body.best)),
    pvpVirgin: body.pvpVirgin === true,
    crossedOut: body.crossedOut === true,
    ...opt("asker", text(body.asker)),
  };
}

function goalRow(goal: LookupGoal, b: Boxes): string {
  const box = goal.done ? (goal.track === "pve" ? b.pve : b.pvp) : b.open;
  const parts = [`${box} ${escapeMarkdown(goal.title)}`];
  if (!goal.done && goal.progress !== undefined) parts.push(`${goal.progress.have}/${goal.progress.need}`);
  if (goal.done && goal.at !== undefined) parts.push(at(goal.at, "t"));
  if (goal.swappedFrom !== undefined) parts.push(`instead of ${escapeMarkdown(goal.swappedFrom.title)}`);
  return parts.join(" · ");
}

/**
 * The ephemeral Doomsday reply (board `bot-doomsday-weekly`, `/doomsday`): the goals today with progress, this week's,
 * the duels, this week and all time per track, the place on both ladders, the streak and "resets in …". `own`: the
 * asker's own day ("Your Doomsday"), else the friend's.
 */
export function doomsdayReply(
  look: DoomsdayLookup,
  own: boolean,
  pageUrl: string,
  b: Boxes = PLAIN_BOXES,
): MessageContent {
  const who = escapeMarkdown(look.friend);
  const title = own ? "Your Doomsday" : `${who}'s Doomsday`;
  if (look.noData) {
    return reply({
      title,
      description: `${own ? "You have" : `${who} has`} no Doomsday data yet. It comes with the addon's next upload.`,
      color: GOLD,
    });
  }
  const today = look.goals.filter((g) => (DAILY_SLOTS as readonly string[]).includes(g.slot));
  const week = look.goals.filter((g) => (WEEKLY_SLOTS as readonly string[]).includes(g.slot));
  const done = (goals: readonly LookupGoal[]) => goals.filter((g) => g.done).length;
  const lines: string[] = [];
  if (today.length > 0) {
    lines.push(`**${own ? "Your goals" : "Goals"} today · ${done(today)} of ${today.length}**`);
    lines.push(...today.map((g) => goalRow(g, b)));
  }
  if (look.duels.length > 0) {
    const duel = (d: DoomsdayLookup["duels"][number]) =>
      `${escapeMarkdown(d.name)} ${d.disputed ? "disputed" : d.won ? "won" : "lost"}${d.points !== undefined && !d.disputed ? ` (${d.points})` : ""}`;
    lines.push(`Duels today: ${look.duels.map(duel).join(" · ")}`);
  }
  if (week.length > 0) {
    lines.push("", `**This week's goals · ${done(week)} of ${week.length}**`, ...week.map((g) => goalRow(g, b)));
  }
  const facts: string[] = [];
  if (look.week !== undefined) facts.push(`**This week** ${pointsText(look.week)}`);
  if (look.allTime !== undefined) facts.push(`**All time** ${pointsText(look.allTime)}`);
  const ladder = [
    look.place.pve !== undefined ? `PvE ${ordinal(look.place.pve.place)} of ${look.place.pve.of}` : undefined,
    look.pvpVirgin
      ? "PvP not ranked (PvP Virgin)"
      : look.place.pvp !== undefined
        ? `PvP ${ordinal(look.place.pvp.place)} of ${look.place.pvp.of}`
        : undefined,
  ].filter(Boolean);
  if (ladder.length > 0) facts.push(`**Ladders** ${ladder.join(" · ")}`);
  if (look.streak !== undefined) {
    facts.push(
      `**Streak** ${look.streak} ${look.streak === 1 ? "day" : "days"}${look.best !== undefined ? ` · best ${look.best}` : ""}`,
    );
  }
  if (facts.length > 0) lines.push("", ...facts);
  const resets = [
    look.resetAt !== undefined ? `resets ${at(look.resetAt, "R")}` : undefined,
    look.weekResetAt !== undefined ? `the week ${at(look.weekResetAt, "R")}` : undefined,
  ].filter(Boolean);
  if (resets.length > 0) lines.push(`-# ${resets.join(" · ")}`);
  return reply({
    title,
    url: pageUrl,
    description: clip(lines.join("\n") || "No goals today.", 4096),
    color: GOLD,
  });
}

/**
 * `/doomsday` and "My goals" when the site has no answer: 404 (a site without Doomsday, or before any Doomsday data)
 * is "Doomsday isn't available yet"; anything else means the site is away.
 */
export function notAvailableMessage(status?: number): MessageContent {
  return status === 404
    ? reply({ title: "Doomsday isn't available yet", description: "Try again after the next reset.", color: GOLD })
    : reply({ title: "The site isn't answering", description: "Try again in a moment.", color: GOLD });
}

function reply(embed: Embed): MessageContent {
  return { embeds: [embed], allowed_mentions: { parse: [] } };
}
