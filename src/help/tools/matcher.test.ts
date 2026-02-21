import { describe, expect, it, mock } from "bun:test"
import type { AssistantTool, ToolContext } from "./.types.ts"
import { formatMatchedRule, selectTool, selectToolMatch } from "./matcher.ts"

function ctx(rawInput: string, normalizedInput = rawInput.toLowerCase()): ToolContext {
  return { rawInput, normalizedInput }
}

function makeTool(id: string, props: Partial<AssistantTool> = {}): AssistantTool {
  return {
    id,
    run: () => "",
    ...props,
  }
}

describe("selectTool", () => {
  it("prefers exact over contains", () => {
    const tools: AssistantTool[] = [
      makeTool("containsTime", { rules: [{ type: "contains", value: "time" }] }),
      makeTool("exactTime", { rules: [{ type: "exact", value: "what time is it" }] }),
    ]

    const selected = selectTool(tools, ctx("what time is it"))
    expect(selected?.id).toBe("exactTime")
  })

  it("uses case-insensitive regex by default", () => {
    const tools: AssistantTool[] = [
      makeTool("regexTool", { rules: [{ type: "regex", pattern: "\\btell me time\\b" }] }),
    ]

    const selected = selectTool(tools, ctx("Tell Me Time Please", "tell me time please"))
    expect(selected?.id).toBe("regexTool")
  })

  it("resolves ties by tool priority", () => {
    const tools: AssistantTool[] = [
      makeTool("a", { priority: 0, rules: [{ type: "contains", value: "time" }] }),
      makeTool("b", { priority: 10, rules: [{ type: "contains", value: "time" }] }),
    ]

    const selected = selectTool(tools, ctx("time now"))
    expect(selected?.id).toBe("b")
  })

  it("resolves ties by tool declaration order when priority equal", () => {
    const tools: AssistantTool[] = [
      makeTool("first", { rules: [{ type: "contains", value: "time" }] }),
      makeTool("second", { rules: [{ type: "contains", value: "time" }] }),
    ]

    const selected = selectTool(tools, ctx("time now"))
    expect(selected?.id).toBe("first")
  })

  it("supports source raw rules", () => {
    const tools: AssistantTool[] = [
      makeTool("rawTool", {
        rules: [{ type: "contains", source: "raw", caseSensitive: true, value: "TIME" }],
      }),
    ]

    const selected = selectTool(tools, ctx("Tell me TIME", "tell me time"))
    expect(selected?.id).toBe("rawTool")
  })

  it("supports legacy match fallback", () => {
    const legacy = makeTool("legacy", { match: (text) => text.includes("legacy") })
    const selected = selectTool([legacy], ctx("legacy command"))
    expect(selected?.id).toBe("legacy")
  })

  it("returns winning rule details and score", () => {
    const tools: AssistantTool[] = [
      makeTool("time", {
        rules: [
          { type: "contains", value: "time" },
          { type: "exact", value: "what time is it" },
        ],
      }),
    ]
    const selected = selectToolMatch(tools, ctx("what time is it"))
    expect(selected?.score).toBe(100)
    expect(selected?.matchedRule).toEqual({ type: "exact", value: "what time is it" })
    expect(selected ? formatMatchedRule(selected.matchedRule) : "").toBe(
      'exact("what time is it")'
    )
  })

  it("returns null when no tool matches", () => {
    const selected = selectTool(
      [makeTool("time", { rules: [{ type: "contains", value: "time" }] })],
      ctx("weather")
    )
    expect(selected).toBeNull()
  })

  it("ignores invalid regex rules without throwing", () => {
    const spy = mock(() => {})
    const originalError = console.error
    console.error = spy

    const selected = selectTool(
      [makeTool("badRegex", { rules: [{ type: "regex", pattern: "[" }] })],
      ctx("anything")
    )

    console.error = originalError
    expect(selected).toBeNull()
    expect(spy).toHaveBeenCalled()
  })
})
