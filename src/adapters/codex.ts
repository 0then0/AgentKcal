import { homedir } from "node:os";
import { join } from "node:path";
import { count, object, text, type UsageEvent, usageEvent } from "../models.ts";
import { type Adapter, jsonLines, stem } from "./base.ts";

export class CodexAdapter implements Adapter {
  readonly name = "codex";
  readonly title = "Codex";
  readonly mode = "Local rollout JSONL";
  readonly patterns = ["**/rollout-*.jsonl"];
  defaultRoots(): string[] {
    const home = process.env.CODEX_HOME || join(homedir(), ".codex");
    return [join(home, "sessions"), join(home, "archived_sessions")];
  }
  read(path: string): UsageEvent[] {
    let session = stem(path),
      model: unknown = "unknown";
    let previous = [0, 0, 0, 0, 0];
    const events: UsageEvent[] = [];
    for (const row of jsonLines(path)) {
      const payload = object(row.payload ?? {});
      if (row.type === "session_meta") session = text(payload.id || session);
      if (row.type === "turn_context") model = payload.model || "unknown";
      if (row.type !== "event_msg" || payload.type !== "token_count") continue;
      const total = object(payload.info ?? {}).total_token_usage;
      if (!total) continue;
      const usage = object(total);
      const current = [
        "input_tokens",
        "cached_input_tokens",
        "cache_write_input_tokens",
        "output_tokens",
        "reasoning_output_tokens",
      ].map((key) => count(usage[key]));
      if (current.some((n, i) => n < (previous[i] ?? 0)))
        throw new Error("Codex cumulative counters decreased; unsupported reset, file skipped");
      const delta = current.map((n, i) => n - (previous[i] ?? 0));
      previous = current;
      if (!delta.some(Boolean)) continue;
      const [incoming = 0, read = 0, write = 0, output = 0, reasoning = 0] = delta;
      if (read + write > incoming || reasoning > output)
        throw new Error("inconsistent Codex usage buckets");
      events.push(
        usageEvent({
          agent: this.name,
          session_id: session,
          event_id: `${session}:${row.timestamp}:${current.join(":")}`,
          timestamp: row.timestamp,
          model,
          input_tokens: incoming - read - write,
          output_tokens: output - reasoning,
          cache_read_tokens: read,
          cache_write_tokens: write,
          reasoning_tokens: reasoning,
        }),
      );
    }
    return events;
  }
}
