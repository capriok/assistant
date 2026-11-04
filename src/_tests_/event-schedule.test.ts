import { describe, expect, it } from "bun:test"
import type { ContextEvent, ContextSchedule } from "../help/actions.ts"
import { selectToolMatches } from "../help/matcher.ts"
import { normalize } from "../help/text.ts"
import { parseDatePhrase, parseTime, sayDate, sayTime } from "../help/tools/dates.ts"
import { type EventExtraction, opFromWording, planEventOp } from "../help/tools/event.ts"
import { TOOLS } from "../help/tools/index.ts"
import { nextDue, planScheduleOp, type ScheduleExtraction } from "../help/tools/schedule.ts"
import type { ToolContext } from "../help/types.ts"

// Wednesday.
const TODAY = "2026-11-04"

const ctx = (rawInput: string): ToolContext => ({ rawInput, normalizedInput: normalize(rawInput) })
const matchedIds = (text: string) => selectToolMatches(TOOLS, ctx(text)).map((m) => m.tool.id)

describe("parseDatePhrase", () => {
  it.each([
    ["today", "2026-11-04"],
    ["tonight", "2026-11-04"],
    ["tomorrow", "2026-11-05"],
    ["tomorrow morning", "2026-11-05"],
    ["the day after tomorrow", "2026-11-06"],
    ["friday", "2026-11-06"],
    ["on friday", "2026-11-06"],
    ["this friday", "2026-11-06"],
    ["wednesday", "2026-11-04"],
    ["next wednesday", "2026-11-11"],
    ["next friday", "2026-11-06"],
    ["monday", "2026-11-09"],
    ["in 3 days", "2026-11-07"],
    ["in two weeks", "2026-11-18"],
    ["a week from today", "2026-11-11"],
    ["next week", "2026-11-11"],
    ["november 20th", "2026-11-20"],
    ["Nov 20", "2026-11-20"],
    ["on the 20th of november", "2026-11-20"],
    ["20th november", "2026-11-20"],
    ["november twenty first", "2026-11-21"],
    ["march 3", "2027-03-03"],
    ["november 1st", "2027-11-01"],
    ["the 20th", "2026-11-20"],
    ["the 3rd", "2026-12-03"],
    ["11/20", "2026-11-20"],
    ["1/5/2027", "2027-01-05"],
    ["december 25 2027", "2027-12-25"],
    ["yesterday", "2026-11-03"],
    ["to the 20th", "2026-11-20"],
    ["2026-11-20", "2026-11-20"],
    ["to monday", "2026-11-09"],
  ])("%p → %p", (phrase, expected) => {
    expect(parseDatePhrase(phrase, TODAY)).toBe(expected)
  })

  it.each(["", "sometime", "february 30", "the 40th", "soon"])("%p is not a date", (phrase) => {
    expect(parseDatePhrase(phrase, TODAY)).toBeNull()
  })
})

describe("times", () => {
  it("parses spoken and 24-hour times", () => {
    expect(parseTime("15:00")).toBe("15:00")
    expect(parseTime("3pm")).toBe("15:00")
    expect(parseTime("3:30 PM")).toBe("15:30")
    expect(parseTime("12am")).toBe("00:00")
    expect(parseTime("noon")).toBe("12:00")
    expect(parseTime("")).toBeNull()
    expect(parseTime("25:00")).toBeNull()
  })

  it("says times and dates naturally", () => {
    expect(sayTime("15:30")).toBe("3:30 PM")
    expect(sayTime("09:00")).toBe("9 AM")
    expect(sayTime("00:00")).toBe("12 AM")
    expect(sayDate("2026-11-04", TODAY)).toBe("today")
    expect(sayDate("2026-11-05", TODAY)).toBe("tomorrow")
    expect(sayDate("2026-11-20", TODAY)).toBe("Friday, November 20")
    expect(sayDate("2027-01-05", TODAY)).toBe("Tuesday, January 5, 2027")
  })
})

describe("routing", () => {
  it.each([
    "add dentist on friday at 3pm",
    "put lunch with sam on my calendar tomorrow",
    "remind me to call mom tomorrow",
    "move the dentist appointment to monday",
    "cancel my meeting on thursday",
    "schedule a dentist appointment for the 20th",
    "make gym from 9 to 10:30am",
    "make the dentist all day",
    "rename the dentist to dr smith",
  ])("routes %p to the event tool first", (text) => {
    expect(matchedIds(text)[0]).toBe("event")
  })

  it.each([
    "water the plants every 3 days",
    "make a schedule to change the filter monthly",
    "pin the watering schedule",
    "i watered the plants",
    "reset the filter schedule",
  ])("routes %p to the schedule tool", (text) => {
    expect(matchedIds(text)).toContain("schedule")
    expect(matchedIds(text)[0]).not.toBe("list")
  })

  it.each([
    "add milk to my grocery list",
    "check off candy",
    "pin the costco list",
    "clear the checked items",
  ])("leaves %p to the list tools", (text) => {
    const ids = matchedIds(text)
    expect(ids).not.toContain("event")
    expect(ids).not.toContain("schedule")
  })
})

const ev = (
  id: string,
  name: string,
  date: string,
  extra: Partial<ContextEvent> = {}
): ContextEvent => ({
  id,
  name,
  date,
  type: "Event",
  timed: false,
  ...extra,
})

const events = [
  ev("d", "Dentist", "2026-11-06", { timed: true, startTime: "15:00", endTime: "16:00" }),
  ev("g1", "Gym", "2026-11-02"),
  ev("g2", "Gym", "2026-11-09"),
  ev("g3", "Gym", "2026-11-16"),
]

const eop = (
  op: EventExtraction["op"],
  fields: Partial<EventExtraction> = {}
): EventExtraction => ({
  op,
  event: "none",
  name: "",
  date: "",
  start: "",
  end: "",
  type: "Event",
  ...fields,
})

describe("planEventOp", () => {
  it("adds an all-day event on the spoken day", () => {
    const r = planEventOp(
      "add lunch with sam tomorrow",
      events,
      TODAY,
      eop("create", { name: "lunch with sam", date: "tomorrow" })
    )
    expect(r?.response).toBe("Added Lunch with sam tomorrow.")
    expect(r?.actions).toEqual([
      { type: "event.create", name: "Lunch with sam", date: "2026-11-05", eventType: "Event" },
    ])
  })

  it("adds a timed event, giving a lone start time an hour", () => {
    const r = planEventOp(
      "add haircut on the 20th at 3pm",
      events,
      TODAY,
      eop("create", { name: "haircut", date: "the 20th", start: "15:00" })
    )
    expect(r?.response).toBe("Added Haircut on Friday, November 20 from 3 PM to 4 PM.")
    expect(r?.actions?.[0]).toMatchObject({
      startTime: "15:00",
      endTime: "16:00",
      date: "2026-11-20",
    })
  })

  it("keeps reminders as reminders", () => {
    const r = planEventOp(
      "remind me to call mom friday",
      events,
      TODAY,
      eop("create", { name: "call mom", date: "friday", type: "Reminder" })
    )
    expect(r?.actions?.[0]).toMatchObject({ eventType: "Reminder", date: "2026-11-06" })
  })

  it("asks for a day instead of guessing", () => {
    expect(
      planEventOp("add a haircut", events, TODAY, eop("create", { name: "haircut" }))?.response
    ).toBe("What day is Haircut?")
  })

  it("refuses a duplicate on the same day and bad names", () => {
    expect(
      planEventOp(
        "add dentist friday",
        events,
        TODAY,
        eop("create", { name: "dentist", date: "friday" })
      )?.response
    ).toBe("You already have Dentist on Friday, November 6.")
    expect(
      planEventOp("add x friday", events, TODAY, eop("create", { name: "x", date: "friday" }))
        ?.actions
    ).toBeUndefined()
  })

  it("moves an event to another day", () => {
    const r = planEventOp(
      "move the dentist to monday",
      events,
      TODAY,
      eop("reschedule", { event: "Dentist", date: "monday" })
    )
    expect(r?.response).toBe("Moved Dentist to Monday, November 9.")
    expect(r?.actions).toEqual([{ type: "event.update", eventId: "d", date: "2026-11-09" }])
  })

  it("picks the next occurrence of a repeated name, or the one on the day they said", () => {
    const next = planEventOp("cancel gym", events, TODAY, eop("delete", { event: "Gym" }))
    expect(next?.actions).toEqual([{ type: "event.delete", eventId: "g2" }])
    expect(next?.response).toBe("Deleted Gym on Monday, November 9.")
    const onDay = planEventOp(
      "cancel gym on the 16th",
      events,
      TODAY,
      eop("delete", { event: "Gym", date: "the 16th" })
    )
    expect(onDay?.actions).toEqual([{ type: "event.delete", eventId: "g3" }])
  })

  it("sets and clears times", () => {
    const set = planEventOp(
      "make gym from 6 to 7am monday",
      events,
      TODAY,
      eop("set_time", { event: "Gym", date: "monday", start: "06:00", end: "07:00" })
    )
    expect(set?.actions).toEqual([
      { type: "event.update", eventId: "g2", timed: true, startTime: "06:00", endTime: "07:00" },
    ])
    const clear = planEventOp(
      "make the dentist all day",
      events,
      TODAY,
      eop("clear_time", { event: "Dentist" })
    )
    expect(clear?.actions).toEqual([{ type: "event.update", eventId: "d", timed: false }])
  })

  it("renames", () => {
    const r = planEventOp(
      "rename the dentist to dr smith",
      events,
      TODAY,
      eop("rename", { event: "Dentist", name: "dr smith" })
    )
    expect(r?.actions).toEqual([{ type: "event.update", eventId: "d", name: "Dr smith" }])
  })

  it("ignores an event the user didn't mention, and falls through on none", () => {
    expect(
      planEventOp(
        "move the appointment to monday",
        events,
        TODAY,
        eop("reschedule", { event: "Dentist", date: "monday" })
      )?.response
    ).toBe("Which event?")
    expect(planEventOp("add milk", events, TODAY, eop("none"))).toBeNull()
    expect(planEventOp("delete the milk", events, TODAY, eop("delete"))).toBeNull()
    // Naming no event (a list, say) leaves it for the next tool.
    expect(
      planEventOp(
        "rename groceries to costco",
        events,
        TODAY,
        eop("rename", { event: "Dentist", name: "costco" })
      )
    ).toBeNull()
  })
})

const sch = (
  id: string,
  name: string,
  interval: number,
  startDate: string,
  pinned = false
): ContextSchedule => ({
  id,
  name,
  interval,
  startDate,
  nextDue: nextDue(startDate, interval, TODAY),
  pinned,
  icon: "sprout",
})

const schedules = [
  sch("w", "Water plants", 3, "2026-11-01", true),
  sch("f", "Change filter", 30, "2026-10-20"),
]

const sop = (
  op: ScheduleExtraction["op"],
  fields: Partial<ScheduleExtraction> = {}
): ScheduleExtraction => ({
  op,
  schedule: "none",
  name: "",
  every_days: 0,
  date: "",
  icon: "sprout",
  ...fields,
})

describe("nextDue", () => {
  it("is the next interval boundary on or after today", () => {
    expect(nextDue("2026-11-01", 3, TODAY)).toBe("2026-11-04")
    expect(nextDue("2026-11-02", 3, TODAY)).toBe("2026-11-05")
    expect(nextDue("2026-11-04", 3, TODAY)).toBe("2026-11-07")
    expect(nextDue("2026-11-10", 7, TODAY)).toBe("2026-11-17")
  })
})

describe("planScheduleOp", () => {
  it("creates a schedule starting today", () => {
    const r = planScheduleOp(
      "feed the fish every 2 days",
      schedules,
      TODAY,
      sop("create", { name: "feed the fish", every_days: 2, icon: "heart" })
    )
    expect(r?.response).toBe(
      "Started Feed the fish every 2 days. It's next due Friday, November 6."
    )
    expect(r?.actions).toEqual([
      {
        type: "schedule.create",
        name: "Feed the fish",
        interval: 2,
        startDate: TODAY,
        icon: "heart",
      },
    ])
  })

  it("asks how often instead of guessing", () => {
    expect(
      planScheduleOp(
        "make a laundry schedule",
        schedules,
        TODAY,
        sop("create", { name: "laundry" })
      )?.response
    ).toBe("How often should Laundry repeat?")
  })

  it("restarts from today, or from the day they did it", () => {
    const now = planScheduleOp(
      "i watered the plants",
      schedules,
      TODAY,
      sop("restart", { schedule: "Water plants" })
    )
    expect(now?.actions).toEqual([{ type: "schedule.update", scheduleId: "w", startDate: TODAY }])
    expect(now?.response).toBe("Restarted Water plants. It's next due Saturday, November 7.")
    const earlier = planScheduleOp(
      "i changed the filter yesterday",
      schedules,
      TODAY,
      sop("restart", { schedule: "Change filter", date: "yesterday" })
    )
    expect(earlier?.actions).toEqual([
      { type: "schedule.update", scheduleId: "f", startDate: "2026-11-03" },
    ])
  })

  it("changes how often", () => {
    const r = planScheduleOp(
      "water the plants every week",
      schedules,
      TODAY,
      sop("set_interval", { schedule: "Water plants", every_days: 7 })
    )
    expect(r?.actions).toEqual([{ type: "schedule.update", scheduleId: "w", interval: 7 }])
  })

  it("pins, respecting the current state", () => {
    expect(
      planScheduleOp("pin the plants", schedules, TODAY, sop("pin", { schedule: "Water plants" }))
        ?.response
    ).toBe("Water plants is already pinned.")
    expect(
      planScheduleOp("pin the filter", schedules, TODAY, sop("pin", { schedule: "Change filter" }))
        ?.actions
    ).toEqual([{ type: "schedule.pin", scheduleId: "f", pinned: true }])
  })

  it("deletes only a schedule they named", () => {
    expect(
      planScheduleOp(
        "delete the filter schedule",
        schedules,
        TODAY,
        sop("delete", { schedule: "Change filter" })
      )?.actions
    ).toEqual([{ type: "schedule.delete", scheduleId: "f" }])
    expect(
      planScheduleOp("delete it", schedules, TODAY, sop("delete", { schedule: "Change filter" }))
    ).toBeNull()
  })
})

describe("opFromWording", () => {
  it.each([
    ["make claude test all day", "clear_time"],
    ["make gym from 9 to 10:30am", "set_time"],
    ["remind me to call mom tomorrow", "create"],
    ["add dentist on friday", "create"],
    ["move the dentist to monday", "reschedule"],
    ["cancel gym", "delete"],
    ["rename the dentist to dr smith", "rename"],
    ["what's on friday", null],
  ])("%p → %p", (text, op) => {
    expect(opFromWording(text)).toBe(op as ReturnType<typeof opFromWording>)
  })

  it("overrides the model's op only when it says this is about events", () => {
    const set = planEventOp(
      "make the dentist all day",
      events,
      TODAY,
      eop("set_time", { event: "Dentist" })
    )
    expect(set?.actions).toEqual([{ type: "event.update", eventId: "d", timed: false }])
    expect(planEventOp("add milk to groceries", events, TODAY, eop("none"))).toBeNull()
  })
})

describe("names that share a word", () => {
  const shared = [ev("demo", "Claude demo", "2026-11-09")]
  it("steps aside when they fully named a schedule that shares a word", () => {
    expect(
      planEventOp(
        "rename claude chores to claude tasks",
        shared,
        TODAY,
        eop("rename", { event: "Claude demo", name: "claude tasks" }),
        ["Claude chores"]
      )
    ).toBeNull()
    expect(
      planEventOp(
        "rename claude demo to claude tasks",
        shared,
        TODAY,
        eop("rename", { event: "Claude demo", name: "claude tasks" })
      )?.actions
    ).toEqual([{ type: "event.update", eventId: "demo", name: "Claude tasks" }])
  })

  it("leaves schedule and list requests to their tools", () => {
    expect(
      planEventOp(
        "rename claude demo schedule to x y z",
        shared,
        TODAY,
        eop("rename", { event: "Claude demo", name: "x y z" })
      )
    ).toBeNull()
  })
})
