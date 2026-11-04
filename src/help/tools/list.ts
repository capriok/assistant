import type { ContextList, ListType, ToolResult } from "../actions.ts"
import { normalize } from "../text.ts"
import type { AssistantTool, ToolContext } from "../types.ts"
import { cleanSpoken, enumWithNone, extractJson, joinNames, nameMentioned } from "./kit.ts"

// Operations on lists themselves (items are the list-item tool's job):
//   create, rename, pin/unpin, clear checked items, delete (empty lists only)
//
// One operation per request. Anything that isn't a list operation returns
// null so the request falls through to the list-item tool, then chat.

const NO_LIST = "none"

/** Suitey's list form allows 3 to 24 characters. */
export const NAME_MIN = 3
export const NAME_MAX = 24

const OPS = ["create", "rename", "pin", "unpin", "clear_checked", "delete", "none"] as const
type Op = (typeof OPS)[number]

export type ListExtraction = {
  op: Op
  /** The existing list they mean, or "none". */
  list: string
  /** create: the new list's name. rename: the new name. Otherwise "". */
  name: string
}

// Fixed text first so llama.cpp can reuse its cached prefix across requests.
const INSTRUCTIONS = [
  "Work out what the user wants to do to one of their lists as a whole, shown below.",
  "- op: create (make a new list), rename, pin, unpin, clear_checked (remove the checked-off",
  "  / done items from a list), delete (delete the whole list), or none. Use none when they",
  '  want to change items on a list ("remove eggs from the Costco list" is none,',
  '  "add milk to groceries" is none) or when it is not about lists at all.',
  `- list: the existing list they mean, matched loosely ("groceries" can mean "Grocery List"). Use "${NO_LIST}" for create, or if they named no list shown.`,
  "- name: create: the new list's name in their words, without words for the kind of list",
  '  ("make a Costco shopping list" is "Costco"; "create a list called weekend chores" is',
  '  "weekend chores"). rename: the new name. Otherwise "".',
].join("\n")

function describeLists(lists: ContextList[]): string {
  if (lists.length === 0) return "The user has no lists yet."
  const lines = lists.map((l) => {
    const details = [l.type, l.pinned ? "pinned" : ""].filter(Boolean).join(", ")
    return `- "${l.name}"${details ? ` (${details})` : ""}`
  })
  return `The user's lists:\n${lines.join("\n")}`
}

async function extract(text: string, lists: ContextList[]): Promise<ListExtraction> {
  return extractJson<ListExtraction>({
    instructions: INSTRUCTIONS,
    data: describeLists(lists),
    input: text,
    schema: {
      type: "object",
      properties: {
        op: { type: "string", enum: OPS },
        list: enumWithNone(
          lists.map((l) => l.name),
          NO_LIST
        ),
        name: { type: "string", maxLength: 40 },
      },
      required: ["op", "list", "name"],
      additionalProperties: false,
    },
    maxTokens: 64,
  })
}

/** The list type from how they described it. Check unless they said otherwise. */
export function listTypeFrom(text: string): ListType {
  const said = normalize(text)
  if (/\b(shopping|grocery|groceries)\b/.test(said)) return "Shopping"
  if (/\b(notes?|free ?form|free)\b/.test(said)) return "Free"
  return "Check"
}

const KIND_WORDS = new Set(["shopping", "checklist", "list", "notes", "todo"])

/**
 * Drop trailing words for the kind of list ("Target shopping list" → "Target"),
 * which the model sometimes leaves in. Keeps at least one word ("Notes").
 */
export function stripKindWords(name: string): string {
  const words = name.split(/\s+/).filter(Boolean)
  while (words.length > 1 && KIND_WORDS.has(normalize(words.at(-1) ?? ""))) words.pop()
  return words.join(" ")
}

/** "weekend chores" → "Weekend Chores" */
export function titleCase(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

function nameProblem(name: string): string | null {
  if (!name) return "What should the list be called?"
  if (name.length < NAME_MIN) return `List names need at least ${NAME_MIN} characters.`
  if (name.length > NAME_MAX) return `List names can be at most ${NAME_MAX} characters.`
  return null
}

const sameName = (a: string, b: string) => normalize(a) === normalize(b)

/**
 * Turn the model's extraction into a reply and actions. Pure, so it can be
 * tested without the model. Returns null when it isn't a list operation.
 */
export function planListOp(
  text: string,
  lists: ContextList[],
  e: ListExtraction
): ToolResult | null {
  if (e.op === "none") return null

  if (e.op === "create") {
    const name = titleCase(stripKindWords(cleanSpoken(e.name)))
    const problem = nameProblem(name)
    if (problem) return { response: problem }
    if (lists.some((l) => sameName(l.name, name))) {
      return { response: `You already have a list called ${name}.` }
    }
    const listType = listTypeFrom(text)
    const kind = { Shopping: "shopping list", Check: "checklist", Free: "notes list" }[listType]
    return {
      response: `Made a ${kind} called ${name}.`,
      actions: [{ type: "list.create", name, listType }],
    }
  }

  // Every other op acts on an existing list the user actually named. With a
  // single list there is nothing to ask about, except for delete.
  const picked = lists.find((l) => l.name === e.list)
  const named = picked && nameMentioned(text, picked.name) ? picked : undefined
  const only = lists.length === 1 && e.op !== "delete" ? lists[0] : undefined
  const list = named ?? only
  if (!list) {
    // "remove eggs from the list" can look like a delete; let list-item try.
    if (e.op === "delete") return null
    const which = lists.length ? ` You have ${joinNames(lists.map((l) => l.name))}.` : ""
    return { response: `Which list?${which}` }
  }

  switch (e.op) {
    case "rename": {
      const name = titleCase(cleanSpoken(e.name))
      const problem = nameProblem(name)
      if (problem) return { response: problem }
      if (sameName(name, list.name)) return { response: `It's already called ${list.name}.` }
      if (lists.some((l) => l.id !== list.id && sameName(l.name, name))) {
        return { response: `You already have a list called ${name}.` }
      }
      return {
        response: `Renamed ${list.name} to ${name}.`,
        actions: [{ type: "list.rename", listId: list.id, name }],
      }
    }

    case "pin":
    case "unpin": {
      const pinned = e.op === "pin"
      if (list.pinned === pinned) {
        return { response: `${list.name} is already ${pinned ? "pinned" : "unpinned"}.` }
      }
      return {
        response: `${pinned ? "Pinned" : "Unpinned"} ${list.name}.`,
        actions: [{ type: "list.pin", listId: list.id, pinned }],
      }
    }

    case "clear_checked": {
      if (!list.items) return { response: `${list.name} doesn't have items to clear.` }
      const count = list.items.filter((i) => i.checked).length
      if (count === 0) return { response: `Nothing is checked off on ${list.name}.` }
      return {
        response: `Cleared ${count} checked ${count === 1 ? "item" : "items"} from ${list.name}.`,
        actions: [{ type: "list.clearChecked", listId: list.id }],
      }
    }

    case "delete": {
      // "remove eggs from the Costco list" names a list too; that's an item.
      if (/\b(from|off)\b/.test(normalize(text))) return null
      const count = list.items?.length ?? 0
      if (count > 0) {
        return {
          response: `${list.name} has ${count} ${count === 1 ? "item" : "items"}, so delete it in Suitey.`,
        }
      }
      return {
        response: `Deleted ${list.name}.`,
        actions: [{ type: "list.delete", listId: list.id }],
      }
    }

    default:
      return null
  }
}

export async function runListTool(ctx: ToolContext): Promise<ToolResult | null> {
  const lists = ctx.context?.lists
  if (!lists) return { response: "I can only change your lists when you ask from Suitey." }
  return planListOp(ctx.rawInput, lists, await extract(ctx.rawInput, lists))
}

export const listTool: AssistantTool = {
  id: "list",
  rules: [
    // "make a Costco list", "create a new checklist called chores", "start a shopping list"
    { type: "regex", pattern: "\\b(create|make|start|new)\\b.*\\b(list|checklist)\\b" },
    { type: "regex", pattern: "\\brename\\b" },
    { type: "regex", pattern: "\\b(pin|unpin)\\b" },
    // "clear the checked items off groceries", "clean up the costco list"
    { type: "regex", pattern: "\\b(clear|empty|clean up|clean out)\\b" },
    // "delete the Costco list". Item removals like "remove eggs from the Costco list"
    // also match; the tool returns null for those and list-item takes over.
    { type: "regex", pattern: "\\b(delete|remove|get rid of|trash)\\b.*\\blist\\b" },
  ],
  run: runListTool,
}
