import { processInput } from "./help/route.ts"

const PORT = parseInt(process.env.ASSISTANT_HTTP_PORT ?? "3001", 10)

const corsHeaders = {
  "Access-Control-Allow-Origin": "http://localhost:3000",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

Bun.serve({
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

    let body: { text?: string }
    try {
      body = (await req.json()) as { text?: string }
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
      const response = await processInput(text)
      console.log("🤖 Response:", response)
      return new Response(JSON.stringify({ response }), {
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

console.log(`Assistant HTTP server listening on http://localhost:${PORT}`)
