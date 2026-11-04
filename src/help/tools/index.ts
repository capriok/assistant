import type { AssistantTool } from "../types.ts"
import { jokeTool } from "./joke.ts"
import { listTool } from "./list.ts"
import { listItemTool } from "./list-item.ts"
import { lookupTool } from "./lookup.ts"
import { timeTool } from "./time.ts"

export const TOOLS: AssistantTool[] = [timeTool, jokeTool, listTool, listItemTool, lookupTool]
