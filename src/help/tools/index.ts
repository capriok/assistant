import type { AssistantTool } from "../types.ts"
import { eventTool } from "./event.ts"
import { jokeTool } from "./joke.ts"
import { listTool } from "./list.ts"
import { listItemTool } from "./list-item.ts"
import { lookupTool } from "./lookup.ts"
import { scheduleTool } from "./schedule.ts"
import { timeTool } from "./time.ts"

// Order matters: a tool returning null passes the request to the next match.
// Events and schedules go before lists so "pin the watering schedule" or
// "delete the dentist appointment" never reach the list tools.
export const TOOLS: AssistantTool[] = [
  timeTool,
  jokeTool,
  eventTool,
  scheduleTool,
  listTool,
  listItemTool,
  lookupTool,
]
