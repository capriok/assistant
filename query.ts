import { readFileSync, existsSync } from "fs"

const ENDPOINT = "http://localhost:8000/completion"

const arg = process.argv[2]
let prompt: string

if (!arg) {
  // default: read from scribe.json
  const file = "scribe.json"
  if (!existsSync(file)) { console.error(`❌ File not found: ${file}`); process.exit(1) }
  const json = JSON.parse(readFileSync(file, "utf8"))
  if (!json.content) { console.error(`❌ No .content field in ${file}`); process.exit(1) }
  prompt = json.content
} else if (existsSync(arg)) {
  // arg is a file path
  const json = JSON.parse(readFileSync(arg, "utf8"))
  if (!json.content) { console.error(`❌ No .content field in ${arg}`); process.exit(1) }
  prompt = json.content
} else {
  // arg is the prompt string
  prompt = arg
}

const response = await fetch(ENDPOINT, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ prompt, n_predict: 200, temperature: 0.2 }),
})

const data = (await response.json()) as { content: string }

console.log("--------------------------------")
console.log("Query:")
console.log(prompt)
console.log("--------------------------------")
console.log("Response:")
console.log(data.content)
