import { describe, expect, it } from "bun:test"
import type { ContextList } from "../help/actions.ts"
import { selectToolMatches } from "../help/matcher.ts"
import { normalize } from "../help/text.ts"
import { TOOLS } from "../help/tools/index.ts"
import {
  type ListExtraction,
  listTypeFrom,
  planListOp,
  stripKindWords,
  titleCase,
} from "../help/tools/list.ts"
import type { ToolContext } from "../help/types.ts"

function ctx(rawInput: string): ToolContext {
  return { rawInput, normalizedInput: normalize(rawInput) }
}

const matchedIds = (text: string) => selectToolMatches(TOOLS, ctx(text)).map((m) => m.tool.id)

const item = (id: string, name: string, checked = false) => ({ id, name, quantity: 1, checked })

const groceries: ContextList = {
  id: "g",
  name: "Grocery List",
  type: "Shopping",
  pinned: true,
  items: [item("1", "milk", true), item("2", "eggs", true), item("3", "bread")],
}
const costco: ContextList = { id: "c", name: "Costco", type: "Shopping", pinned: false, items: [] }
const notes: ContextList = { id: "n", name: "Notes", type: "Free", pinned: false }
const lists = [groceries, costco, notes]

const op = (o: ListExtraction["op"], list = "none", name = ""): ListExtraction => ({
  op: o,
  list,
  name,
})

describe("list tool matching", () => {
  it.each([
    "make a costco shopping list",
    "create a new checklist called chores",
    "start a list for the party",
    "rename groceries to trader joes",
    "pin the costco list",
    "unpin groceries",
    "clear the checked items off groceries",
    "delete the costco list",
  ])("routes %p to the list tool first", (text) => {
    // The event and schedule tools see some of these first ("rename ...") and
    // pass on them unless an event or schedule is named.
    expect(matchedIds(text).filter((id) => id !== "event" && id !== "schedule")[0]).toBe("list")
  })

  it("lets list-item have a turn after the list tool for item removals", () => {
    expect(matchedIds("remove eggs from the costco list")).toEqual(["list", "list-item"])
  })

  it.each([
    "add milk to my grocery list",
    "check off candy",
    "Put a dozen eggs on the Costco list.",
    "what time is it",
  ])("does not route %p to the list tool", (text) => {
    expect(matchedIds(text)).not.toContain("list")
  })
})

describe("listTypeFrom", () => {
  it("picks the type from how they described it", () => {
    expect(listTypeFrom("make a costco shopping list")).toBe("Shopping")
    expect(listTypeFrom("start a grocery list")).toBe("Shopping")
    expect(listTypeFrom("make a notes list called ideas")).toBe("Free")
    expect(listTypeFrom("create a checklist called chores")).toBe("Check")
    expect(listTypeFrom("make a list called party")).toBe("Check")
  })
})

describe("stripKindWords", () => {
  it("drops trailing list-kind words but keeps one word", () => {
    expect(stripKindWords("Target shopping")).toBe("Target")
    expect(stripKindWords("party shopping list")).toBe("party")
    expect(stripKindWords("weekend chores")).toBe("weekend chores")
    expect(stripKindWords("notes")).toBe("notes")
  })
})

describe("titleCase", () => {
  it("capitalizes each word", () => {
    expect(titleCase("weekend  chores")).toBe("Weekend Chores")
  })
})

describe("planListOp", () => {
  it("returns null for anything that isn't a list operation", () => {
    expect(planListOp("add milk to groceries", lists, op("none", "Grocery List"))).toBeNull()
  })

  describe("create", () => {
    it("makes a list with the type they said", () => {
      expect(planListOp("make a costco shopping list", [], op("create", "none", "target"))).toEqual(
        {
          response: "Made a shopping list called Target.",
          actions: [{ type: "list.create", name: "Target", listType: "Shopping" }],
        }
      )
    })

    it("defaults to a checklist", () => {
      const r = planListOp(
        "create a list called weekend chores",
        lists,
        op("create", "none", "weekend chores")
      )
      expect(r?.actions).toEqual([
        { type: "list.create", name: "Weekend Chores", listType: "Check" },
      ])
    })

    it("refuses duplicates and bad names", () => {
      expect(
        planListOp("make a costco list", lists, op("create", "none", "costco"))?.response
      ).toBe("You already have a list called Costco.")
      expect(planListOp("make a list", lists, op("create", "none", "ab"))?.actions).toBeUndefined()
      expect(
        planListOp("make a list", lists, op("create", "none", "a really very long list name"))
          ?.actions
      ).toBeUndefined()
    })
  })

  it("renames a list they named", () => {
    expect(
      planListOp(
        "rename groceries to trader joes",
        lists,
        op("rename", "Grocery List", "trader joes")
      )
    ).toEqual({
      response: "Renamed Grocery List to Trader Joes.",
      actions: [{ type: "list.rename", listId: "g", name: "Trader Joes" }],
    })
  })

  it("asks which list when they didn't name one", () => {
    const r = planListOp("pin my list", lists, op("pin", "Costco"))
    expect(r?.response).toStartWith("Which list?")
    expect(r?.actions).toBeUndefined()
  })

  it("doesn't fall back to the only list when they didn't say list", () => {
    const r = planListOp("rename dentist to doctor", [costco], op("rename", "Costco", "doctor"))
    expect(r?.actions).toBeUndefined()
    expect(r?.response).toStartWith("Which list?")
  })

  it("uses the only list when there is just one", () => {
    expect(planListOp("pin my list", [costco], op("pin", "Costco"))?.actions).toEqual([
      { type: "list.pin", listId: "c", pinned: true },
    ])
  })

  it("pins and unpins, skipping no-ops", () => {
    expect(planListOp("pin costco", lists, op("pin", "Costco"))?.actions).toEqual([
      { type: "list.pin", listId: "c", pinned: true },
    ])
    expect(planListOp("pin groceries", lists, op("pin", "Grocery List"))).toEqual({
      response: "Grocery List is already pinned.",
    })
  })

  it("clears checked items", () => {
    expect(
      planListOp("clear checked off groceries", lists, op("clear_checked", "Grocery List"))
    ).toEqual({
      response: "Cleared 2 checked items from Grocery List.",
      actions: [{ type: "list.clearChecked", listId: "g" }],
    })
    expect(
      planListOp("clear costco", lists, op("clear_checked", "Costco"))?.actions
    ).toBeUndefined()
    expect(planListOp("clear notes", lists, op("clear_checked", "Notes"))?.actions).toBeUndefined()
  })

  describe("delete", () => {
    it("deletes an empty list", () => {
      expect(planListOp("delete the costco list", lists, op("delete", "Costco"))).toEqual({
        response: "Deleted Costco.",
        actions: [{ type: "list.delete", listId: "c" }],
      })
    })

    it("refuses a list with items", () => {
      expect(planListOp("delete the grocery list", lists, op("delete", "Grocery List"))).toEqual({
        response: "Grocery List has 3 items, so delete it in Suitey.",
      })
    })

    it("falls through for item removals and unnamed lists", () => {
      expect(
        planListOp("remove eggs from the costco list", lists, op("delete", "Costco"))
      ).toBeNull()
      expect(planListOp("delete my list", [costco], op("delete", "Costco"))).toBeNull()
    })
  })
})
