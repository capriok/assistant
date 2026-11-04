import type { ContextEvent, EventType, ToolResult } from "../actions.ts"
import { normalize } from "../text.ts"
import type { AssistantTool, ToolContext } from "../types.ts"
import { addMinutes, daysBetween, onDate, parseDatePhrase, parseTime, sayTime } from "./dates.ts"
import {
  capitalize,
  cleanSpoken,
  enumWithNone,
  extractJson,
  nameFullyMentioned,
  nameMentioned,
} from "./kit.ts"

// Events on the user's calendar, limited to what Suitey's event form supports:
//   add (name, day, optional start/end time, type), rename, move to another
//   day, set or clear the time, delete.
//
// One operation per request. Anything else returns null and falls through.

const NO_EVENT = "none"
const MAX_EVENTS_IN_PROMPT = 40

/** Suitey's event form allows 3 to 24 characters. */
export const NAME_MIN = 3
export const NAME_MAX = 24

const TYPES: EventType[] = ["Event", "Work", "Reminder"]

/** Requests that are clearly about an event, even if we can't tell which. */
const EVENT_WORDS = /\b(events?|calendar|appointments?|meetings?|reminders?)\b/

/** Words that don't identify an event ("the dentist appointment" names "Dentist"). */
const EVENT_FILLER = new Set([
  "the",
  "my",
  "a",
  "an",
  "event",
  "appointment",
  "meeting",
  "reminder",
])

const OPS = ["create", "rename", "reschedule", "set_time", "clear_time", "delete", "none"] as const
type Op = (typeof OPS)[number]

export type EventExtraction = {
  op: Op
  /** The existing event they mean, or "none". */
  event: string
  /** create: the new event's name. rename: the new name. Otherwise "". */
  name: string
  /** The day in their words ("tomorrow", "next friday", "the 20th"), or "". */
  date: string
  /** "HH:MM" 24-hour, or "". */
  start: string
  end: string
  type: EventType
}

const INSTRUCTIONS = [
  "Work out what the user wants to do on their calendar. Their events are shown below.",
  "- op: create (add a new event, appointment or reminder), rename, reschedule (move an event to",
  "  another day), set_time (give an event a time or change it), clear_time (make it all day),",
  "  delete (cancel / remove an event), or none if it is not about calendar events",
  "  (adding things to a shopping list or checklist is none).",
  `- event: for anything but create, the existing event they mean, matched loosely. "${NO_EVENT}" for create or if they named no event shown.`,
  "- name: create: the new event's name in their words, without the day or time",
  '  ("add dentist on friday at 3" is "dentist"; "remind me to call mom tomorrow" is "call mom").',
  '  rename: the new name. Otherwise "".',
  '- date: the day exactly as they said it ("tomorrow", "next friday", "november 20th", "the 3rd").',
  '  create: the event\'s day. reschedule: the new day. Otherwise the day they used to pick the event, or "".',
  '- start, end: times as 24-hour "HH:MM" ("3pm" is "15:00", "from 9 to 10:30" is "09:00" and "10:30"). "" when not said.',
  '- type: Reminder for "remind me" or reminders, Work for work or meetings, otherwise Event.',
].join("\n")

function describe(events: ContextEvent[], today: string): string {
  const shown = [...events]
    .sort((a, b) => Math.abs(daysBetween(today, a.date)) - Math.abs(daysBetween(today, b.date)))
    .slice(0, MAX_EVENTS_IN_PROMPT)
    .sort((a, b) => a.date.localeCompare(b.date))
  const lines = shown.map((e) => {
    const time = e.timed && e.startTime ? ` ${e.startTime}${e.endTime ? `-${e.endTime}` : ""}` : ""
    return `- "${e.name}" ${e.date}${time} (${e.type})`
  })
  return `Today is ${today}.\n${lines.length ? `The user's events:\n${lines.join("\n")}` : "The user has no events."}`
}

async function extract(text: string, events: ContextEvent[], today: string) {
  return extractJson<EventExtraction>({
    instructions: INSTRUCTIONS,
    data: describe(events, today),
    input: text,
    schema: {
      type: "object",
      properties: {
        op: { type: "string", enum: OPS },
        event: enumWithNone(
          events.map((e) => e.name),
          NO_EVENT
        ),
        name: { type: "string", maxLength: 40 },
        date: { type: "string", maxLength: 40 },
        start: { type: "string", maxLength: 5 },
        end: { type: "string", maxLength: 5 },
        type: { type: "string", enum: TYPES },
      },
      required: ["op", "event", "name", "date", "start", "end", "type"],
      additionalProperties: false,
    },
    maxTokens: 96,
  })
}

function nameProblem(name: string): string | null {
  if (!name) return "What should the event be called?"
  if (name.length < NAME_MIN) return `Event names need at least ${NAME_MIN} characters.`
  if (name.length > NAME_MAX) return `Event names can be at most ${NAME_MAX} characters.`
  return null
}

/** Start/end from the extraction. An end without a start is ignored; a start alone gets an hour. */
function timesFrom(e: EventExtraction): { start: string; end: string } | null {
  const start = parseTime(e.start)
  if (!start) return null
  let end = parseTime(e.end)
  if (!end || end <= start) end = addMinutes(start, 60)
  return { start, end }
}

const sayTimes = (t: { start: string; end: string }) =>
  `from ${sayTime(t.start)} to ${sayTime(t.end)}`

/**
 * The event they mean. Several events can share a name (a weekly "Gym"), so
 * use the day they said if any, else the next one from today, else the latest.
 */
function pickEvent(
  text: string,
  events: ContextEvent[],
  e: EventExtraction,
  today: string,
  dateIsTarget: boolean,
  otherNames: string[]
): ContextEvent | null {
  // Only an event the user actually named: the model sometimes picks one
  // anyway ("move it to monday").
  let candidates = events.filter((ev) => ev.name === e.event)
  const pick = candidates[0]
  if (!pick || !nameMentioned(text, pick.name, EVENT_FILLER)) return null
  // A shared word isn't enough when they fully named a list or schedule
  // ("rename claude chores" with an event "Claude demo").
  if (
    !nameFullyMentioned(text, pick.name, EVENT_FILLER) &&
    otherNames.some((n) => nameFullyMentioned(text, n))
  ) {
    return null
  }
  if (!dateIsTarget) {
    const day = parseDatePhrase(e.date, today)
    const onDay = day ? candidates.filter((ev) => ev.date === day) : []
    if (onDay.length) candidates = onDay
  }
  const upcoming = candidates
    .filter((ev) => ev.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
  if (upcoming.length) return upcoming[0]!
  return [...candidates].sort((a, b) => b.date.localeCompare(a.date))[0]!
}

/**
 * The operation the wording makes clear, if any. Small models often mix these
 * up ("make the dentist all day" as set_time), so clear wording wins. Only
 * used once the model has said the request is about events at all, so "add
 * milk to groceries" never becomes an event.
 */
export function opFromWording(text: string): Op | null {
  const t = normalize(text)
  if (/\ball day\b/.test(t)) return "clear_time"
  if (/\brename\b/.test(t)) return "rename"
  if (/\b(cancel|delete|remove)\b/.test(t)) return "delete"
  if (/\b(move|reschedule|postpone|push back|push)\b/.test(t)) return "reschedule"
  if (/^(please )?(remind me|add|put|book|plan|create|schedule|new)\b/.test(t)) return "create"
  if (/^(please )?(make|set|change)\b.*\b(at|from|to) \d/.test(t)) return "set_time"
  return null
}

/**
 * Turn the model's extraction into a reply and actions. Pure, so it can be
 * tested without the model. Returns null when it isn't an event operation.
 * `otherNames` are the user's lists and schedules, to tell when a request is
 * really about one of those.
 */
export function planEventOp(
  text: string,
  events: ContextEvent[],
  today: string,
  extraction: EventExtraction,
  otherNames: string[] = []
): ToolResult | null {
  if (extraction.op === "none") return null
  // "rename the chores schedule", "pin the costco list": for another tool.
  const t = normalize(text)
  if (/\b(schedules?|lists?)\b/.test(t) && !EVENT_WORDS.test(t)) return null
  const e = { ...extraction, op: opFromWording(text) ?? extraction.op }

  if (e.op === "create") {
    const name = capitalize(cleanSpoken(e.name))
    const problem = nameProblem(name)
    if (problem) return { response: problem }
    const date = parseDatePhrase(e.date, today)
    if (!date) return { response: `What day is ${name}?` }
    if (events.some((ev) => ev.date === date && normalize(ev.name) === normalize(name))) {
      return { response: `You already have ${name} ${onDate(date, today)}.` }
    }
    const times = timesFrom(e)
    const type = TYPES.includes(e.type) ? e.type : "Event"
    return {
      response: `Added ${name} ${onDate(date, today)}${times ? ` ${sayTimes(times)}` : ""}.`,
      actions: [
        {
          type: "event.create",
          name,
          date,
          eventType: type,
          ...(times && { startTime: times.start, endTime: times.end }),
        },
      ],
    }
  }

  // No event they named: let the next tool try ("rename groceries", "delete the
  // milk"), unless they clearly meant an event.
  const event = pickEvent(text, events, e, today, e.op === "reschedule", otherNames)
  if (!event) {
    if (!EVENT_WORDS.test(normalize(text))) return null
    return { response: "Which event?" }
  }
  const when = onDate(event.date, today)

  switch (e.op) {
    case "rename": {
      const name = capitalize(cleanSpoken(e.name))
      const problem = nameProblem(name)
      if (problem) return { response: problem }
      if (normalize(name) === normalize(event.name))
        return { response: `It's already called ${event.name}.` }
      return {
        response: `Renamed ${event.name} ${when} to ${name}.`,
        actions: [{ type: "event.update", eventId: event.id, name }],
      }
    }

    case "reschedule": {
      const date = parseDatePhrase(e.date, today)
      if (!date) return { response: `What day should ${event.name} move to?` }
      const times = timesFrom(e)
      if (date === event.date && !times) return { response: `${event.name} is already ${when}.` }
      return {
        response: `Moved ${event.name} to ${onDate(date, today).replace(/^on /, "")}${times ? ` ${sayTimes(times)}` : ""}.`,
        actions: [
          {
            type: "event.update",
            eventId: event.id,
            date,
            ...(times && { timed: true, startTime: times.start, endTime: times.end }),
          },
        ],
      }
    }

    case "set_time": {
      const times = timesFrom(e)
      if (!times) return { response: `What time is ${event.name}?` }
      return {
        response: `${event.name} ${when} is now ${sayTimes(times)}.`,
        actions: [
          {
            type: "event.update",
            eventId: event.id,
            timed: true,
            startTime: times.start,
            endTime: times.end,
          },
        ],
      }
    }

    case "clear_time": {
      if (!event.timed) return { response: `${event.name} is already all day.` }
      return {
        response: `${event.name} ${when} is now all day.`,
        actions: [{ type: "event.update", eventId: event.id, timed: false }],
      }
    }

    case "delete":
      return {
        response: `Deleted ${event.name} ${when}.`,
        actions: [{ type: "event.delete", eventId: event.id }],
      }

    default:
      return null
  }
}

export async function runEventTool(ctx: ToolContext): Promise<ToolResult | null> {
  const events = ctx.context?.events
  const today = ctx.context?.today
  if (!events || !today)
    return { response: "I can only change your events when you ask from Suitey." }
  const otherNames = [
    ...(ctx.context?.lists ?? []).map((l) => l.name),
    ...(ctx.context?.schedules ?? []).map((s) => s.name),
  ]
  return planEventOp(
    ctx.rawInput,
    events,
    today,
    await extract(ctx.rawInput, events, today),
    otherNames
  )
}

const WEEKDAY = "(mon|tues?|wed(nes)?|thu(rs)?|fri|sat(ur)?|sun)(day)?"

export const eventTool: AssistantTool = {
  id: "event",
  rules: [
    {
      type: "regex",
      pattern: "\\b(events?|calendar|appointments?|meetings?|reminders?|remind me)\\b",
    },
    { type: "regex", pattern: "\\b(reschedule|postpone|push back|move)\\b" },
    { type: "regex", pattern: "\\b(cancel)\\b" },
    // "rename the dentist to dr smith", "make gym from 6 to 7", "make the dentist all day".
    // Also catches list requests; the tool returns null unless an event is named.
    { type: "regex", pattern: "\\b(rename)\\b" },
    { type: "regex", pattern: "\\ball day\\b" },
    { type: "regex", pattern: "\\b(make|set|change)\\b.*\\b(at|from) \\d" },
    // "add dentist on friday at 3", "put lunch with sam tomorrow"
    {
      type: "regex",
      pattern: `\\b(add|put|book|plan)\\b.*\\b(today|tonight|tomorrow|${WEEKDAY}|next week|(at|from) \\d)\\b`,
    },
  ],
  run: runEventTool,
}
