import { describe, expect, it } from "bun:test"
import type { ContextList } from "../help/actions.ts"
import { selectTool } from "../help/matcher.ts"
import { normalize } from "../help/text.ts"
import { TOOLS } from "../help/tools/index.ts"
import {
  type Extraction,
  findItems,
  listMentioned,
  planListOps,
  runListItemTool,
} from "../help/tools/list-item.ts"
import type { ToolContext } from "../help/types.ts"

function ctx(rawInput: string, lists?: ContextList[]): ToolContext {
  return {
    rawInput,
    normalizedInput: normalize(rawInput),
    context: lists ? { lists } : undefined,
  }
}

const item = (id: string, name: string, quantity = 1, checked = false) => ({
  id,
  name,
  quantity,
  checked,
})

describe("list-item tool matching", () => {
  it.each([
    "add 2 milk to groceries",
    "Put a dozen eggs on the Costco list.",
    "could you add three avocados to my grocery list please",
    "check off candy",
    "uncheck the milk",
    "make candy 3",
    "remove eggs from costco",
    "take bread off my list",
    "one less milk",
    "2 more eggs",
  ])("routes %p to the list-item tool", (text) => {
    expect(selectTool(TOOLS, ctx(text))?.id).toBe("list-item")
  })

  it.each([
    "what time is it",
    "tell me a joke",
    "how far is the moon",
  ])("does not route %p to the list-item tool", (text) => {
    expect(selectTool(TOOLS, ctx(text))?.id).not.toBe("list-item")
  })
})

describe("listMentioned", () => {
  it("matches loosely on word stems", () => {
    expect(listMentioned("add milk to groceries", "Grocery List")).toBe(true)
    expect(listMentioned("put eggs on the costco list", "Costco")).toBe(true)
    expect(listMentioned("add trash to Chores!", "Chores")).toBe(true)
  })

  it("ignores filler words like 'my list'", () => {
    expect(listMentioned("add bananas to my list", "Grocery List")).toBe(false)
    expect(listMentioned("add bananas to the list", "My List")).toBe(false)
  })
})

describe("findItems", () => {
  const lists: ContextList[] = [
    {
      id: "L1",
      name: "Grocery",
      items: [item("a", "candy"), item("b", "Eggs"), item("c", "peanut butter")],
    },
    { id: "L2", name: "Costco", items: [item("d", "eggs"), item("e", "berries")] },
  ]

  it("prefers exact matches", () => {
    expect(findItems(lists, "candy").map((f) => f.item.id)).toEqual(["a"])
  })

  it("matches plurals and case", () => {
    expect(findItems(lists, "candies").map((f) => f.item.id)).toEqual(["a"])
    expect(findItems(lists, "berry").map((f) => f.item.id)).toEqual(["e"])
  })

  it("returns every best match across lists", () => {
    expect(findItems(lists, "eggs").map((f) => f.item.id)).toEqual(["b", "d"])
  })

  it("falls back to partial word matches", () => {
    expect(findItems(lists, "peanut").map((f) => f.item.id)).toEqual(["c"])
    expect(findItems(lists, "pickles")).toEqual([])
  })
})

describe("runListItemTool without the model", () => {
  it("explains when there is no app context", async () => {
    const result = await runListItemTool(ctx("add milk to groceries"))
    expect(result?.actions ?? []).toEqual([])
    expect(result?.response).toContain("Suitey")
  })

  it("ignores free-form lists, which have no items", async () => {
    const result = await runListItemTool(
      ctx("add milk to notes", [{ id: "F", name: "Notes", type: "Free" }])
    )
    expect(result?.actions ?? []).toEqual([])
    expect(result?.response).toContain("don't have any lists with items")
  })
})

describe("planListOps (several operations in one request)", () => {
  const lists: ContextList[] = [
    { id: "G", name: "Grocery List", type: "Shopping", items: [item("candy", "Candy", 3)] },
    { id: "C", name: "Costco", type: "Shopping", items: [item("eggs", "Eggs", 24)] },
    { id: "H", name: "Chores", type: "Check", items: [] },
  ]
  const op = (o: Partial<Extraction>): Extraction => ({
    op: "add",
    list: "none",
    item: "",
    quantity: 0,
    ...o,
  })

  it("puts an unlisted add on the list the rest of the request used", () => {
    const result = planListOps("remove candy and add cookies", lists, [
      op({ op: "remove", item: "Candy" }),
      op({ op: "add", item: "cookies", quantity: 1 }),
    ])
    expect(result?.actions).toEqual([
      { type: "listItem.delete", itemId: "candy" },
      { type: "listItem.create", listId: "G", name: "cookies", quantity: 1 },
    ])
    expect(result?.response).toBe("Removed Candy from Grocery List. Added cookies to Grocery List.")
  })

  it("adds several items to a list named once", () => {
    const result = planListOps("add milk and 2 bread to costco", lists, [
      op({ item: "milk", list: "Costco", quantity: 1 }),
      op({ item: "bread", list: "Costco", quantity: 2 }),
    ])
    expect(result?.actions).toEqual([
      { type: "listItem.create", listId: "C", name: "milk", quantity: 1 },
      { type: "listItem.create", listId: "C", name: "bread", quantity: 2 },
    ])
    expect(result?.response).toBe("Added milk and 2 bread to Costco.")
  })

  it("does what it can and asks about the rest", () => {
    const result = planListOps("add milk and remove pickles", lists, [
      op({ item: "milk", quantity: 1 }),
      op({ op: "remove", item: "pickles" }),
    ])
    expect(result?.actions).toEqual([])
    expect(result?.response).toBe(
      "Which list should milk go on? You have Grocery List, Costco and Chores. I couldn't find pickles."
    )
  })

  it("ignores parts that aren't about lists", () => {
    expect(planListOps("make me a sandwich", lists, [op({ op: "none" })])).toBeNull()
    const result = planListOps("check off candy and tell me a joke", lists, [
      op({ op: "check", item: "Candy" }),
      op({ op: "none" }),
    ])
    expect(result?.actions).toEqual([{ type: "listItem.update", itemId: "candy", checked: true }])
  })
})
