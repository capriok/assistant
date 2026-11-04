import { describe, expect, it } from "bun:test"
import {
  bestMatches,
  combineOutcomes,
  joinNames,
  nameMentioned,
  type Outcome,
} from "../help/tools/kit.ts"

describe("joinNames", () => {
  it("joins like speech", () => {
    expect(joinNames([])).toBe("")
    expect(joinNames(["a"])).toBe("a")
    expect(joinNames(["a", "b"])).toBe("a and b")
    expect(joinNames(["a", "b", "c"])).toBe("a, b and c")
  })
})

describe("nameMentioned", () => {
  it("matches stems and ignores filler", () => {
    expect(nameMentioned("add milk to groceries", "Grocery List")).toBe(true)
    expect(nameMentioned("add milk to my list", "Grocery List")).toBe(false)
  })
})

describe("bestMatches", () => {
  const events = [
    { id: 1, title: "Dentist" },
    { id: 2, title: "Dentist appointment" },
    { id: 3, title: "Soccer practice" },
  ]

  it("works on any shape and returns only the best tier", () => {
    expect(bestMatches(events, "dentist", (e) => e.title).map((e) => e.id)).toEqual([1])
    expect(bestMatches(events, "practice", (e) => e.title).map((e) => e.id)).toEqual([3])
    expect(bestMatches(events, "haircut", (e) => e.title)).toEqual([])
  })
})

describe("combineOutcomes", () => {
  const add = (part: string, list: string): Outcome => ({
    response: `Added ${part} to ${list}.`,
    action: { type: "listItem.create", listId: list, name: part, quantity: 1 },
    merge: { key: `add:${list}`, part, say: (parts) => `Added ${parts} to ${list}.` },
  })

  it("merges outcomes with the same key at the first one's position", () => {
    const result = combineOutcomes([
      add("milk", "Costco"),
      { response: "I couldn't find pickles." },
      add("bread", "Costco"),
      add("3 apples", "Costco"),
      add("sponges", "Chores"),
    ])
    expect(result.response).toBe(
      "Added milk, bread and 3 apples to Costco. I couldn't find pickles. Added sponges to Chores."
    )
    expect(result.actions).toHaveLength(4)
  })
})
