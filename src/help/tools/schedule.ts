import {
  type ContextSchedule,
  SCHEDULE_ICONS,
  type ScheduleIcon,
  type ToolResult,
} from "../actions.ts"
import { normalize } from "../text.ts"
import type { AssistantTool, ToolContext } from "../types.ts"
import { addDays, daysBetween, parseDatePhrase, sayDate } from "./dates.ts"
import {
  capitalize,
  cleanSpoken,
  enumWithNone,
  extractJson,
  joinNames,
  nameFullyMentioned,
  nameMentioned,
} from "./kit.ts"

// Repeating schedules ("water the plants every 3 days"), limited to what
// Suitey's schedule form and cards support: create, rename, change how often,
// restart the countdown (done it today, or on another day), pin/unpin, delete.
//
// One operation per request. Anything else returns null and falls through.

const NO_SCHEDULE = "none"

/** Suitey's schedule form allows 3 to 24 characters. */
export const NAME_MIN = 3
export const NAME_MAX = 24
export const INTERVAL_MAX = 365
/** Suitey caps pinned schedules on the homespace. */
export const MAX_PINS = 8

const OPS = [
  "create",
  "rename",
  "set_interval",
  "restart",
  "pin",
  "unpin",
  "delete",
  "none",
] as const
type Op = (typeof OPS)[number]

export type ScheduleExtraction = {
  op: Op
  schedule: string
  /** create: the new schedule's name. rename: the new name. Otherwise "". */
  name: string
  /** How often in days (create, set_interval), else 0. */
  every_days: number
  /** create: when it starts. restart: when they last did it. In their words, or "". */
  date: string
  icon: ScheduleIcon
}

const INSTRUCTIONS = [
  "Work out what the user wants to do to their repeating schedules, shown below.",
  "A schedule is something done every so many days, like watering plants every 3 days.",
  "- op: create (a new schedule), rename, set_interval (change how often), restart (they just did it,",
  '  or want its countdown to start over: "I watered the plants", "reset the filter schedule"),',
  "  pin, unpin, delete, or none if this is not about repeating schedules.",
  `- schedule: for anything but create, the existing schedule they mean, matched loosely. "${NO_SCHEDULE}" for create or if they named none shown.`,
  "- name: create: a short name for it in their words, without how often",
  '  ("remind me to water the plants every 3 days" is "water plants"). rename: the new name. Otherwise "".',
  '- every_days: create and set_interval: how often in days ("weekly" is 7, "every other day" is 2,',
  '  "every two weeks" is 14, "monthly" is 30). Otherwise 0.',
  '- date: create: the day it starts, restart: the day they did it ("yesterday", "on monday"), as they said it; "" if not said.',
  "- icon: the closest icon to what it is about.",
].join("\n")

function describe(schedules: ContextSchedule[], today: string): string {
  const lines = schedules.map(
    (s) =>
      `- "${s.name}" every ${s.interval} days, next due ${s.nextDue}${s.pinned ? ", pinned" : ""}`
  )
  return `Today is ${today}.\n${lines.length ? `The user's schedules:\n${lines.join("\n")}` : "The user has no schedules."}`
}

async function extract(text: string, schedules: ContextSchedule[], today: string) {
  return extractJson<ScheduleExtraction>({
    instructions: INSTRUCTIONS,
    data: describe(schedules, today),
    input: text,
    schema: {
      type: "object",
      properties: {
        op: { type: "string", enum: OPS },
        schedule: enumWithNone(
          schedules.map((s) => s.name),
          NO_SCHEDULE
        ),
        name: { type: "string", maxLength: 40 },
        every_days: { type: "integer", minimum: 0, maximum: 999 },
        date: { type: "string", maxLength: 40 },
        icon: { type: "string", enum: SCHEDULE_ICONS },
      },
      required: ["op", "schedule", "name", "every_days", "date", "icon"],
      additionalProperties: false,
    },
    maxTokens: 96,
  })
}

function nameProblem(name: string): string | null {
  if (!name) return "What should the schedule be called?"
  if (name.length < NAME_MIN) return `Schedule names need at least ${NAME_MIN} characters.`
  if (name.length > NAME_MAX) return `Schedule names can be at most ${NAME_MAX} characters.`
  return null
}

const validInterval = (n: number) => Number.isInteger(n) && n >= 1 && n <= INTERVAL_MAX

const sayEvery = (n: number) =>
  n === 1 ? "every day" : n === 7 ? "every week" : n === 14 ? "every two weeks" : `every ${n} days`

/** The next due day on or after today for a schedule starting `start`. */
export function nextDue(start: string, interval: number, today: string): string {
  const since = daysBetween(start, today)
  if (since <= 0) return addDays(start, interval)
  const cycles = Math.ceil(since / interval)
  const due = addDays(start, cycles * interval)
  return due < today ? addDays(due, interval) : due
}

const sameName = (a: string, b: string) => normalize(a) === normalize(b)

/**
 * Turn the model's extraction into a reply and actions. Pure, so it can be
 * tested without the model. Returns null when it isn't a schedule operation.
 */
export function planScheduleOp(
  text: string,
  schedules: ContextSchedule[],
  today: string,
  e: ScheduleExtraction,
  /** The user's lists and events, to tell when a request is really about one of those. */
  otherNames: string[] = []
): ToolResult | null {
  if (e.op === "none") return null

  if (e.op === "create") {
    const name = capitalize(cleanSpoken(e.name))
    const problem = nameProblem(name)
    if (problem) return { response: problem }
    if (!validInterval(e.every_days)) return { response: `How often should ${name} repeat?` }
    if (schedules.some((s) => sameName(s.name, name))) {
      return { response: `You already have a schedule called ${name}.` }
    }
    const startDate = parseDatePhrase(e.date, today) ?? today
    const icon = SCHEDULE_ICONS.includes(e.icon) ? e.icon : "sprout"
    const due = nextDue(startDate, e.every_days, today)
    return {
      response: `Started ${name} ${sayEvery(e.every_days)}. It's next due ${sayDate(due, today)}.`,
      actions: [{ type: "schedule.create", name, interval: e.every_days, startDate, icon }],
    }
  }

  const picked = schedules.find((s) => s.name === e.schedule)
  const filler = new Set(["the", "my", "a", "an", "schedule"])
  const named =
    picked &&
    nameMentioned(text, picked.name, filler) &&
    // A shared word isn't enough when they fully named a list or event.
    (nameFullyMentioned(text, picked.name, filler) ||
      !otherNames.some((n) => nameFullyMentioned(text, n)))
      ? picked
      : undefined
  const only =
    schedules.length === 1 && e.op !== "delete" && /\bschedules?\b/.test(normalize(text))
      ? schedules[0]
      : undefined
  const schedule = named ?? only
  if (!schedule) {
    // Not one they named: let the list tools try ("pin groceries"), unless
    // they clearly meant a schedule.
    if (e.op === "delete" || !/\bschedules?\b/.test(normalize(text))) return null
    const which = schedules.length ? ` You have ${joinNames(schedules.map((s) => s.name))}.` : ""
    return { response: `Which schedule?${which}` }
  }

  switch (e.op) {
    case "rename": {
      const name = capitalize(cleanSpoken(e.name))
      const problem = nameProblem(name)
      if (problem) return { response: problem }
      if (sameName(name, schedule.name))
        return { response: `It's already called ${schedule.name}.` }
      if (schedules.some((s) => s.id !== schedule.id && sameName(s.name, name))) {
        return { response: `You already have a schedule called ${name}.` }
      }
      return {
        response: `Renamed ${schedule.name} to ${name}.`,
        actions: [{ type: "schedule.update", scheduleId: schedule.id, name }],
      }
    }

    case "set_interval": {
      if (!validInterval(e.every_days))
        return { response: `How often should ${schedule.name} repeat?` }
      if (e.every_days === schedule.interval) {
        return { response: `${schedule.name} is already ${sayEvery(schedule.interval)}.` }
      }
      const due = nextDue(schedule.startDate, e.every_days, today)
      return {
        response: `${schedule.name} is now ${sayEvery(e.every_days)}, next due ${sayDate(due, today)}.`,
        actions: [{ type: "schedule.update", scheduleId: schedule.id, interval: e.every_days }],
      }
    }

    case "restart": {
      const day = parseDatePhrase(e.date, today) ?? today
      if (day > today)
        return { response: `You can only restart ${schedule.name} from today or earlier.` }
      const due = nextDue(day, schedule.interval, today)
      return {
        response: `Restarted ${schedule.name}${day === today ? "" : ` from ${sayDate(day, today)}`}. It's next due ${sayDate(due, today)}.`,
        actions: [{ type: "schedule.update", scheduleId: schedule.id, startDate: day }],
      }
    }

    case "pin":
    case "unpin": {
      const pinned = e.op === "pin"
      if (schedule.pinned === pinned) {
        return { response: `${schedule.name} is already ${pinned ? "pinned" : "unpinned"}.` }
      }
      if (pinned && schedules.filter((s) => s.pinned).length >= MAX_PINS) {
        return { response: `You can only pin ${MAX_PINS} schedules. Unpin one first.` }
      }
      return {
        response: `${pinned ? "Pinned" : "Unpinned"} ${schedule.name}.`,
        actions: [{ type: "schedule.pin", scheduleId: schedule.id, pinned }],
      }
    }

    case "delete":
      return {
        response: `Deleted the ${schedule.name} schedule.`,
        actions: [{ type: "schedule.delete", scheduleId: schedule.id }],
      }

    default:
      return null
  }
}

export async function runScheduleTool(ctx: ToolContext): Promise<ToolResult | null> {
  const schedules = ctx.context?.schedules
  const today = ctx.context?.today
  if (!schedules || !today)
    return { response: "I can only change your schedules when you ask from Suitey." }
  const otherNames = [
    ...(ctx.context?.lists ?? []).map((l) => l.name),
    ...(ctx.context?.events ?? []).map((e) => e.name),
  ]
  return planScheduleOp(
    ctx.rawInput,
    schedules,
    today,
    await extract(ctx.rawInput, schedules, today),
    otherNames
  )
}

export const scheduleTool: AssistantTool = {
  id: "schedule",
  rules: [
    { type: "regex", pattern: "\\bschedules?\\b" },
    // "water the plants every 3 days", "every other week", "weekly"
    {
      type: "regex",
      pattern:
        "\\bevery (other |\\d+ |one |two |three |four |five |six |few )?(day|days|week|weeks|month|months)\\b",
    },
    { type: "regex", pattern: "\\b(daily|weekly|biweekly|monthly)\\b" },
    { type: "regex", pattern: "\\b(restart|reset|start over)\\b" },
    // "I watered the plants", "I just changed the filter"
    {
      type: "regex",
      pattern: "^(i|we) (just )?(did|watered|changed|replaced|cleaned|fed|took|mowed|washed)\\b",
    },
  ],
  run: runScheduleTool,
}
