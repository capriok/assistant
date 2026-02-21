export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .trim()
}

export function normalizeAlpha(text: string): string {
  return text.toLowerCase().replace(/[^a-z]/g, "")
}
