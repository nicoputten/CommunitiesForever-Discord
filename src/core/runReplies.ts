// The answers to the run commands and buttons (BOT-04, board `bot-commands-runs`): `/plan`'s confirmation and the
// time-passed reply, "This run isn't yours", the character and role picker, what an answer did, `/runs` and the site's
// refusals. Only for the asker. Pure: the site's answers and the time come in as arguments.
import { type ClassIcons, NO_ICONS, icon, optionEmoji } from "./classIcons.js";
import { type Component, type MessageContent, GOLD, escapeMarkdown } from "./milestones.js";
import { type Ask, type Run, type SlotRole, buttonOf, pageOf, runButton, runUrl } from "./runs.js";
import { isObject, opt, text } from "./read.js";

const ROLES: readonly SlotRole[] = ["tank", "healer", "damage"];
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

function reply(
  title: string,
  description: string,
  buttons: Component[] = [],
  selects: Component[] = [],
): MessageContent {
  return {
    embeds: [{ title, description, color: GOLD }],
    allowed_mentions: { parse: [] },
    components: [
      ...selects.map((s) => ({ type: 1 as const, components: [s] })),
      ...(buttons.length > 0 ? [{ type: 1 as const, components: buttons.slice(0, 5) }] : []),
    ],
  };
}

const openRun = (siteUrl: string, run: Run): Component => ({
  type: 2,
  style: 5,
  label: run.kind === "ask" ? "Open runs ↗" : "Open run ↗",
  url: pageOf(siteUrl, run),
});

// --- the site's answers ----------------------------------------------------------------------------------------------

/** A character the asker may pick (BOT-API.md `runs/<id>/characters`, and `plan`'s `lead`). */
export interface PickCharacter {
  guid: string;
  name: string;
  level?: number;
  classFile?: string;
  /** The roles the class can play (WEB-47); all three when the site doesn't say. */
  roles: SlotRole[];
  /** The character's own role. */
  role?: SlotRole;
  /** "fits", "+3 over", "carry · +12", "4 below". */
  fit?: string;
  fitKind?: string;
}

export function readPickCharacters(body: unknown): PickCharacter[] {
  const list = isObject(body) && Array.isArray(body.characters) ? body.characters : [];
  return list.flatMap((c) => {
    const read = readPickCharacter(c);
    return read === undefined ? [] : [read];
  });
}

export function readPickCharacter(c: unknown): PickCharacter | undefined {
  if (!isObject(c) || typeof c.guid !== "string" || c.guid === "") return undefined;
  const roles = Array.isArray(c.roles) ? ROLES.filter((r) => (c.roles as unknown[]).includes(r)) : [];
  const fit = isObject(c.fit) ? c.fit : undefined;
  // The addon's roles (`characters`: tank / heal / dps) or a slot role (`plan`'s lead).
  const role: SlotRole | undefined =
    c.role === "tank"
      ? "tank"
      : c.role === "heal" || c.role === "healer"
        ? "healer"
        : c.role === "dps" || c.role === "damage"
          ? "damage"
          : undefined;
  return {
    guid: c.guid,
    name: text(c.name) ?? c.guid,
    ...opt("level", typeof c.level === "number" ? c.level : undefined),
    ...opt("classFile", text(c.classFile)),
    roles: roles.length > 0 ? roles : [...ROLES],
    ...opt("role", role),
    ...opt("fit", typeof c.fit === "string" ? text(c.fit) : text(fit?.label)),
    ...opt("fitKind", text(c.fitKind) ?? text(fit?.kind)),
  };
}

/** `/plan`'s choices (BOT-API.md `plan`). */
export interface PlanChoices {
  timeZone?: string;
  admin: boolean;
  days: { offset: number; label: string }[];
  dungeons: { id: string; name: string; min?: number; max?: number; lead?: PickCharacter }[];
}

export function readPlanChoices(body: unknown): PlanChoices {
  if (!isObject(body)) return { admin: false, days: [], dungeons: [] };
  const days = (Array.isArray(body.days) ? body.days : []).flatMap((d) =>
    isObject(d) && Number.isInteger(d.offset) && text(d.label) !== undefined
      ? [{ offset: d.offset as number, label: text(d.label) as string }]
      : [],
  );
  const dungeons = (Array.isArray(body.dungeons) ? body.dungeons : []).flatMap((d) => {
    if (!isObject(d) || text(d.id) === undefined || text(d.name) === undefined) return [];
    const levels = isObject(d.typicalLevels) ? d.typicalLevels : {};
    const lead = readPickCharacter(d.lead);
    return [
      {
        id: text(d.id) as string,
        name: text(d.name) as string,
        ...opt("min", typeof levels.min === "number" ? levels.min : undefined),
        ...opt("max", typeof levels.max === "number" ? levels.max : undefined),
        ...opt("lead", lead),
      },
    ];
  });
  return { ...opt("timeZone", text(body.timeZone)), admin: body.admin === true, days, dungeons };
}

/** What the site stored for an answer (BOT-API.md `runs/<id>/answers`). */
export interface Stored {
  answer: "in" | "maybe" | "cant";
  role: SlotRole;
  reserve: boolean;
}

export function readStored(body: unknown): Stored | undefined {
  const s = isObject(body) && isObject(body.stored) ? body.stored : undefined;
  if (s === undefined || (s.answer !== "in" && s.answer !== "maybe" && s.answer !== "cant")) return undefined;
  return {
    answer: s.answer,
    role: s.role === "tank" || s.role === "healer" ? s.role : "damage",
    reserve: s.reserve === true || s.waitlisted === true,
  };
}

// --- autocomplete ----------------------------------------------------------------------------------------------------

/** `/plan`'s dungeon choices: "Scarlet Monastery: Armory · 32–42 · fits Ves Doombringer". */
export function dungeonChoices(choices: PlanChoices, typed: string): { name: string; value: string }[] {
  const wanted = typed.trim().toLowerCase();
  return choices.dungeons
    .filter((d) => d.name.toLowerCase().includes(wanted))
    .map((d) => {
      const range = d.min !== undefined && d.max !== undefined ? ` · ${d.min}–${d.max}` : "";
      const lead = d.lead;
      const who =
        lead === undefined
          ? ""
          : lead.fitKind === "fits"
            ? ` · fits ${lead.name}`
            : ` · ${lead.name} ${lead.fit ?? ""}`;
      return { name: `${d.name}${range}${who}`.trim(), value: d.id };
    });
}

/** `/plan`'s day choices in the asker's own calendar: Today, Tomorrow, then weekdays. */
export function dayChoices(choices: PlanChoices, typed: string): { name: string; value: string }[] {
  const wanted = typed.trim().toLowerCase();
  const days =
    choices.days.length > 0
      ? choices.days
      : Array.from({ length: 7 }, (_, offset) => ({ offset, label: offset === 0 ? "Today" : `In ${offset} days` }));
  return days
    .map((d) => ({
      name: d.offset === 0 ? d.label : d.offset === 1 ? `Tomorrow · ${d.label}` : d.label,
      value: String(d.offset),
    }))
    .filter((d) => d.name.toLowerCase().includes(wanted));
}

/** The day picked: an autocomplete value (an offset), or a typed "today", "tomorrow" or weekday. */
export function dayOffset(choices: PlanChoices, value: string): number | undefined {
  const v = value.trim().toLowerCase();
  if (/^[0-6]$/.test(v)) return Number(v);
  if (v === "today") return 0;
  if (v === "tomorrow") return 1;
  const found = choices.days.find((d) => d.label.toLowerCase().includes(v));
  return found?.offset;
}

/** `/run`'s run choices: "Scarlet Monastery: Armory · Sat 31 Oct 20:30", the asker's own (the admin's: all). */
export function runChoices(
  runs: readonly Run[],
  userId: string,
  admin: boolean,
  timeZone: string | undefined,
  typed: string,
): { name: string; value: string }[] {
  const wanted = typed.trim().toLowerCase();
  return runs
    .filter((r) => admin || r.organiser.discordId === userId)
    .map((r) => ({ name: `${r.dungeon.name} · ${localTime(r.startsAt, timeZone)}`, value: String(r.id) }))
    .filter((c) => c.name.toLowerCase().includes(wanted));
}

/** "Sat 31 Oct 20:30" in a time zone (UTC when unknown). */
export function localTime(at: number, timeZone: string | undefined): string {
  const parts = zoned(at, timeZone);
  return `${parts.weekday} ${parts.day} ${parts.month} ${parts.hour}:${parts.minute}`;
}

/** The date ("2026-10-31") and time ("20:30") of a moment in a time zone, for `/run edit` keeping one of them. */
export function localDateTime(at: number, timeZone: string | undefined): { date: string; time: string } {
  const p = zoned(at, timeZone);
  return { date: `${p.year}-${p.monthNumber}-${p.day.padStart(2, "0")}`, time: `${p.hour}:${p.minute}` };
}

function zoned(at: number, timeZone: string | undefined) {
  let format: Intl.DateTimeFormat;
  const options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  };
  try {
    format = new Intl.DateTimeFormat("en-GB", { ...options, timeZone: timeZone ?? "UTC" });
  } catch {
    format = new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" });
  }
  const parts = Object.fromEntries(format.formatToParts(new Date(at * 1000)).map((p) => [p.type, p.value]));
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return {
    weekday: parts.weekday ?? "",
    day: parts.day ?? "",
    month: parts.month ?? "",
    monthNumber: String(months.indexOf(parts.month ?? "") + 1).padStart(2, "0"),
    year: parts.year ?? "",
    hour: parts.hour ?? "",
    minute: parts.minute ?? "",
  };
}

// --- /plan -----------------------------------------------------------------------------------------------------------

const roleText = (c: PickCharacter, role?: SlotRole) =>
  [c.level, role ?? c.role].filter((x) => x !== undefined).join(", ");

/** `/plan`'s confirmation, with "Lead with another character" when there are others to pick. */
export function plannedMessage(
  run: Run,
  lead: PickCharacter | undefined,
  others: readonly PickCharacter[],
  timeZone: string | undefined,
  runsChannel: string | undefined,
  siteUrl: string,
  icons: ClassIcons = NO_ICONS,
): MessageContent {
  const leads =
    lead === undefined
      ? "None of your characters can join, so you organise without one."
      : `You lead as ${icon(icons, lead.classFile)}${escapeMarkdown(lead.name)} (${roleText(lead)}).`;
  const where = runsChannel !== undefined ? `Posted in <#${runsChannel}>.` : "Posted in the runs channel.";
  const zone =
    timeZone !== undefined
      ? `\n-# Read in your time zone from the site: ${timeZone}. Everyone else sees it in theirs.`
      : "";
  return reply(
    `Planned · ${run.dungeon.name}`,
    `<t:${run.startsAt}:f> · <t:${run.startsAt}:R>\n${leads} ${where}${zone}`,
    [openRun(siteUrl, run)],
    others.length > 0 ? [characterSelect(run, "lead", "Lead with another character", others, icons)] : [],
  );
}

/** The time already passed: "Tomorrow 14:00" (when there is a tomorrow in /plan's week) or another time. */
export function timePassedMessage(dayLabel: string, time: string, timeZone: string | undefined, againId?: string) {
  const zone = timeZone !== undefined ? ` in your time (${timeZone})` : "";
  return reply(
    "That time has already passed",
    `${escapeMarkdown(dayLabel)} ${time} has passed${zone}. Pick a later time or another day.`,
    againId !== undefined ? [{ type: 2, style: 1, label: `Tomorrow ${time}`, custom_id: againId }] : [],
  );
}

// --- /ask (BOT-12) ---------------------------------------------------------------------------------------------------

/** `/ask`'s confirmation (board `bot-commands-runs`): where it went, when it ends, and that Discord can't whisper. */
export function askedMessage(
  ask: Ask,
  runsChannel: string | undefined,
  siteUrl: string,
  icons: ClassIcons = NO_ICONS,
): MessageContent {
  const where = runsChannel !== undefined ? `Posted in <#${runsChannel}>.` : "Posted in the runs channel.";
  const ends = ask.expiresAt !== undefined ? ` It expires <t:${ask.expiresAt}:R>.` : " It expires in 10 minutes.";
  const mine = ask.answers.find((a) => a.answer === "in" && a.discordId === ask.from.discordId);
  const as =
    mine?.character !== undefined
      ? `\nYou're in as ${icon(icons, mine.classFile)}${escapeMarkdown(mine.character)} (${mine.role}).`
      : "";
  return reply(
    `Asked · ${ask.dungeon}, now`,
    `${where}${ends}${as}\n-# Discord can't whisper anyone in game. For the in-game whisper to online friends, ask from the Dungeons tab.`,
    [{ type: 2, style: 5, label: "Open runs ↗", url: `${siteUrl}/runs` }],
  );
}

// --- /run edit and /run cancel ---------------------------------------------------------------------------------------

/** Someone else's run (board `bot-commands-runs`): only its organiser or the admin may change it. */
export function notYoursMessage(run: Run | undefined, runId: number): MessageContent {
  const who =
    run?.organiser.name !== undefined ? `${escapeMarkdown(run.organiser.name)}, who planned it,` : "its organiser";
  return reply(
    "This run isn't yours",
    `Only ${who} or an admin can change or cancel it. Can't make it? Answer Can't instead.`,
    [{ type: 2, style: 4, label: "Answer Can't", custom_id: runButton(runId, "cant") }],
  );
}

export function editedMessage(run: Run, moved: boolean, siteUrl: string): MessageContent {
  const keep = run.answers.filter((a) => a.answer !== "cant" && a.discordId !== run.organiser.discordId);
  const names = keep.map((a) => escapeMarkdown(a.character ?? a.name ?? "Someone"));
  const kept =
    names.length === 0
      ? ""
      : ` ${names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`} keep${names.length === 1 ? "s" : ""} their answers${moved ? " and get a quiet notice" : ""}.`;
  return reply(
    `${moved ? "Moved" : "Changed"} · ${run.dungeon.name}`,
    `${moved ? `Now <t:${run.startsAt}:f> (<t:${run.startsAt}:R>). ` : ""}The post is updated.${kept}`,
    [{ type: 2, style: 4, label: "Cancel run", custom_id: runButton(run.id, "cancel") }, openRun(siteUrl, run)],
  );
}

export function cancelledMessage(run: Run, siteUrl: string): MessageContent {
  return reply(
    `Cancelled · ${run.dungeon.name}`,
    "The post shows it cancelled; everyone who answered I'm in or Maybe gets a quiet notice.",
    [openRun(siteUrl, run)],
  );
}

// --- answering from the post ----------------------------------------------------------------------------------------

function characterSelect(
  run: Run,
  what: string,
  placeholder: string,
  chars: readonly PickCharacter[],
  icons: ClassIcons,
  selected?: string,
): Component {
  return {
    type: 3,
    custom_id: buttonOf(run, what),
    placeholder,
    options: chars.slice(0, 25).map((c) => ({
      label:
        `${c.name}${c.level !== undefined ? ` · ${c.level}` : ""}${c.classFile && CLASS_NAMES[c.classFile] ? ` ${CLASS_NAMES[c.classFile]}` : ""}`.slice(
          0,
          100,
        ),
      value: c.guid,
      ...(c.guid === selected ? { default: true } : {}),
      ...(optionEmoji(icons, c.classFile) !== undefined ? { emoji: optionEmoji(icons, c.classFile) } : {}),
      description: [c.roles.map(capital).join(" / "), fitText(c)].filter(Boolean).join(" · ").slice(0, 100),
    })),
  };
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** What a pick's fit says: "fits", "+3 over", "8 below · tough" (WEB-52: every character may say I'm in). */
function fitText(c: PickCharacter): string | undefined {
  if (c.fit === undefined) return undefined;
  return c.fitKind === "low" || c.fitKind === "tooLow" ? `${c.fit} · tough` : c.fit;
}

/**
 * I'm in (BOT-13, board `bot-posts-runs`, Runs v2): the asker's characters with their fit tag, the best one (the
 * site's first) preselected with the roles its class can play; another pick swaps the role buttons.
 */
export function pickerMessage(
  run: Run,
  chars: readonly PickCharacter[],
  siteUrl: string,
  icons: ClassIcons = NO_ICONS,
  selected: string | undefined = chars[0]?.guid,
): MessageContent {
  const c = chars.find((x) => x.guid === selected) ?? chars[0];
  if (c === undefined) {
    return reply(
      `None of your characters are known for ${run.dungeon.name}`,
      "The site knows your characters after your next upload. Maybe and Can't always go.",
      [{ type: 2, style: 2, label: "Maybe", custom_id: buttonOf(run, "maybe") }, openRun(siteUrl, run)],
    );
  }
  const fit = fitText(c);
  return reply(
    `Which character joins ${run.dungeon.name}?`,
    `${icon(icons, c.classFile)}**${escapeMarkdown(c.name)}**${fit ? ` · ${fit}` : ""}\nPick a role, or another character.`,
    c.roles.map((role) => ({
      type: 2 as const,
      style: role === c.role ? 1 : 2,
      label: capital(role),
      custom_id: buttonOf(run, `role:${c.guid}:${role}`),
    })),
    [characterSelect(run, "char", "Pick my character", chars, icons, c.guid)],
  );
}

/** What an answer did: "You're in as Lia Thornwhisper (healer)", reserve, Maybe, Can't, or the new lead. */
export function answeredMessage(
  run: Run,
  stored: Stored,
  character: string | undefined,
  lead = false,
  classFile?: string,
  icons: ClassIcons = NO_ICONS,
): MessageContent {
  const name = character !== undefined ? `${icon(icons, classFile)}${escapeMarkdown(character)}` : undefined;
  if (stored.answer === "maybe" && stored.reserve) {
    return reply(
      `Reserve · ${run.dungeon.name}`,
      `${capital(stored.role)} is full: you're reserve${name ? ` as ${name}` : ""} and move up first when a slot frees.`,
    );
  }
  if (stored.answer === "in") {
    return reply(
      lead ? `You lead · ${run.dungeon.name}` : `You're in · ${run.dungeon.name}`,
      `${lead ? "You lead" : "You're in"}${name ? ` as ${name}` : ""} (${stored.role}). The game shows it after the next sync.`,
    );
  }
  return reply(
    `${stored.answer === "maybe" ? "Maybe" : "Can't"} · ${run.dungeon.name}`,
    `You answered ${stored.answer === "maybe" ? "Maybe" : "Can't"}. The post is updated.`,
  );
}

/** The site's refusal of a run action, in words for people. */
export function refusalMessage(error: string | undefined, status: number | undefined): MessageContent {
  const texts: Record<string, string> = {
    closed: "This run has started or was cancelled: answers are closed.",
    unknown_run: "This run no longer exists.",
    out_of_range: "That character is outside the level range. Maybe and Can't still go.",
    role_not_for_class: "That character's class can't play that role.",
    role_full: "That role has no open slot left.",
    no_character: "I'm in needs a character: pick one.",
    not_your_character: "That character isn't yours.",
    lead_not_yours: "That character isn't yours.",
    lead_out_of_range: "That character is outside the level range.",
    invalid_time: "Give the time as 24-hour, like 20:30.",
    time_passed: "That time has already passed.",
    note_too_long: "The note is longer than 200 characters.",
    unknown_dungeon: "No such dungeon: pick one from the list.",
    already_cancelled: "This run was already cancelled.",
    expired: "This ask has expired: its 10 minutes are over.",
  };
  const known = error !== undefined ? texts[error] : undefined;
  if (known !== undefined) return reply("Not possible", known);
  return status === undefined || status >= 500
    ? reply("The site isn't answering", "Try again in a moment.")
    : reply("Not possible", "The site refused that.");
}

// --- /runs -----------------------------------------------------------------------------------------------------------

/** Upcoming runs this week with the asker's answer (board `bot-commands-runs`), only for them. */
export function runsListMessage(
  runs: readonly Run[],
  userId: string,
  now: number,
  siteUrl: string,
  siteHost: string,
  icons: ClassIcons = NO_ICONS,
): MessageContent {
  const week = runs.filter((r) => r.startsAt < now + 7 * 86400).sort((a, b) => a.startsAt - b.startsAt);
  if (week.length === 0) {
    return reply("No runs this week", `Plan one with /plan, or on [${siteHost}/runs ↗](${siteUrl}/runs).`);
  }
  const shown = week.slice(0, 10);
  const lines = shown.map((r) => {
    const mine = r.answers.find((a) => a.discordId === userId);
    const you =
      r.organiser.discordId === userId
        ? "You organise"
        : mine === undefined
          ? "You haven't answered"
          : mine.answer === "in"
            ? `You're in${mine.character ? ` as ${icon(icons, mine.classFile)}${escapeMarkdown(mine.character)}` : ""} (${mine.role})`
            : mine.answer === "maybe"
              ? mine.reserve
                ? "You're reserve"
                : "You answered Maybe"
              : "You answered Can't";
    return `**[${escapeMarkdown(r.dungeon.name)}](${runUrl(siteUrl, r.id)})** · <t:${r.startsAt}:f> · <t:${r.startsAt}:R>\n${you}`;
  });
  if (week.length > shown.length) lines.push(`and ${week.length - shown.length} more on ${siteHost}/runs`);
  return reply("Runs this week", lines.join("\n\n"));
}
