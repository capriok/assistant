import { timingSafeEqual } from "node:crypto"
import type { AssistantContext } from "./help/actions.ts"
import { processInput } from "./help/route.ts"

const PORT = parseInt(process.env.ASSISTANT_HTTP_PORT ?? "3001", 10)
const HOST = process.env.ASSISTANT_HTTP_HOST ?? "127.0.0.1"
const TOKEN = process.env.ASSISTANT_TOKEN?.trim() ?? ""

function isAuthorized(req: Request): boolean {
  if (!TOKEN) return true
  const header = req.headers.get("authorization") ?? ""
  const given = Buffer.from(header)
  const expected = Buffer.from(`Bearer ${TOKEN}`)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "http://localhost:3000",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

Bun.serve({
  hostname: HOST,
  port: PORT,
  async fetch(req) {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    if (req.method !== "POST" || new URL(req.url).pathname !== "/chat") {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      })
    }

    if (!isAuthorized(req)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      })
    }

    let body: { text?: string; context?: AssistantContext }
    try {
      body = (await req.json()) as { text?: string; context?: AssistantContext }
    } catch {
      console.log("❌ Invalid JSON body")
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      })
    }

    const text = typeof body?.text === "string" ? body.text.trim() : ""
    if (!text) {
      console.log("❌ Missing or empty text")
      return new Response(JSON.stringify({ error: "Missing or empty text" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      })
    }

    console.log("--------------------------------")
    console.log("🗣 You said:", text)

    try {
      const reply = await processInput(text, body.context)
      console.log("🤖 Response:", reply.response)
      if (reply.actions.length > 0) console.log("⚡ Actions:", JSON.stringify(reply.actions))
      return new Response(JSON.stringify(reply), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      })
    } catch (err) {
      console.error("❌ HTTP server error:", err)
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      })
    }
  },
})

console.log(`Assistant HTTP server listening on http://${HOST}:${PORT}${TOKEN ? " (token required)" : ""}`)
