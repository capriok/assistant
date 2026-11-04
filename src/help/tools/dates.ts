import type { DayKey } from "../actions.ts"
import { normalize } from "../text.ts"

// Calendar-day math and spoken date/time phrases for the event and schedule
// tools. The model pulls the phrase out of the request ("next friday", "the
// 20th"); turning it into a date happens here, in code, because small models
// get date arithmetic wrong. All dates are "YYYY-MM-DD" days in the user's
// timezone (Suitey sends `today`), so no timezone math is needed here.

const DAY_MS = 86_400_000

const parseKey = (key: DayKey) => {
  const [y, m, d] = key.split("-").map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!))
}
const toKey = (date: Date): DayKey => date.toISOString().slice(0, 10)

export const isDayKey = (value: unknown): value is DayKey =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && toKey(parseKey(value)) === value

export const addDays = (key: DayKey, days: number): DayKey =>
  toKey(new Date(parseKey(key).getTime() + days * DAY_MS))

export const daysBetween = (from: DayKey, to: DayKey) =>
  Math.round((parseKey(to).getTime() - parseKey(from).getTime()) / DAY_MS)

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
]

const weekdayOf = (key: DayKey) => parseKey(key).getUTCDay()

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  couple: 2,
  few: 3,
}

const ORDINAL_WORDS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  eleventh: 11,
  twelfth: 12,
  thirteenth: 13,
  fourteenth: 14,
  fifteenth: 15,
  sixteenth: 16,
  seventeenth: 17,
  eighteenth: 18,
  nineteenth: 19,
  twentieth: 20,
  thirtieth: 30,
}

/** "3", "three", "20th", "twentieth", "twenty first" → number, else NaN. */
function wordNumber(word: string): number {
  const w = word.trim()
  const digits = w.match(/^(\d+)(st|nd|rd|th)?$/)
  if (digits) return Number(digits[1])
  if (w in NUMBER_WORDS) return NUMBER_WORDS[w]!
  if (w in ORDINAL_WORDS) return ORDINAL_WORDS[w]!
  const compound = w.match(/^(twenty|thirty)[ -](\w+)$/)
  if (compound) {
    const ones = ORDINAL_WORDS[compound[2]!] ?? NUMBER_WORDS[compound[2]!]
    if (ones && ones < 10) return (compound[1] === "twenty" ? 20 : 30) + ones
  }
  return Number.NaN
}

const DAY_NUMBER = "(\\d{1,2}(?:st|nd|rd|th)?|(?:twenty|thirty)[ -]\\w+|\\w+(?:st|nd|rd|th))"

/** A valid key for y-m-d, or null ("February 30" is null). */
function makeKey(year: number, month: number, day: number): DayKey | null {
  if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31)) return null
  const key = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  return isDayKey(key) ? key : null
}

/** Month/day with no year: this year, or next year if it has passed. */
function upcoming(today: DayKey, month: number, day: number): DayKey | null {
  const year = Number(today.slice(0, 4))
  const key = makeKey(year, month, day)
  if (key && key >= today) return key
  return makeKey(year + 1, month, day)
}

const monthIndex = (word: string) => {
  const w = word.slice(0, 3)
  return MONTHS.findIndex((m) => m.startsWith(w)) + 1
}

/**
 * A spoken date ("tomorrow", "next friday", "november 20th", "the 3rd",
 * "in 2 weeks", "11/20") as a day key, or null when it isn't one.
 * Bare weekdays mean the next one on or after today; "next friday" is the
 * next one after today. The reply always says the full date back.
 */
export function parseDatePhrase(phrase: string, today: DayKey): DayKey | null {
  // The prompt lists events by "YYYY-MM-DD", so the model sometimes answers in kind.
  const iso = phrase.trim()
  if (isDayKey(iso)) return iso
  let p = ` ${normalize(phrase).replace(/\s+/g, " ")} `
  // Filler that doesn't change the day. Repeat: adjacent fillers share a space.
  const filler = / (on|for|at|by|to|until|till|coming|the|of|morning|afternoon|evening|night|noon) /
  while (filler.test(p)) p = p.replace(filler, " ")
  p = p.trim()
  if (!p) return null

  if (/^(today|tonight|now)$/.test(p)) return today
  if (/^(tomorrow|tmrw|tomorrow night)$/.test(p)) return addDays(today, 1)
  if (/^day after tomorrow$/.test(p)) return addDays(today, 2)
  if (/^yesterday$/.test(p)) return addDays(today, -1)
  if (/^next week$/.test(p)) return addDays(today, 7)

  // "in 3 days", "in two weeks", "a week from today", "3 days from now"
  const rel =
    p.match(/^in (\w+) (day|days|week|weeks)$/) ??
    p.match(/^(\w+) (day|days|week|weeks) (from now|from today|later)$/)
  if (rel) {
    const n = wordNumber(rel[1]!)
    if (Number.isFinite(n)) return addDays(today, rel[2]!.startsWith("week") ? n * 7 : n)
  }
  if (/^in a week$|^a week from (now|today)$/.test(p)) return addDays(today, 7)

  // Weekdays: "friday", "this friday", "next friday"
  const wd = p.match(/^(this |next )?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\w*$/)
  if (wd) {
    const target = WEEKDAYS.findIndex((d) => d.startsWith(wd[2]!.slice(0, 3)))
    const ahead = (target - weekdayOf(today) + 7) % 7
    return addDays(today, wd[1] === "next " && ahead === 0 ? 7 : ahead)
  }

  // "11/20", "11/20/2027"
  const slash = phrase.match(/^\s*(?:on\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*$/)
  if (slash) {
    const [m, d] = [Number(slash[1]), Number(slash[2])]
    if (slash[3]) {
      const y = Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3])
      return makeKey(y, m, d)
    }
    return upcoming(today, m, d)
  }

  // "november 20th", "nov 20 2027", "20th november", "november twenty first"
  const monthFirst = p.match(new RegExp(`^([a-z]+) ${DAY_NUMBER}(?: (\\d{4}))?$`))
  const dayFirst = p.match(new RegExp(`^${DAY_NUMBER} ([a-z]+)(?: (\\d{4}))?$`))
  for (const [monthWord, dayWord, year] of [
    monthFirst ? [monthFirst[1], monthFirst[2], monthFirst[3]] : null,
    dayFirst ? [dayFirst[2], dayFirst[1], dayFirst[3]] : null,
  ].filter(Boolean) as string[][]) {
    const month = monthIndex(monthWord!)
    const day = wordNumber(dayWord!)
    if (month > 0 && monthWord!.length >= 3 && Number.isFinite(day)) {
      return year ? makeKey(Number(year), month, day) : upcoming(today, month, day)
    }
  }

  // "the 20th": this month, or next month if it has passed.
  const dom = p.match(new RegExp(`^${DAY_NUMBER}$`))
  if (dom) {
    const day = wordNumber(dom[1]!)
    if (Number.isFinite(day) && day >= 1 && day <= 31) {
      const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))]
      const thisMonth = makeKey(y, m, day)
      if (thisMonth && thisMonth >= today) return thisMonth
      return m === 12 ? makeKey(y + 1, 1, day) : makeKey(y, m + 1, day)
    }
  }

  return null
}

/** "HH:MM" 24-hour, or null. Accepts "15:00", "3:00 PM", "3pm", "noon". */
export function parseTime(value: string): string | null {
  const v = value.trim().toLowerCase().replace(/\./g, "")
  if (!v) return null
  if (v === "noon" || v === "midday") return "12:00"
  if (v === "midnight") return "00:00"
  const m = v.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/)
  if (!m) return null
  let h = Number(m[1])
  const min = Number(m[2] ?? 0)
  const mer = m[3]?.[0]
  if (mer === "p" && h < 12) h += 12
  if (mer === "a" && h === 12) h = 0
  if (h > 23 || min > 59) return null
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`
}

/** "15:30" + 60 → "16:30", capped at 23:59 so it stays on the same day. */
export function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number)
  const total = Math.min(23 * 60 + 59, h! * 60 + m! + minutes)
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
}

/** "15:30" → "3:30 PM", "09:00" → "9 AM" */
export function sayTime(time: string): string {
  const [h, m] = time.split(":").map(Number)
  const hour = h! % 12 === 0 ? 12 : h! % 12
  return `${hour}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h! < 12 ? "AM" : "PM"}`
}

/** "today", "tomorrow", or "Friday, November 20" (with the year if not this year). */
export function sayDate(key: DayKey, today: DayKey): string {
  const diff = daysBetween(today, key)
  if (diff === 0) return "today"
  if (diff === 1) return "tomorrow"
  if (diff === -1) return "yesterday"
  const d = parseKey(key)
  const weekday = WEEKDAYS[d.getUTCDay()]!
  const month = MONTHS[d.getUTCMonth()]!
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  const year = key.slice(0, 4) === today.slice(0, 4) ? "" : `, ${key.slice(0, 4)}`
  return `${cap(weekday)}, ${cap(month)} ${d.getUTCDate()}${year}`
}

/** "on Friday, November 20" / "today" — for "Added X ___". */
export const onDate = (key: DayKey, today: DayKey) => {
  const said = sayDate(key, today)
  return /^(today|tomorrow|yesterday)$/.test(said) ? said : `on ${said}`
}
