// Contract between the assistant and the app that calls it (Suitey).
//
// The assistant is a stateless language service: it never touches app data.
// When a request should change something, a tool returns structured actions
// and the caller executes them with the signed-in user's permissions, then
// speaks `response` (or its own message if an action failed).
//
// Keep this file in sync with Suitey's next/src/lib/assistant/contract.ts.

/** An item on one of the user's lists. */
export type ContextItem = {
  id: string
  name: string
  quantity: number
  checked: boolean
}

/** A list the caller says the user can act on. */
export type ContextList = {
  id: string
  name: string
  type?: string
  pinned?: boolean
  items?: ContextItem[]
}

/** Extra data sent with a request: POST /chat { text, context }. */
export type AssistantContext = {
  lists?: ContextList[]
}

/** Add an item to one of the user's lists. */
export type ListItemCreateAction = {
  type: "listItem.create"
  listId: string
  name: string
  quantity: number
}

/**
 * Change an existing item. Only the fields present are changed, and only the
 * ones Suitey's list UI can edit: quantity (Shopping lists) and checked.
 */
export type ListItemUpdateAction = {
  type: "listItem.update"
  itemId: string
  quantity?: number
  checked?: boolean
}

/** Remove an item from its list. */
export type ListItemDeleteAction = {
  type: "listItem.delete"
  itemId: string
}

/** The list types Suitey supports. */
export type ListType = "Shopping" | "Check" | "Free"

/** Make a new, empty list. */
export type ListCreateAction = {
  type: "list.create"
  name: string
  listType: ListType
}

export type ListRenameAction = {
  type: "list.rename"
  listId: string
  name: string
}

export type ListPinAction = {
  type: "list.pin"
  listId: string
  pinned: boolean
}

/** Delete every checked item on a list. */
export type ListClearCheckedAction = {
  type: "list.clearChecked"
  listId: string
}

/** Delete a list. Suitey only allows this when the list is empty. */
export type ListDeleteAction = {
  type: "list.delete"
  listId: string
}

export type AssistantAction =
  | ListItemCreateAction
  | ListItemUpdateAction
  | ListItemDeleteAction
  | ListCreateAction
  | ListRenameAction
  | ListPinAction
  | ListClearCheckedAction
  | ListDeleteAction

/** What a tool returns when it needs more than a spoken reply. */
export type ToolResult = {
  response: string
  actions?: AssistantAction[]
}

/** Response body of POST /chat. */
export type AssistantReply = {
  response: string
  actions: AssistantAction[]
}
