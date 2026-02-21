export function parseTimeoutMs(input: string | undefined, fallback: number): number {
  const n = Number(input)
  if (!Number.isFinite(n) || n <= 0) {
    return fallback
  }
  return Math.round(n)
}

export function parseBooleanEnv(input: string | undefined, fallback: boolean): boolean {
  if (!input) return fallback
  const normalized = input.trim().toLowerCase()
  if (["1", "true", "yes", "on"].includes(normalized)) return true
  if (["0", "false", "no", "off"].includes(normalized)) return false
  return fallback
}

export function parseSoxSilenceLevel(input: string | undefined, fallback: string): string {
  if (!input) return fallback
  const value = input.trim().toLowerCase()
  if (/^-?\d+(\.\d+)?(%|d)$/.test(value)) {
    return value
  }
  if (/^\d+(\.\d+)?$/.test(value)) {
    return `${value}%`
  }
  return fallback
}
