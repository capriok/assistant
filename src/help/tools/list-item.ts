import type { AssistantAction, ContextItem, ContextList, ToolResult } from "../actions.ts"
import type { AssistantTool, ToolContext } from "../types.ts"
import {
  bestMatches,
  capitalize,
  cleanSpoken,
  combineOutcomes,
  enumWithNone,
  extractJson,
  joinNames,
  nameMentioned,
  type Outcome,
} from "./kit.ts"

// Only what Suitey's list UI supports:
//   Shopping lists: add (with quantity), set quantity, check/uncheck, remove
//   Check lists:    add, check/uncheck, remove (no quantity)
//   Free lists:     a single markdown document, so no item operations

const NO_LIST = "none"
const MAX_ITEMS_IN_PROMPT = 60
const MAX_OPS = 8

const OPS = [
  "add",
  "set_quantity",
  "change_quantity",
  "check",
  "uncheck",
  "remove",
  "none",
] as const
type Op = (typeof OPS)[number]

export type Extraction = {
  op: Op
  list: string
  item: string
  quantity: number
}

type Found = { list: ContextList; item: ContextItem }

const hasItems = (list: ContextList) => list.type !== "Free"
const hasQuantity = (list: ContextList) => list.type === "Shopping"

/** Kept for tests and other tools: did the user say this list's name? */
export const listMentioned = nameMentioned

/** Items matching what the user said, best matches only. */
export function findItems(lists: ContextList[], spoken: string): Found[] {
  const all = lists.flatMap((list) => (list.items ?? []).map((item) => ({ list, item })))
  return bestMatches(all, spoken, (f) => f.item.name)
}

// Fixed text first so llama.cpp can reuse its cached prefix across requests.
const INSTRUCTIONS = [
  "Work out what the user wants to do to items on their lists, shown below.",
  "Return one entry per item, in the order they said them. One request can hold several",
  '("remove candy and add cookies" is two entries; "add milk and eggs to groceries" is two adds).',
  "For each entry:",
  "- op: add (a new item), set_quantity (to an amount), change_quantity (more or fewer by an amount;",
  '  "add 2 more candy" when candy is already listed is change_quantity),',
  "  check (tick off / mark done / cross off), uncheck, remove (delete / take off),",
  "  or none if this is not about list items at all.",
  `- list: the list they named for this item, matched loosely ("groceries" can mean "Grocery List"); a list named once can cover several items. Use "${NO_LIST}" if they named a list that isn't shown, or named none ("my list" and "the list" name none).`,
  "- item: for an existing item, its exact name as shown. For add, the new item in the words they used,",
  '  including plurals ("three avocados" is "avocados"), without the quantity or list name.',
  "- quantity: add: how many (1 if not said). set_quantity: the new amount. change_quantity: the amount to",
  '  change by, negative for fewer ("2 more" is 2, "one less" is -1). Otherwise 0. "a dozen" is 12.',
].join("\n")

function describeLists(lists: ContextList[]): string {
  const lines = lists.map((l) => {
    const items = (l.items ?? []).slice(0, MAX_ITEMS_IN_PROMPT).map((i) => {
      const details = [hasQuantity(l) ? `x${i.quantity}` : "", i.checked ? "checked" : ""]
        .filter(Boolean)
        .join(", ")
      return details ? `${i.name} (${details})` : i.name
    })
    return `- "${l.name}": ${items.length ? items.join(", ") : "empty"}`
  })
  return `The user's lists and their items:\n${lines.join("\n")}`
}

async function extract(text: string, lists: ContextList[]): Promise<Extraction[]> {
  const entry = {
    type: "object",
    properties: {
      op: { type: "string", enum: OPS },
      list: enumWithNone(
        lists.map((l) => l.name),
        NO_LIST
      ),
      item: { type: "string", maxLength: 80 },
      quantity: { type: "integer", minimum: -999, maximum: 999 },
    },
    required: ["op", "list", "item", "quantity"],
    additionalProperties: false,
  }
  const { requests } = await extractJson<{ requests: Extraction[] }>({
    instructions: INSTRUCTIONS,
    data: describeLists(lists),
    input: text,
    schema: {
      type: "object",
      properties: { requests: { type: "array", items: entry, minItems: 1, maxItems: MAX_OPS } },
      required: ["requests"],
      additionalProperties: false,
    },
    maxTokens: 64 + 48 * MAX_OPS,
  })
  return requests
}

/** An outcome plus the list it touched, so later adds can follow it. */
type ListOutcome = Outcome & { list?: ContextList }

function addItem(list: ContextList | undefined, lists: ContextList[], e: Extraction): ListOutcome {
  const name = cleanSpoken(e.item)
  if (!list) {
    const which = `You have ${joinNames(lists.map((l) => l.name))}.`
    return { response: name ? `Which list should ${name} go on? ${which}` : `Which list? ${which}` }
  }
  if (!name) return { response: `What should I add to ${list.name}?` }
  // Check lists have no quantity in the UI, so always 1 there.
  const quantity = hasQuantity(list) && e.quantity > 0 ? e.quantity : 1
  const part = quantity > 1 ? `${quantity} ${name}` : name
  return {
    response: `Added ${part} to ${list.name}.`,
    action: { type: "listItem.create", listId: list.id, name, quantity },
    merge: { key: `add:${list.id}`, part, say: (parts) => `Added ${parts} to ${list.name}.` },
    list,
  }
}

function changeItem({ list, item }: Found, e: Extraction): ListOutcome {
  const name = item.name
  let action: AssistantAction

  switch (e.op) {
    case "set_quantity":
    case "change_quantity": {
      if (!hasQuantity(list)) return { response: `${list.name} doesn't have quantities.`, list }
      if (e.op === "change_quantity" && e.quantity === 0) {
        return { response: `By how much should I change ${name}?`, list }
      }
      const quantity = Math.max(
        0,
        e.op === "set_quantity" ? e.quantity : item.quantity + e.quantity
      )
      action = { type: "listItem.update", itemId: item.id, quantity }
      return { response: capitalize(`${name} is now ${quantity}.`), action, list }
    }
    case "check":
    case "uncheck": {
      const checked = e.op === "check"
      const verb = checked ? "Checked off" : "Unchecked"
      action = { type: "listItem.update", itemId: item.id, checked }
      return {
        response: `${verb} ${name}.`,
        action,
        merge: { key: e.op, part: name, say: (parts) => `${verb} ${parts}.` },
        list,
      }
    }
    case "remove":
      action = { type: "listItem.delete", itemId: item.id }
      return {
        response: `Removed ${name} from ${list.name}.`,
        action,
        merge: {
          key: `remove:${list.id}`,
          part: name,
          say: (parts) => `Removed ${parts} from ${list.name}.`,
        },
        list,
      }
    default:
      return { response: "I'm not sure what to do with that." }
  }
}

/** Resolve an operation on an existing item (anything but add). */
function changeExisting(e: Extraction, lists: ContextList[], named?: ContextList): ListOutcome {
  const spoken = cleanSpoken(e.item)
  if (!spoken) return { response: "Which item?" }

  const found = findItems(named ? [named] : lists, spoken)
  const [first] = found
  if (!first) {
    return { response: `I couldn't find ${spoken}${named ? ` on ${named.name}` : ""}.` }
  }
  const onLists = [...new Set(found.map((f) => f.list.name))]
  if (onLists.length > 1) {
    return { response: `Which list? ${capitalize(first.item.name)} is on ${joinNames(onLists)}.` }
  }
  return changeItem(first, e)
}

/**
 * Turn the model's extracted operations into a reply and actions. Pure, so it
 * can be tested without the model. Returns null when nothing is about lists.
 */
export function planListOps(
  text: string,
  lists: ContextList[],
  extracted: Extraction[]
): ToolResult | null {
  const ops = extracted.filter((e) => e.op !== "none")
  if (ops.length === 0) return null

  // Trust the model's list only if the user actually said it; with a single
  // list there is nothing to ask about.
  const only = lists.length === 1 ? lists[0] : undefined
  const namedList = (e: Extraction) => {
    const picked = lists.find((l) => l.name === e.list)
    return picked && nameMentioned(text, picked.name) ? picked : undefined
  }
  const saysMore = /\bmore\b/i.test(text)

  // First pass: everything that can be resolved on its own.
  const outcomes: (ListOutcome | undefined)[] = ops.map((e) => {
    const named = namedList(e)
    const list = only ?? named

    if (e.op !== "add") return changeExisting(e, lists, named)

    // "add 2 more candy" when candy is already listed means more of it, even
    // if the model read it as a new item.
    if (saysMore) {
      const existing = findItems(list ? [list] : lists, cleanSpoken(e.item))
      const [one] = existing
      if (one && existing.length === 1) {
        return changeItem(one, { ...e, op: "change_quantity", quantity: Math.max(1, e.quantity) })
      }
    }
    return list ? addItem(list, lists, e) : undefined
  })

  // Second pass: an add with no list goes where the rest of the request went
  // ("remove candy and add cookies" puts cookies on candy's list).
  const anchor = outcomes.find((o) => o?.action && o.list)?.list
  return combineOutcomes(outcomes.map((o, i) => o ?? addItem(anchor, lists, ops[i] as Extraction)))
}

export async function runListItemTool(ctx: ToolContext): Promise<ToolResult | null> {
  const all = ctx.context?.lists
  if (!all) return { response: "I can only change your lists when you ask from Suitey." }

  const lists = all.filter(hasItems)
  if (lists.length === 0) {
    return { response: "You don't have any lists with items yet. Make one in Suitey first." }
  }

  return planListOps(ctx.rawInput, lists, await extract(ctx.rawInput, lists))
}

const VERBS = [
  "add",
  "put",
  "throw",
  "stick",
  "remove",
  "delete",
  "drop",
  "take",
  "check",
  "uncheck",
  "tick",
  "untick",
  "cross",
  "mark",
  "change",
  "set",
  "make",
  "update",
  "increase",
  "decrease",
  "bump",
].join("|")

export const listItemTool: AssistantTool = {
  id: "list-item",
  rules: [
    // "add 2 milk to groceries", "check off candy", "make candy 3", "remove eggs from costco".
    // Broad on purpose: the tool returns null for requests that aren't about lists.
    { type: "regex", pattern: `^(please |can you |could you |hey )?(${VERBS})\\b` },
    // "one less milk", "2 more eggs"
    {
      type: "regex",
      pattern: "^(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+) (more|less|fewer)\\b",
    },
  ],
  run: runListItemTool,
}
