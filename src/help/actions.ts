// Contract between the assistant and the app that calls it (Suitey).
//
// The assistant is a stateless language service: it never touches app data.
// When a request should change something, a tool returns structured actions
// and the caller executes them with the signed-in user's permissions, then
// speaks `response` (or its own message if an action failed).
//
// Keep this file in sync with Suitey's next/src/lib/assistant/contract.ts.

/** An item on one of the user's lists. */
export type ContextItem = {
  id: string
  name: string
  quantity: number
  checked: boolean
}

/** A list the caller says the user can act on. */
export type ContextList = {
  id: string
  name: string
  type?: string
  pinned?: boolean
  items?: ContextItem[]
}

/** Dates are calendar days in the user's timezone, "YYYY-MM-DD". */
export type DayKey = string

/** The event types Suitey supports. */
export type EventType = "Event" | "Work" | "Reminder"

/** One of the user's events (recent and upcoming). */
export type ContextEvent = {
  id: string
  name: string
  date: DayKey
  type: string
  timed: boolean
  /** "HH:MM", 24-hour, when timed. */
  startTime?: string
  endTime?: string
}

/** The icons a schedule can have. Keep in sync with Suitey's schedule form. */
export const SCHEDULE_ICONS = [
  "sprout",
  "leaf",
  "mountain",
  "biohazard",
  "beef",
  "apple",
  "coffee",
  "pizza",
  "brain",
  "heart",
  "activity",
  "fingerprint",
  "key",
  "bell",
  "alarm",
  "dumbbell",
  "wrench",
  "shovel",
  "fuel",
  "cart",
] as const
export type ScheduleIcon = (typeof SCHEDULE_ICONS)[number]

/** A repeating schedule: due every `interval` days counting from `startDate`. */
export type ContextSchedule = {
  id: string
  name: string
  interval: number
  startDate: DayKey
  /** The next day it comes due (today or later). */
  nextDue: DayKey
  pinned: boolean
  icon: string
}

/** Extra data sent with a request: POST /chat { text, context }. */
export type AssistantContext = {
  /** Today in the user's timezone, so "tomorrow" and "Friday" resolve right. */
  today?: DayKey
  lists?: ContextList[]
  events?: ContextEvent[]
  schedules?: ContextSchedule[]
}

/** Add an item to one of the user's lists. */
export type ListItemCreateAction = {
  type: "listItem.create"
  listId: string
  name: string
  quantity: number
}

/**
 * Change an existing item. Only the fields present are changed, and only the
 * ones Suitey's list UI can edit: quantity (Shopping lists) and checked.
 */
export type ListItemUpdateAction = {
  type: "listItem.update"
  itemId: string
  quantity?: number
  checked?: boolean
}

/** Remove an item from its list. */
export type ListItemDeleteAction = {
  type: "listItem.delete"
  itemId: string
}

/** The list types Suitey supports. */
export type ListType = "Shopping" | "Check" | "Free"

/** Make a new, empty list. */
export type ListCreateAction = {
  type: "list.create"
  name: string
  listType: ListType
}

export type ListRenameAction = {
  type: "list.rename"
  listId: string
  name: string
}

export type ListPinAction = {
  type: "list.pin"
  listId: string
  pinned: boolean
}

/** Delete every checked item on a list. */
export type ListClearCheckedAction = {
  type: "list.clearChecked"
  listId: string
}

/** Delete a list. Suitey only allows this when the list is empty. */
export type ListDeleteAction = {
  type: "list.delete"
  listId: string
}

/** Add an event. Times are "HH:MM" (24-hour); omit both for an all-day event. */
export type EventCreateAction = {
  type: "event.create"
  name: string
  date: DayKey
  eventType: EventType
  startTime?: string
  endTime?: string
}

/**
 * Change an event. Only the fields present change. `timed: false` clears the
 * times; setting times makes it timed.
 */
export type EventUpdateAction = {
  type: "event.update"
  eventId: string
  name?: string
  date?: DayKey
  timed?: boolean
  startTime?: string
  endTime?: string
}

export type EventDeleteAction = {
  type: "event.delete"
  eventId: string
}

/** Start a repeating schedule, due every `interval` days from `startDate`. */
export type ScheduleCreateAction = {
  type: "schedule.create"
  name: string
  interval: number
  startDate: DayKey
  icon: ScheduleIcon
}

/** Change a schedule. Setting `startDate` to today restarts its countdown. */
export type ScheduleUpdateAction = {
  type: "schedule.update"
  scheduleId: string
  name?: string
  interval?: number
  startDate?: DayKey
}

export type SchedulePinAction = {
  type: "schedule.pin"
  scheduleId: string
  pinned: boolean
}

export type ScheduleDeleteAction = {
  type: "schedule.delete"
  scheduleId: string
}

export type AssistantAction =
  | EventCreateAction
  | EventUpdateAction
  | EventDeleteAction
  | ScheduleCreateAction
  | ScheduleUpdateAction
  | SchedulePinAction
  | ScheduleDeleteAction
  | ListItemCreateAction
  | ListItemUpdateAction
  | ListItemDeleteAction
  | ListCreateAction
  | ListRenameAction
  | ListPinAction
  | ListClearCheckedAction
  | ListDeleteAction

/** What a tool returns when it needs more than a spoken reply. */
export type ToolResult = {
  response: string
  actions?: AssistantAction[]
}

/** Response body of POST /chat. */
export type AssistantReply = {
  response: string
  actions: AssistantAction[]
}
