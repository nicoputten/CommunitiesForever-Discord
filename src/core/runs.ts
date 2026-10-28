// Planned runs (BOT-04, boards `bot-posts-runs` and `bot-commands-runs`): the site's run data read defensively (web
// repo docs/BOT-API.md "Run events"), the run post in every state, the reminder, Starting now, the ping, the ask from
// the game and the quiet notices. Pure: the time comes in as an argument; the site decides every game fact (who fits,
// who could fill a slot), the bot only formats it (CLAUDE.md rule 2).
import { type ClassIcons, NO_ICONS, icon } from "./classIcons.js";
import { type Component, type Embed, type MessageContent, GOLD, escapeMarkdown, marker } from "./milestones.js";
import { isSnowflake } from "./settings.js";

export type SlotRole = "tank" | "healer" | "damage";
export const SLOT_ROLES: readonly SlotRole[] = ["tank", "healer", "damage"];
/** Five slots: one tank, one healer, three damage (web WEB-40). */
export const SLOTS: Readonly<Record<SlotRole, number>> = { tank: 1, healer: 1, damage: 3 };

export interface Fit {
  kind?: string;
  /** "fits", "+3 over", "carry · +12", "4 below". */
  label?: string;
}

export interface RunPerson {
  /** The friend's display name (never a BattleTag). */
  name?: string;
  /** Only to mention them or send a notice; never shown (CLAUDE.md rule 5). */
  discordId?: string;
  character?: string;
  level?: number;
  classFile?: string;
}

export interface RunAnswer extends RunPerson {
  answer: "in" | "maybe" | "cant";
  role: SlotRole;
  /** I'm in for a full role: next in line (WEB-47 `reserve`, or `waitlisted` from older sites). */
  reserve: boolean;
  guid?: string;
  fit?: Fit;
}

export interface Candidate {
  name?: string;
  character?: string;
  level?: number;
  classFile?: string;
  fit?: Fit;
}

export interface CouldFill {
  role: SlotRole;
  characters: Candidate[];
  close: Candidate[];
}

export type RunState = "open" | "full" | "started" | "past" | "cancelled";

export interface Run {
  id: number;
  /** BOT-12: an ask shown through the run replies (its buttons are `ask:<id>:…`). */
  kind?: "ask";
  dungeon: { name: string; min?: number; max?: number };
  startsAt: number;
  note?: string;
  organiser: RunPerson;
  state?: RunState;
  open?: Record<SlotRole, number>;
  counts?: { in: number; maybe: number };
  outcome?: { kind: "done"; came?: number; signedUp?: number } | { kind: "didntHappen" };
  couldFill?: CouldFill[];
  answers: RunAnswer[];
}

const STATES: readonly RunState[] = ["open", "full", "started", "past", "cancelled"];

/** A run as the site sends it; undefined without an id, a dungeon name or a start. */
export function readRun(value: unknown): Run | undefined {
  if (!isObject(value) || !Number.isInteger(value.id) || !isObject(value.dungeon)) return undefined;
  const name = text(value.dungeon.name);
  const startsAt = number(value.startsAt);
  if (name === undefined || startsAt === undefined) return undefined;
  const levels = isObject(value.dungeon.typicalLevels) ? value.dungeon.typicalLevels : {};
  const open = isObject(value.open) ? value.open : undefined;
  const counts = isObject(value.counts) ? value.counts : undefined;
  const outcome = isObject(value.outcome) ? value.outcome : undefined;
  const state = STATES.find((s) => s === value.state);
  const note = text(value.note);
  return {
    id: value.id as number,
    dungeon: { name, ...optional("min", number(levels.min)), ...optional("max", number(levels.max)) },
    startsAt,
    ...optional("note", note),
    organiser: readPerson(value.organiser),
    ...optional("state", state),
    ...(open !== undefined
      ? { open: { tank: number(open.tank) ?? 0, healer: number(open.healer) ?? 0, damage: number(open.damage) ?? 0 } }
      : {}),
    ...(counts !== undefined ? { counts: { in: number(counts.in) ?? 0, maybe: number(counts.maybe) ?? 0 } } : {}),
    ...(outcome?.kind === "done"
      ? {
          outcome: {
            kind: "done" as const,
            ...optional("came", number(outcome.came)),
            ...optional("signedUp", number(outcome.signedUp)),
          },
        }
      : outcome?.kind === "didntHappen"
        ? { outcome: { kind: "didntHappen" as const } }
        : {}),
    ...(Array.isArray(value.couldFill) ? { couldFill: value.couldFill.flatMap(readCouldFill) } : {}),
    answers: (Array.isArray(value.answers) ? value.answers : []).flatMap(readAnswer),
  };
}

function readPerson(value: unknown): RunPerson {
  if (!isObject(value)) return {};
  return {
    ...optional("name", text(value.name)),
    ...optional("discordId", isSnowflake(value.discordId) ? (value.discordId as string) : undefined),
    ...optional("character", text(value.character)),
    ...optional("level", number(value.level)),
    ...optional("classFile", text(value.classFile)),
  };
}

function readFit(value: unknown): Fit | undefined {
  if (!isObject(value)) return undefined;
  return { ...optional("kind", text(value.kind)), ...optional("label", text(value.label)) };
}

function readAnswer(value: unknown): RunAnswer[] {
  if (!isObject(value)) return [];
  const answer =
    value.answer === "in" || value.answer === "maybe" || value.answer === "cant" ? value.answer : undefined;
  if (answer === undefined) return [];
  return [
    {
      ...readPerson(value),
      answer,
      role: slotRole(value.role),
      reserve: value.reserve === true || value.waitlisted === true,
      ...optional("guid", text(value.guid)),
      ...optional("fit", readFit(value.fit)),
    },
  ];
}

function readCandidate(value: unknown): Candidate[] {
  if (!isObject(value)) return [];
  return [
    {
      ...optional("name", text(value.name)),
      ...optional("character", text(value.character)),
      ...optional("level", number(value.level)),
      ...optional("classFile", text(value.classFile)),
      ...optional("fit", readFit(value.fit)),
    },
  ];
}

function readCouldFill(value: unknown): CouldFill[] {
  if (!isObject(value) || !SLOT_ROLES.includes(value.role as SlotRole)) return [];
  return [
    {
      role: value.role as SlotRole,
      characters: (Array.isArray(value.characters) ? value.characters : []).flatMap(readCandidate),
      close: (Array.isArray(value.close) ? value.close : []).flatMap(readCandidate),
    },
  ];
}

/** A slot role as sent; unknown is damage (BOT-API.md "Run events"). */
export function slotRole(value: unknown): SlotRole {
  return value === "tank" || value === "healer" ? value : "damage";
}

/** The Discord ids in an event's `mention`, at most 100 (Discord's limit per message). */
export function readMention(value: unknown): string[] {
  return (Array.isArray(value) ? value : []).filter((id): id is string => isSnowflake(id)).slice(0, 100);
}

// --- the run post ----------------------------------------------------------------------------------------------------

/** What the post shows, from the site's state and the time (starting soon is the bot's: from the reminder on). */
export type PostState = "open" | "full" | "soon" | "started" | "done" | "didntHappen" | "cancelled";

export function postState(run: Run, now: number, reminderMinutes: number): PostState {
  if (run.state === "cancelled") return "cancelled";
  if (run.outcome?.kind === "done") return "done";
  if (run.outcome?.kind === "didntHappen") return "didntHappen";
  if (run.state === "started" || run.state === "past" || now >= run.startsAt) return "started";
  if (now >= run.startsAt - reminderMinutes * 60) return "soon";
  return run.state === "full" ? "full" : "open";
}

const STATE_NAMES: Readonly<Record<PostState, string>> = {
  open: "Open",
  full: "Full",
  soon: "Starting soon",
  started: "Started",
  done: "Done",
  didntHappen: "Didn't happen",
  cancelled: "Cancelled",
};

/** Whether people can still answer from the post (the site closes a run at its start). */
export function answering(state: PostState): boolean {
  return state === "open" || state === "full" || state === "soon";
}

export interface PostContext {
  siteUrl: string;
  siteHost: string;
  /** Unix seconds. */
  now: number;
  reminderMinutes: number;
  /** The role mentioned on a new run (settings `mentionRole`). */
  mentionRole?: string;
  /** From `runCancelled`: who cancelled it (a name). */
  cancelledBy?: string;
  /** BOT-11: the class icons before character names. */
  icons?: ClassIcons;
  /** The admin's test post (BOT-API.md "Run events": `test`, run id 0); its event id is its marker. */
  test?: { eventId: number };
}

/** The run's page on the site; the post's link carries the run's marker, so the bot finds its post again. */
export function runUrl(siteUrl: string, runId: number): string {
  return `${siteUrl}/runs/${runId}`;
}

/** The marker on the run post's link: `#r<id>`. */
export function runMarker(runId: number): string {
  return `#r${runId}`;
}

/** Run id → message id for the bot's run posts among these messages. */
export function markedRuns(siteUrl: string, messages: readonly { id: string; texts: string[] }[]): Map<number, string> {
  const pattern = new RegExp(`${escapeRegExp(siteUrl)}/runs/\\d+#r(\\d+)`, "g");
  const found = new Map<number, string>();
  for (const message of messages) {
    for (const t of message.texts) {
      for (const match of t.matchAll(pattern)) {
        const id = Number(match[1]);
        if (!found.has(id)) found.set(id, message.id);
      }
    }
  }
  return found;
}

const roleName = (role: SlotRole) => ({ tank: "Tank", healer: "Healer", damage: "Damage" })[role];

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

const esc = (value: string | undefined) => (value === undefined ? undefined : escapeMarkdown(value));

/** "[icon] Lia Thornwhisper 37" (BOT-11), or the friend's name without a character. */
function characterText(p: RunPerson | Candidate, icons: ClassIcons): string {
  if (p.character === undefined) return esc(p.name) ?? "Someone";
  const name = `${icon(icons, p.classFile)}${escapeMarkdown(p.character)}`;
  return p.level !== undefined ? `${name} ${p.level}` : name;
}

/** "Lia Thornwhisper 37 · Femke", with "carry" for a carry (WEB-47). */
function slotText(a: RunAnswer, icons: ClassIcons): string {
  const parts = [characterText(a, icons)];
  if (a.character !== undefined && a.name !== undefined) parts.push(escapeMarkdown(a.name));
  if (a.fit?.kind === "carry") parts.push("carry");
  return parts.join(" · ");
}

/** "Nico on Ves Doombringer (39 Warlock)", or "Nico organises". */
export function organiserText(run: Run): string {
  const who = esc(run.organiser.name) ?? "Someone";
  if (run.organiser.character === undefined) return `${who} organises`;
  const facts = [run.organiser.level, run.organiser.classFile && CLASS_NAMES[run.organiser.classFile]]
    .filter((x) => x !== undefined && x !== "")
    .join(" ");
  return `${who} on ${escapeMarkdown(run.organiser.character)}${facts ? ` (${facts})` : ""}`;
}

function levelsText(run: Run): string | undefined {
  const { min, max } = run.dungeon;
  return min !== undefined && max !== undefined ? `Levels ${min}–${max}` : undefined;
}

const when = (at: number) => `<t:${at}:f> · <t:${at}:R>`;

/** The five slots: those in by role, then Maybes of that role in its open places (board `bot-posts-runs`). */
export function slots(run: Run): { role: SlotRole; who?: RunAnswer; maybe: boolean }[] {
  const out: { role: SlotRole; who?: RunAnswer; maybe: boolean }[] = [];
  for (const role of SLOT_ROLES) {
    const ins = run.answers.filter((a) => a.answer === "in" && a.role === role);
    const maybes = run.answers.filter((a) => a.answer === "maybe" && !a.reserve && a.role === role);
    for (let i = 0; i < SLOTS[role]; i++) {
      const inAt = ins[i];
      if (inAt !== undefined) out.push({ role, who: inAt, maybe: false });
      else {
        const maybe = maybes[i - ins.length];
        out.push(maybe !== undefined ? { role, who: maybe, maybe: true } : { role, maybe: false });
      }
    }
  }
  return out;
}

function candidateText(c: Candidate, icons: ClassIcons): string {
  return `${characterText(c, icons)}${c.name !== undefined && c.character !== undefined ? ` (${escapeMarkdown(c.name)})` : ""}`;
}

/** "Could fill the tank slot: …" per open role, from the site's `couldFill`. */
function couldFillLines(run: Run, icons: ClassIcons): string[] {
  return (run.couldFill ?? []).map((c) => {
    const slot = `Could fill the ${c.role} slot`;
    if (c.characters.length > 0) return `${slot}: ${c.characters.map((x) => candidateText(x, icons)).join(", ")}`;
    const close = c.close[0];
    return close === undefined
      ? `${slot}: nobody in range yet.`
      : `${slot}: nobody in range yet. Close: ${candidateText(close, icons)}${close.fit?.label ? `, ${close.fit.label}` : ""}.`;
  });
}

function openCount(run: Run): number {
  if (run.open !== undefined) return run.open.tank + run.open.healer + run.open.damage;
  return slots(run).filter((s) => s.who === undefined || s.maybe).length;
}

function countsText(run: Run): string {
  const ins = run.counts?.in ?? run.answers.filter((a) => a.answer === "in").length;
  const maybes = run.counts?.maybe ?? run.answers.filter((a) => a.answer === "maybe").length;
  const open = openCount(run);
  return `${ins} in · ${maybes} maybe · ${open === 0 ? "full" : `${open} slot${open === 1 ? "" : "s"} open`}`;
}

/** The line under the time for a state that isn't open. */
function stateLine(run: Run, state: PostState, ctx: PostContext): string | undefined {
  const icons = ctx.icons ?? NO_ICONS;
  switch (state) {
    case "full": {
      const reserves = run.answers.filter((a) => a.answer === "maybe" && a.reserve);
      return reserves.length > 0
        ? `5 of 5 · ${reserves.map((a) => slotText(a, icons)).join(", ")} ${reserves.length === 1 ? "is" : "are"} next in line if someone drops out`
        : "5 of 5 · Maybe and I'm in are next in line if someone drops out";
    }
    case "soon":
      return `Starting <t:${run.startsAt}:R> · answers still open`;
    case "started":
      return `Since <t:${run.startsAt}:t> · invites are going out in game`;
    case "done": {
      const o = run.outcome?.kind === "done" ? run.outcome : undefined;
      return o?.came !== undefined && o.signedUp !== undefined
        ? `Ran it · ${o.came} of ${o.signedUp} signed-up came`
        : "Ran it";
    }
    case "didntHappen":
      return "No upload showed the run within 4 hours of start";
    case "cancelled": {
      const by = ctx.cancelledBy;
      if (by === undefined) return "Cancelled · sign-ups were sent a quiet notice";
      return by === run.organiser.name
        ? `Cancelled by ${escapeMarkdown(by)}, the organiser · sign-ups were sent a quiet notice`
        : "Removed by an admin · sign-ups were sent a quiet notice";
    }
    default:
      return undefined;
  }
}

/** The custom id of a run's button: `run:<id>:<what>`. */
export const runButton = (runId: number, what: string) => `run:${runId}:${what}`;

/** A run's or an ask's button (BOT-12): `run:<id>:<what>` or `ask:<id>:<what>`. */
export const buttonOf = (run: Run, what: string) => `${run.kind ?? "run"}:${run.id}:${what}`;

/** A run's page, or the Runs page for an ask (it has no page of its own). */
export const pageOf = (siteUrl: string, run: Run) => (run.kind === "ask" ? `${siteUrl}/runs` : runUrl(siteUrl, run.id));

function linkButton(label: string, url: string): Component {
  return { type: 2, style: 5, label, url };
}

/** The run post (board `bot-posts-runs` 1 and 2): one message per run, edited in every state. */
export function runMessage(run: Run, ctx: PostContext): MessageContent {
  const state = postState(run, ctx.now, ctx.reminderMinutes);
  const url = ctx.test !== undefined ? `${ctx.siteUrl}/runs${marker(ctx.test.eventId)}` : runUrl(ctx.siteUrl, run.id);
  const lines = [
    `${when(run.startsAt)}`,
    [levelsText(run), run.note !== undefined ? `“${escapeMarkdown(run.note)}”` : undefined].filter(Boolean).join(" · "),
    stateLine(run, state, ctx),
  ].filter((l): l is string => l !== undefined && l !== "");
  const embed: Embed = {
    author: { name: organiserText(run).replace(/\\/g, "") },
    title: `${run.dungeon.name} · ${STATE_NAMES[state]}`,
    url: ctx.test !== undefined ? url : `${url}${runMarker(run.id)}`,
    description: lines.join("\n"),
    color: GOLD,
  };
  const icons = ctx.icons ?? NO_ICONS;
  if (state !== "cancelled" && state !== "didntHappen") {
    // One line per slot (BOT-13, Nico 2026-10-28): inline fields wrap 3 + 2 and the columns don't line up.
    const slotLines = slots(run).map(
      (s) =>
        `${roleName(s.role)} · ${
          s.who === undefined
            ? s.role === "damage"
              ? "open"
              : "needed"
            : `${slotText(s.who, icons)}${s.maybe ? " · maybe" : ""}`
        }`,
    );
    const extra = [
      ...(answering(state) ? couldFillLines(run, icons) : []),
      ...listLine(
        "Reserve",
        run.answers.filter((a) => a.answer === "maybe" && a.reserve),
        icons,
      ),
      ...listLine(
        "Also maybe",
        run.answers.filter((a) => a.answer === "maybe" && !a.reserve && !slots(run).some((s) => s.who === a)),
        icons,
      ),
    ];
    embed.description = [embed.description, slotLines.join("\n"), ...(extra.length > 0 ? [extra.join("\n")] : [])].join(
      "\n\n",
    );
  }
  embed.footer = { text: `${ctx.test !== undefined ? "Test post · " : ""}${countsText(run)} · ${ctx.siteHost}/runs` };

  const buttons: Component[] =
    answering(state) && ctx.test === undefined
      ? [
          {
            type: 2,
            style: 3,
            label: state === "full" ? "I'm in · full" : "I'm in",
            custom_id: runButton(run.id, "in"),
          },
          { type: 2, style: 2, label: "Maybe", custom_id: runButton(run.id, "maybe") },
          { type: 2, style: 4, label: "Can't", custom_id: runButton(run.id, "cant") },
        ]
      : [];
  buttons.push(linkButton("Open run ↗", ctx.test !== undefined ? `${ctx.siteUrl}/runs` : runUrl(ctx.siteUrl, run.id)));

  const mention = ctx.mentionRole !== undefined && ctx.test === undefined ? `<@&${ctx.mentionRole}> ` : "";
  return {
    content: `${ctx.test !== undefined ? "Test post · " : mention}${esc(run.organiser.name) ?? "Someone"} planned a run`,
    embeds: [embed],
    // Only the role, and only on the first post: an edit never notifies (Discord).
    allowed_mentions: { parse: [], ...(mention ? { roles: [ctx.mentionRole as string] } : {}) },
    components: [{ type: 1, components: buttons }],
  };
}

function listLine(label: string, answers: RunAnswer[], icons: ClassIcons): string[] {
  return answers.length === 0 ? [] : [`${label}: ${answers.map((a) => slotText(a, icons)).join(", ")}`];
}

// --- reminder, Starting now, ping ------------------------------------------------------------------------------------

/** "Ves Doombringer, Lia Thornwhisper · maybe: Tok Ironhide, Jorrit · tank still open". */
function whoLine(run: Run, prefix: boolean, icons: ClassIcons): string {
  const names = (a: RunAnswer) =>
    a.character !== undefined
      ? `${icon(icons, a.classFile)}${escapeMarkdown(a.character)}`
      : (esc(a.name) ?? "Someone");
  const ins = run.answers.filter((a) => a.answer === "in").map(names);
  const maybes = run.answers.filter((a) => a.answer === "maybe").map(names);
  const open = SLOT_ROLES.filter((r) => r !== "damage" && (run.open?.[r] ?? 0) > 0);
  return [
    ins.length > 0 ? `${prefix ? "In: " : ""}${ins.join(", ")}` : "Nobody in yet",
    maybes.length > 0 ? `maybe: ${maybes.join(", ")}` : undefined,
    open.length > 0 ? `${open.join(" and ")} still open` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
}

function mentions(ids: readonly string[]): string {
  return ids.map((id) => `<@${id}>`).join(" ");
}

function eventUrl(siteUrl: string, runId: number, eventId: number): string {
  return `${runUrl(siteUrl, runId)}${marker(eventId)}`;
}

/** The reminder (board `bot-posts-runs` 3), a new message mentioning only those who answered I'm in or Maybe. */
export function reminderMessage(
  run: Run,
  minutes: number,
  mention: readonly string[],
  eventId: number,
  siteUrl: string,
  icons: ClassIcons = NO_ICONS,
): MessageContent {
  return {
    content: `${mentions(mention)} ${run.dungeon.name} starts in ${minutes} minutes`.trim(),
    embeds: [
      {
        title: run.dungeon.name,
        url: eventUrl(siteUrl, run.id, eventId),
        description: `<t:${run.startsAt}:f>\n${whoLine(run, false, icons)}`,
        color: GOLD,
      },
    ],
    allowed_mentions: { parse: [], users: [...mention] },
    components: [{ type: 1, components: [linkButton("Open run ↗", runUrl(siteUrl, run.id))] }],
  };
}

/** Starting now (board `bot-posts-runs` 3): always posted at the start. */
export function startingMessage(
  run: Run,
  mention: readonly string[],
  eventId: number,
  siteUrl: string,
  icons: ClassIcons = NO_ICONS,
): MessageContent {
  const by = esc(run.organiser.name) ?? "The organiser";
  return {
    content: `${mentions(mention)} Starting now · invites go out in game`.trim(),
    embeds: [
      {
        title: run.dungeon.name,
        url: eventUrl(siteUrl, run.id, eventId),
        description: [
          whoLine(run, true, icons),
          `${by} invites from the game. Not grouped in 5 minutes? Log in and press **Request invite**.`,
        ].join("\n"),
        footer: { text: "Always posted at start time" },
        color: GOLD,
      },
    ],
    allowed_mentions: { parse: [], users: [...mention] },
    components: [{ type: 1, components: [linkButton("Open run ↗", runUrl(siteUrl, run.id))] }],
  };
}

export interface Ping {
  from: RunPerson;
  to: RunPerson;
}

export function readPing(data: unknown): Ping | undefined {
  if (!isObject(data) || !isObject(data.to)) return undefined;
  return { from: readPerson(data.from), to: readPerson(data.to) };
}

/** A ping from the game (board `bot-posts-runs` 3): "Hey Jorrit, these people are waiting for you". */
export function pingMessage(
  run: Run,
  ping: Ping,
  eventId: number,
  siteUrl: string,
  icons: ClassIcons = NO_ICONS,
): MessageContent {
  const to = esc(ping.to.name) ?? esc(ping.to.character) ?? "there";
  const ins = run.answers
    .filter((a) => a.answer === "in")
    .map((a) =>
      a.character !== undefined
        ? `${icon(icons, a.classFile)}${escapeMarkdown(a.character)}`
        : (esc(a.name) ?? "Someone"),
    );
  const id = ping.to.discordId;
  return {
    content: `${id !== undefined ? `<@${id}> ` : ""}Hey ${to}, these people are waiting for you in ${run.dungeon.name}`,
    embeds: [
      {
        title: run.dungeon.name,
        url: eventUrl(siteUrl, run.id, eventId),
        description: [
          ins.length > 0 ? ins.join(" · ") : undefined,
          "Log in and press **Request invite** on the Dungeons tab.",
        ]
          .filter(Boolean)
          .join("\n"),
        footer: { text: `Ping sent from the game by ${ping.from.name ?? "a friend"} · via /reload` },
        color: GOLD,
      },
    ],
    allowed_mentions: { parse: [], users: id !== undefined ? [id] : [] },
    components: [{ type: 1, components: [linkButton("Open run ↗", runUrl(siteUrl, run.id))] }],
  };
}

// --- asks (BOT-12) ---------------------------------------------------------------------------------------------------

/**
 * An ask ("who's up right now", web WEB-51), from the game or `/ask`: open for 10 minutes, answered without slots.
 * `id` is the site's ask (sites from before WEB-51 send the game's item id, and the post then has no buttons).
 */
export interface Ask {
  id?: number;
  dungeon: string;
  min?: number;
  max?: number;
  from: RunPerson;
  character?: string;
  role?: SlotRole;
  note?: string;
  source?: string;
  at?: number;
  expiresAt?: number;
  state?: "open" | "expired" | "cancelled";
  answers: RunAnswer[];
}

export function readAsk(data: unknown): Ask | undefined {
  if (!isObject(data) || !isObject(data.ask) || !isObject(data.ask.dungeon)) return undefined;
  const a = data.ask;
  const dungeon = text((a.dungeon as Record<string, unknown>).name);
  if (dungeon === undefined) return undefined;
  const levels = isObject((a.dungeon as Record<string, unknown>).typicalLevels)
    ? ((a.dungeon as Record<string, unknown>).typicalLevels as Record<string, unknown>)
    : {};
  // The asker's role as the addon names it (tank / heal / dps).
  const role: SlotRole | undefined =
    a.role === "tank" ? "tank" : a.role === "heal" ? "healer" : a.role === "dps" ? "damage" : undefined;
  const state: Ask["state"] =
    a.state === "open" || a.state === "expired" || a.state === "cancelled" ? a.state : undefined;
  return {
    ...optional("id", Number.isInteger(a.id) ? (a.id as number) : undefined),
    dungeon,
    ...optional("min", number(levels.min)),
    ...optional("max", number(levels.max)),
    from: readPerson(a.from),
    ...optional("character", text(a.character)),
    ...optional("role", role),
    ...optional("note", text(a.note)),
    ...optional("source", text(a.source)),
    ...optional("at", number(a.at)),
    ...optional("expiresAt", number(a.expiresAt)),
    ...optional("state", state),
    answers: (Array.isArray(a.answers) ? a.answers : []).flatMap(readAnswer),
  };
}

/** Whether the ask takes no more answers: the site says so, or its 10 minutes are over. */
export function askEnded(ask: Ask, now: number): boolean {
  return ask.state === "expired" || ask.state === "cancelled" || (ask.expiresAt !== undefined && now >= ask.expiresAt);
}

/** The marker on an ask post's link: `#a<id>`, so the post is found again for its answers and its expiry. */
export function askMarker(askId: number): string {
  return `#a${askId}`;
}

/** Ask id → message id for the bot's ask posts among these messages. */
export function markedAsks(siteUrl: string, messages: readonly { id: string; texts: string[] }[]): Map<number, string> {
  const pattern = new RegExp(`${escapeRegExp(siteUrl)}/runs#a(\\d+)`, "g");
  const found = new Map<number, string>();
  for (const message of messages) {
    for (const t of message.texts) {
      for (const match of t.matchAll(pattern)) {
        const id = Number(match[1]);
        if (!found.has(id)) found.set(id, message.id);
      }
    }
  }
  return found;
}

/** An ask as a run, for the answer replies and the picker it shares with runs (BOT-04). */
export function askAsRun(ask: Ask & { id: number }): Run {
  return {
    id: ask.id,
    kind: "ask",
    dungeon: { name: ask.dungeon, ...optional("min", ask.min), ...optional("max", ask.max) },
    startsAt: ask.at ?? ask.expiresAt ?? 0,
    organiser: { ...ask.from, ...optional("character", ask.character) },
    answers: ask.answers,
  };
}

export interface AskContext {
  siteUrl: string;
  /** Unix seconds. */
  now: number;
  /** The event the post was made for, its marker when the ask has no id (a site from before WEB-51). */
  eventId: number;
  mentionRole?: string;
  icons?: ClassIcons;
}

/**
 * An ask (board `bot-posts-runs` 4), from the game or `/ask`: the answers so far, I'm in / Maybe / Can't / Pick my
 * character while it is open, then "Expired" without buttons. One message per ask, edited as answers come in.
 */
export function askMessage(ask: Ask, ctx: AskContext): MessageContent {
  const icons = ctx.icons ?? NO_ICONS;
  const who = esc(ask.from.name) ?? "Someone";
  const on =
    ask.character !== undefined
      ? `${who} on ${escapeMarkdown(ask.character)}${ask.role !== undefined ? ` (${ask.role})` : ""}`
      : who;
  const ended = askEnded(ask, ctx.now);
  const name = (a: RunAnswer) =>
    a.character !== undefined
      ? `${icon(icons, a.classFile)}${escapeMarkdown(a.character)}${a.name !== undefined ? ` (${escapeMarkdown(a.name)})` : ""}`
      : (esc(a.name) ?? "Someone");
  const list = (label: string, kind: RunAnswer["answer"]) => {
    const answers = ask.answers.filter((a) => a.answer === kind);
    return answers.length === 0 ? undefined : `**${label}** · ${answers.map(name).join(" · ")}`;
  };
  const answered = ask.answers.length;
  const lines = ended
    ? [
        `${ask.at !== undefined ? `Asked at <t:${ask.at}:t> · ` : ""}${answered} answered`,
        list("In", "in"),
        "After 10 minutes the buttons go away; the group forms in game.",
      ]
    : [
        [
          ask.min !== undefined && ask.max !== undefined ? `Levels ${ask.min}–${ask.max}` : undefined,
          ask.expiresAt !== undefined ? `ends <t:${ask.expiresAt}:R>` : undefined,
        ]
          .filter(Boolean)
          .join(" · "),
        ask.note !== undefined ? `“${escapeMarkdown(ask.note)}”` : undefined,
        list("In", "in"),
        list("Maybe", "maybe"),
        list("Can't", "cant"),
        ask.id === undefined ? `Answer in game: ${who} gets the answers there and sends the invites.` : undefined,
      ];
  const from = ask.source === "discord" ? "asked on Discord" : "asked from the game · via /reload";
  const mention = ctx.mentionRole !== undefined ? `<@&${ctx.mentionRole}> ` : "";
  const open = !ended && ask.id !== undefined;
  const button = (what: string) => `ask:${ask.id}:${what}`;
  return {
    content: `${mention}${who} asks who's up right now`,
    embeds: [
      {
        author: { name: on.replace(/\\/g, "") },
        title: `${ask.dungeon} · ${ended ? "Expired" : "now"}`,
        url: `${ctx.siteUrl}/runs${ask.id !== undefined ? askMarker(ask.id) : marker(ctx.eventId)}`,
        description: lines.filter((l): l is string => l !== undefined && l !== "").join("\n"),
        footer: { text: `${from} · ends in a party invite in game` },
        color: GOLD,
      },
    ],
    // Only the role, and only on the first post: an edit never notifies (Discord).
    allowed_mentions: { parse: [], ...(ctx.mentionRole !== undefined ? { roles: [ctx.mentionRole] } : {}) },
    ...(open
      ? {
          components: [
            {
              type: 1 as const,
              components: [
                { type: 2 as const, style: 3, label: "I'm in", custom_id: button("in") },
                { type: 2 as const, style: 2, label: "Maybe", custom_id: button("maybe") },
                { type: 2 as const, style: 4, label: "Can't", custom_id: button("cant") },
              ],
            },
          ],
        }
      : { components: [] }),
  };
}

// --- quiet notices ---------------------------------------------------------------------------------------------------

function noticeMessage(run: Run, title: string, text: string, siteUrl: string): MessageContent {
  return {
    embeds: [{ title, url: runUrl(siteUrl, run.id), description: text, color: GOLD }],
    allowed_mentions: { parse: [] },
    components: [{ type: 1, components: [linkButton("Open run ↗", runUrl(siteUrl, run.id))] }],
  };
}

/** `runMovedUp`: a reserve (or Maybe) moved into a freed slot. A direct message, never a channel ping. */
export function movedUpNotice(run: Run, discordId: string, siteUrl: string): MessageContent {
  const mine = run.answers.find((a) => a.discordId === discordId);
  const as = mine?.character !== undefined ? ` as ${escapeMarkdown(mine.character)} (${mine.role})` : "";
  return noticeMessage(
    run,
    `You're in · ${run.dungeon.name}`,
    `A slot freed up: you moved up and are in${as}.\n${when(run.startsAt)}`,
    siteUrl,
  );
}

/** `runMoved` (WEB-47): the organiser or the admin moved your sign-up. */
export function movedNotice(run: Run, to: string, by: string | undefined, siteUrl: string): MessageContent {
  const who = esc(by) ?? "The organiser";
  const text =
    to === "removed"
      ? `${who} took you off this run. You can answer again.`
      : to === "reserve"
        ? `${who} moved you to reserve: you move up first when a slot frees.`
        : `${who} moved you to ${slotRole(to)}.`;
  return noticeMessage(run, `Your sign-up · ${run.dungeon.name}`, `${text}\n${when(run.startsAt)}`, siteUrl);
}

/** `runChanged` with a new start time: the quiet notice to each sign-up; their answers stay. */
export function movedTimeNotice(run: Run, siteUrl: string): MessageContent {
  const who = esc(run.organiser.name) ?? "The organiser";
  return noticeMessage(
    run,
    `New time · ${run.dungeon.name}`,
    `${who} moved the run to <t:${run.startsAt}:f> (<t:${run.startsAt}:R>). Your answer stays.`,
    siteUrl,
  );
}

/** `runCancelled`: the quiet notice to each sign-up. */
export function cancelledNotice(run: Run, by: string | undefined, siteUrl: string): MessageContent {
  const who = by === undefined ? "" : by === run.organiser.name ? ` by ${escapeMarkdown(by)}` : " by an admin";
  return noticeMessage(
    run,
    `Cancelled · ${run.dungeon.name}`,
    `The run on <t:${run.startsAt}:f> was cancelled${who}.`,
    siteUrl,
  );
}

// --- helpers ---------------------------------------------------------------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optional<K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } {
  return (value === undefined ? {} : { [key]: value }) as { [P in K]?: V };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
