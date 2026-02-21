import type { AssistantTool } from "./.types.ts"
import { jokeTool } from "./joke.ts"
import { timeTool } from "./time.ts"

export const TOOLS: AssistantTool[] = [timeTool, jokeTool]

export function match() {}
