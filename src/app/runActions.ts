// The run commands and buttons (BOT-04, boards `bot-commands-runs` and `bot-posts-runs`): `/plan`, `/runs`,
// `/run edit`, `/run cancel`, their autocomplete, the run post's I'm in / Maybe / Can't / Pick my character and the
// picker. Every answer goes to the site, which checks every right (BOT-API.md "Run actions"); the post itself is
// rebuilt from the site's next run event (app/runPosts.ts). Answers are only for the asker.
import type { Autocomplete, ButtonPress, SlashCommand } from "../adapters/discord.js";
import type { Log } from "../adapters/log.js";
import type { Site, SiteAnswer } from "../adapters/site.js";
import { notLinkedMessage, nothingMessage } from "../core/lookups.js";
import type { MessageContent } from "../core/milestones.js";
import {
  type PickCharacter,
  type PlanChoices,
  answeredMessage,
  cancelledMessage,
  dayChoices,
  dayOffset,
  dungeonChoices,
  editedMessage,
  localDateTime,
  notYoursMessage,
  pickerMessage,
  plannedMessage,
  readPickCharacters,
  readPlanChoices,
  readStored,
  refusalMessage,
  rolePickerMessage,
  runChoices,
  runsListMessage,
  timePassedMessage,
} from "../core/runReplies.js";
import { type Run, type SlotRole, readRun } from "../core/runs.js";
import type { SiteSettings } from "../core/settings.js";

export const RUN_COMMANDS = ["plan", "runs", "run"] as const;

/** How long the time-passed reply's "Tomorrow" button works, and how many are kept: bounded. */
export const AGAIN_FOR_MS = 15 * 60_000;
export const AGAIN_KEEP = 100;

interface Plan {
  userId: string;
  dungeonId: string;
  dayOffset: number;
  time: string;
  note?: string;
  at: number;
}

export interface RunActionDeps {
  siteUrl: string;
  site: Site;
  log: Log;
  now(): number;
  /** The latest settings (for "Posted in #runs"), as the poster read them. */
  settings(): SiteSettings | undefined;
}

export class RunActions {
  private next = 1;
  private readonly plans = new Map<number, Plan>();

  constructor(private readonly deps: RunActionDeps) {}

  private call(method: "GET" | "POST" | "PATCH", path: string, body: unknown, signal: AbortSignal) {
    return this.deps.site.runs(method, path, body, signal);
  }

  private choices(userId: string, signal: AbortSignal) {
    return this.call("GET", `plan?discordUserId=${encodeURIComponent(userId)}`, undefined, signal);
  }

  private async characters(runId: number, userId: string, signal: AbortSignal): Promise<SiteAnswer> {
    return this.call("GET", `runs/${runId}/characters?discordUserId=${encodeURIComponent(userId)}`, undefined, signal);
  }

  private async run(runId: number, signal: AbortSignal): Promise<Run | undefined> {
    const answer = await this.call("GET", `runs/${runId}`, undefined, signal);
    return answer.ok && isObject(answer.body) ? readRun(answer.body.run) : undefined;
  }

  /** A refusal for people; 403 `not_linked` is the "Link your Discord first" card. */
  private refused(answer: Extract<SiteAnswer, { ok: false }>): MessageContent {
    if (answer.error === "not_linked") {
      return notLinkedMessage(this.deps.siteUrl, new URL(this.deps.siteUrl).host, this.deps.settings()?.siteName);
    }
    return refusalMessage(answer.error, answer.status);
  }

  // --- commands ------------------------------------------------------------------------------------------------------

  async command(command: SlashCommand, signal: AbortSignal): Promise<void> {
    const o = command.options;
    const param = (name: string) => (typeof o[name] === "string" ? (o[name] as string).trim() : undefined);
    if (command.name === "runs") {
      const answer = await this.call("GET", "runs", undefined, signal);
      if (!answer.ok) return command.reply(this.refused(answer));
      const runs = (isObject(answer.body) && Array.isArray(answer.body.runs) ? answer.body.runs : []).flatMap((r) => {
        const run = readRun(r);
        return run === undefined ? [] : [run];
      });
      return command.reply(
        runsListMessage(
          runs,
          command.userId,
          Math.floor(this.deps.now() / 1000),
          this.deps.siteUrl,
          new URL(this.deps.siteUrl).host,
        ),
      );
    }
    if (command.name === "plan") {
      const choices = await this.choices(command.userId, signal);
      if (!choices.ok) return command.reply(this.refused(choices));
      const read = readPlanChoices(choices.body);
      const wanted = (param("dungeon") ?? "").toLowerCase();
      const dungeon = read.dungeons.find((d) => d.id === param("dungeon") || d.name.toLowerCase() === wanted);
      if (dungeon === undefined) return command.reply(refusalMessage("unknown_dungeon", 400));
      const offset = dayOffset(read, param("day") ?? "");
      if (offset === undefined) return command.reply(refusalMessage("invalid_time", 400));
      const plan: Plan = {
        userId: command.userId,
        dungeonId: dungeon.id,
        dayOffset: offset,
        time: param("time") ?? "",
        ...opt("note", param("note")),
        at: this.deps.now(),
      };
      return command.reply(await this.plan(plan, read, signal));
    }
    // `/run edit` and `/run cancel`.
    const runId = Number(param("run"));
    if (!Number.isInteger(runId) || runId <= 0) return command.reply(refusalMessage("unknown_run", 404));
    if (o.subcommand === "cancel") return command.reply(await this.cancel(runId, command.userId, signal));
    const day = param("day");
    const time = param("time");
    const note = param("note");
    if (day === undefined && time === undefined && note === undefined) {
      return command.reply(nothingMessage("Nothing to change", "Give a new day, time or note."));
    }
    const body: Record<string, unknown> = { discordUserId: command.userId, ...opt("note", note) };
    if (day !== undefined || time !== undefined) {
      // One of them given: the other stays as it is, in the asker's time zone.
      const choices = await this.choices(command.userId, signal);
      if (!choices.ok) return command.reply(this.refused(choices));
      const read = readPlanChoices(choices.body);
      const run = await this.run(runId, signal);
      if (run === undefined) return command.reply(refusalMessage("unknown_run", 404));
      const current = localDateTime(run.startsAt, read.timeZone);
      if (day !== undefined) {
        const offset = dayOffset(read, day);
        if (offset === undefined) return command.reply(refusalMessage("invalid_time", 400));
        Object.assign(body, { dayOffset: offset, time: time ?? current.time });
      } else {
        Object.assign(body, { date: current.date, time });
      }
    }
    const answer = await this.call("PATCH", `runs/${runId}`, body, signal);
    if (!answer.ok) {
      if (answer.error === "not_organiser") {
        return command.reply(notYoursMessage(await this.run(runId, signal), runId));
      }
      return command.reply(this.refused(answer));
    }
    const run = isObject(answer.body) ? readRun(answer.body.run) : undefined;
    if (run === undefined) return command.reply(refusalMessage(undefined, 500));
    return command.reply(editedMessage(run, day !== undefined || time !== undefined, this.deps.siteUrl));
  }

  /** Plans a run, leading as the character the site suggests for the dungeon. */
  private async plan(plan: Plan, choices: PlanChoices, signal: AbortSignal): Promise<MessageContent> {
    const dungeon = choices.dungeons.find((d) => d.id === plan.dungeonId);
    const lead = dungeon?.lead;
    const answer = await this.call(
      "POST",
      "runs",
      {
        discordUserId: plan.userId,
        dungeonId: plan.dungeonId,
        dayOffset: plan.dayOffset,
        time: plan.time,
        ...opt("note", plan.note),
        ...opt("leadGuid", lead?.guid),
      },
      signal,
    );
    if (!answer.ok) {
      if (answer.error === "time_passed") {
        const label = choices.days.find((d) => d.offset === plan.dayOffset)?.label ?? "That day";
        const again = plan.dayOffset + 1 < 7 ? this.keep({ ...plan, dayOffset: plan.dayOffset + 1 }) : undefined;
        return timePassedMessage(label.split(" · ")[0] ?? label, plan.time, choices.timeZone, again);
      }
      return this.refused(answer);
    }
    const run = isObject(answer.body) ? readRun(answer.body.run) : undefined;
    if (run === undefined) return refusalMessage(undefined, 500);
    const others = await this.characters(run.id, plan.userId, signal);
    const chars = others.ok ? readPickCharacters(others.body).filter((c) => c.guid !== lead?.guid) : [];
    const settings = this.deps.settings();
    return plannedMessage(
      run,
      lead,
      chars,
      choices.timeZone,
      settings?.runsChannel ?? settings?.postsChannel ?? undefined,
      this.deps.siteUrl,
    );
  }

  private async cancel(runId: number, userId: string, signal: AbortSignal): Promise<MessageContent> {
    const answer = await this.call("POST", `runs/${runId}/cancel`, { discordUserId: userId }, signal);
    if (!answer.ok) {
      if (answer.error === "not_allowed") return notYoursMessage(await this.run(runId, signal), runId);
      return this.refused(answer);
    }
    const run = isObject(answer.body) ? readRun(answer.body.run) : undefined;
    return run === undefined ? refusalMessage(undefined, 500) : cancelledMessage(run, this.deps.siteUrl);
  }

  /** Keeps a plan for the time-passed reply's "Tomorrow" button; the oldest is dropped first. */
  private keep(plan: Plan): string {
    const id = this.next++;
    this.plans.set(id, plan);
    for (const old of this.plans.keys()) {
      if (this.plans.size <= AGAIN_KEEP) break;
      this.plans.delete(old);
    }
    return `plan:${id}`;
  }

  // --- autocomplete --------------------------------------------------------------------------------------------------

  async autocomplete(request: Autocomplete, signal: AbortSignal): Promise<void> {
    const choices = await this.choices(request.userId, signal);
    const read = readPlanChoices(choices.ok ? choices.body : undefined);
    if (request.option === "dungeon") {
      if (!choices.ok) {
        // Not linked: the dungeons without who fits.
        const all = await this.call("GET", "dungeons", undefined, signal);
        const list = all.ok && isObject(all.body) && Array.isArray(all.body.dungeons) ? all.body.dungeons : [];
        return request.respond(dungeonChoices(readPlanChoices({ dungeons: list }), request.value));
      }
      return request.respond(dungeonChoices(read, request.value));
    }
    if (request.option === "day") return request.respond(dayChoices(read, request.value));
    if (request.option === "run") {
      const answer = await this.call("GET", "runs", undefined, signal);
      const runs = (answer.ok && isObject(answer.body) && Array.isArray(answer.body.runs) ? answer.body.runs : [])
        .map(readRun)
        .filter((r): r is Run => r !== undefined);
      return request.respond(runChoices(runs, request.userId, read.admin, read.timeZone, request.value));
    }
  }

  // --- buttons and the picker ----------------------------------------------------------------------------------------

  /** Whether a custom id is one of the run's (`run:` and `plan:`). */
  static handles(customId: string): boolean {
    return customId.startsWith("run:") || customId.startsWith("plan:");
  }

  async press(press: ButtonPress, signal: AbortSignal): Promise<void> {
    const again = /^plan:(\d+)$/.exec(press.customId);
    if (again !== null) {
      press.defer("update");
      const plan = this.plans.get(Number(again[1]));
      if (plan === undefined || plan.userId !== press.userId || this.deps.now() - plan.at > AGAIN_FOR_MS) {
        return press.update(refusalMessage("time_passed", 400));
      }
      this.plans.delete(Number(again[1]));
      const choices = await this.choices(press.userId, signal);
      if (!choices.ok) return press.update(this.refused(choices));
      return press.update(await this.plan(plan, readPlanChoices(choices.body), signal));
    }
    const match = /^run:(\d+):(in|maybe|cant|pick|cancel|char|lead|role:(.+):(tank|healer|damage))$/.exec(
      press.customId,
    );
    if (match === null) return;
    const runId = Number(match[1]);
    const what = match[2] as string;
    // The post's buttons answer in a new message only for the presser; the picker's changes its own message.
    const inPicker = what === "char" || what === "lead" || what.startsWith("role:");
    press.defer(inPicker ? "update" : "reply");
    const show = (content: MessageContent) => (inPicker ? press.update(content) : press.reply(content));

    if (what === "cancel") return show(await this.cancel(runId, press.userId, signal));
    if (what === "maybe" || what === "cant") return show(await this.answer(runId, press.userId, what, signal));
    if (what.startsWith("role:")) {
      return show(await this.answer(runId, press.userId, "in", signal, match[3], match[4] as SlotRole));
    }
    const picked = press.values[0];
    if (what === "lead") {
      if (picked === undefined) return;
      return show(await this.answer(runId, press.userId, "in", signal, picked, undefined, true));
    }

    // I'm in, Pick my character, and a character picked: the asker's characters that may say I'm in.
    const [run, chars] = await Promise.all([this.run(runId, signal), this.characters(runId, press.userId, signal)]);
    if (!chars.ok) return show(this.refused(chars));
    if (run === undefined) return show(refusalMessage("unknown_run", 404));
    const list = readPickCharacters(chars.body);
    if (what === "char") {
      const c = list.find((x) => x.guid === picked);
      if (c === undefined) return show(refusalMessage("not_your_character", 400));
      return show(await this.pickRole(run, c, press.userId, signal));
    }
    // One character with its own role: I'm in answers at once (Nico, 2026-10-28).
    const only = list.length === 1 ? list[0] : undefined;
    if (what === "in" && only !== undefined)
      return show(await this.answer(runId, press.userId, "in", signal, only.guid));
    return show(pickerMessage(run, list, this.deps.siteUrl));
  }

  /** After a character is picked: its role when its class plays only one, else the role buttons. */
  private async pickRole(run: Run, c: PickCharacter, userId: string, signal: AbortSignal): Promise<MessageContent> {
    if (c.roles.length === 1) return this.answer(run.id, userId, "in", signal, c.guid, c.roles[0]);
    return rolePickerMessage(run, c);
  }

  private async answer(
    runId: number,
    userId: string,
    answer: "in" | "maybe" | "cant",
    signal: AbortSignal,
    characterId?: string,
    role?: SlotRole,
    lead = false,
  ): Promise<MessageContent> {
    const result = await this.call(
      "POST",
      `runs/${runId}/answers`,
      { discordUserId: userId, answer, ...opt("characterId", characterId), ...opt("role", role) },
      signal,
    );
    if (!result.ok) return this.refused(result);
    const body = isObject(result.body) ? result.body : {};
    const run = readRun(body.run);
    const stored = readStored(body);
    if (run === undefined || stored === undefined) return refusalMessage(undefined, 500);
    const mine = characterId === undefined ? undefined : run.answers.find((a) => a.guid === characterId);
    return answeredMessage(run, stored, mine?.character, lead);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function opt<K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } {
  return (value === undefined ? {} : { [key]: value }) as { [P in K]?: V };
}
