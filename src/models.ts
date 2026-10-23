/** Adapter contract. Token buckets are disjoint; payloads never contain prompts. */
export const TOKEN_FIELDS = [
  "input_tokens",
  "output_tokens",
  "cache_read_tokens",
  "cache_write_tokens",
  "reasoning_tokens",
] as const;
export type TokenField = (typeof TOKEN_FIELDS)[number];
export type Tokens = Record<TokenField, number>;
export interface UsageEvent extends Tokens {
  agent: string;
  event_id: string;
  session_id: string;
  timestamp: string;
  model: string;
  gpu_seconds: number | null;
  gpu_watts: number | null;
}

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("expected an object");
  return value as Record<string, unknown>;
}
export function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("expected an array");
  return value;
}
export function text(value: unknown, name = "value"): string {
  if (typeof value !== "string" || !value.trim() || value.length > 512)
    throw new Error(`${name} must be a non-empty string of at most 512 characters`);
  return value;
}
export function count(value: unknown): number {
  if (value == null) return 0;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 1e15
  )
    throw new Error("token counts must be non-negative integers up to 10^15");
  return value;
}
export function timestamp(value: unknown): string {
  if (typeof value !== "number" && typeof value !== "string")
    throw new Error("timestamp is required");
  if (
    typeof value === "string" &&
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/.test(value)
  )
    throw new Error("timestamp needs an ISO date and timezone offset");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999)
    throw new Error("invalid timestamp");
  // Date.parse normalizes impossible calendar days; reject those before storing.
  if (typeof value === "string") {
    const day = Number(value.slice(8, 10));
    const month = Number(value.slice(5, 7));
    const year = Number(value.slice(0, 4));
    if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate())
      throw new Error("invalid timestamp");
  }
  return date.toISOString();
}
export function usageEvent(value: unknown): UsageEvent {
  const row = object(value);
  const allowed = new Set([
    "agent",
    "event_id",
    "session_id",
    "timestamp",
    "model",
    ...TOKEN_FIELDS,
    "gpu_seconds",
    "gpu_watts",
  ]);
  if (Object.keys(row).some((key) => !allowed.has(key)))
    throw new Error("unknown fields in normalized event");
  const gpu = (key: "gpu_seconds" | "gpu_watts") => {
    const n = row[key] ?? null;
    if (n !== null && (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 1e12))
      throw new Error(`${key} must be finite and non-negative`);
    return n as number | null;
  };
  const result: UsageEvent = {
    agent: text(row.agent, "agent"),
    event_id: text(row.event_id, "event_id"),
    session_id: text(row.session_id, "session_id"),
    timestamp: timestamp(row.timestamp),
    model: text(row.model === undefined ? "unknown" : row.model, "model"),
    input_tokens: count(row.input_tokens),
    output_tokens: count(row.output_tokens),
    cache_read_tokens: count(row.cache_read_tokens),
    cache_write_tokens: count(row.cache_write_tokens),
    reasoning_tokens: count(row.reasoning_tokens),
    gpu_seconds: gpu("gpu_seconds"),
    gpu_watts: gpu("gpu_watts"),
  };
  if ((result.gpu_seconds === null) !== (result.gpu_watts === null))
    throw new Error("gpu_seconds and gpu_watts must be supplied together");
  return result;
}
export function totalTokens(event: Tokens): number {
  return TOKEN_FIELDS.reduce((sum, key) => sum + event[key], 0);
}

/** Stable canonical JSON preserves Cursor import identities. */
export function canonical(value: Record<string, unknown>, ascii = false): string {
  let result = `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}: ${JSON.stringify(value[key])}`)
    .join(", ")}}`;
  if (ascii)
    result = result.replace(
      /[\u007f-\uffff]/g,
      (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
    );
  return result;
}
export function errorMessage(error: unknown): string {
  // JSON syntax diagnostics can quote private source contents in recent engines.
  return error instanceof SyntaxError
    ? "invalid JSON"
    : error instanceof Error
      ? error.message
      : "Operation failed";
}
