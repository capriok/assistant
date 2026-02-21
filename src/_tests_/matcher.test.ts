import { describe, expect, it, mock } from "bun:test"
import { formatMatchedRule, selectTool, selectToolMatch } from "../help/matcher.ts"
import type { AssistantTool, ToolContext } from "../help/types.ts"

function ctx(rawInput: string, normalizedInput = rawInput.toLowerCase()): ToolContext {
  return { rawInput, normalizedInput }
}

function makeTool(id: string, props: Partial<AssistantTool> = {}): AssistantTool {
  return {
    id,
    rules: [],
    run: () => "",
    ...props,
  }
}

describe("selectTool", () => {
  it("uses first-match by tool declaration order", () => {
    const tools: AssistantTool[] = [
      makeTool("containsTime", { rules: [{ type: "contains", value: "time" }] }),
      makeTool("exactTime", { rules: [{ type: "exact", value: "what time is it" }] }),
    ]

    const selected = selectTool(tools, ctx("what time is it"))
    expect(selected?.id).toBe("containsTime")
  })

  it("uses case-insensitive regex by default", () => {
    const tools: AssistantTool[] = [
      makeTool("regexTool", { rules: [{ type: "regex", pattern: "\\btell me time\\b" }] }),
    ]

    const selected = selectTool(tools, ctx("Tell Me Time Please", "tell me time please"))
    expect(selected?.id).toBe("regexTool")
  })

  it("does not match partial word when regex uses boundaries", () => {
    const tools: AssistantTool[] = [
      makeTool("timeTool", { rules: [{ type: "regex", pattern: "\\btime\\b" }] }),
    ]

    const selected = selectTool(tools, ctx("what is 7776776 times 7"))
    expect(selected).toBeNull()
  })

  it("uses first-match by rule order inside a tool", () => {
    const tools: AssistantTool[] = [
      makeTool("time", {
        rules: [
          { type: "contains", value: "time" },
          { type: "exact", value: "what time is it" },
        ],
      }),
    ]

    const selected = selectToolMatch(tools, ctx("what time is it"))
    expect(selected?.matchedRule).toEqual({ type: "contains", value: "time" })
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

  it("returns winning rule details", () => {
    const tools: AssistantTool[] = [
      makeTool("time", {
        rules: [
          { type: "exact", value: "what time is it" },
          { type: "contains", value: "time" },
        ],
      }),
    ]
    const selected = selectToolMatch(tools, ctx("what time is it"))
    expect(selected?.matchedRule).toEqual({ type: "exact", value: "what time is it" })
    expect(selected ? formatMatchedRule(selected.matchedRule) : "").toBe('exact("what time is it")')
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
      [
        makeTool("badRegex", { rules: [{ type: "regex", pattern: "[" }] }),
        makeTool("fallback", { rules: [{ type: "contains", value: "anything" }] }),
      ],
      ctx("anything")
    )

    console.error = originalError
    expect(selected?.id).toBe("fallback")
    expect(spy).toHaveBeenCalled()
  })
})
