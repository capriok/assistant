const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses"
const DEFAULT_LOOKUP_MODEL = "gpt-4.1-mini"

type OpenAIResponseContent = {
  type?: string
  text?: string
}

type OpenAIResponseOutputItem = {
  content?: OpenAIResponseContent[]
}

type OpenAIResponseBody = {
  output_text?: string
  output?: OpenAIResponseOutputItem[]
}

function getOpenAiApiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) {
    throw new Error("OPENAI_API_KEY is not set")
  }
  return key
}

function extractOutputText(body: OpenAIResponseBody): string {
  const direct = body.output_text?.trim()
  if (direct) return direct

  const parts: string[] = []
  for (const item of body.output ?? []) {
    for (const content of item.content ?? []) {
      if ((content.type === "output_text" || content.type === "text") && content.text?.trim()) {
        parts.push(content.text.trim())
      }
    }
  }

  return parts.join("\n").trim()
}

export async function lookupWithOpenAI(query: string): Promise<string> {
  const trimmedQuery = query.trim()
  if (!trimmedQuery) {
    throw new Error("Query cannot be empty")
  }

  const apiKey = getOpenAiApiKey()
  const model = process.env.OPENAI_LOOKUP_MODEL?.trim() || DEFAULT_LOOKUP_MODEL

  const response = await fetch(OPENAI_RESPONSES_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      tools: [{ type: "web_search_preview" }],
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: trimmedQuery,
            },
          ],
        },
      ],
      max_output_tokens: 220,
      temperature: 0.2,
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`OpenAI HTTP ${response.status}: ${body}`)
  }

  const data = (await response.json()) as OpenAIResponseBody
  const text = extractOutputText(data)
  if (!text) {
    throw new Error("OpenAI returned an empty response")
  }
  return text
}
