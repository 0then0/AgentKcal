import { homedir } from "node:os";
import { join } from "node:path";
import { object, type UsageEvent, usageEvent } from "../models.ts";
import { type Adapter, jsonLines, stem } from "./base.ts";

export class ClaudeAdapter implements Adapter {
  readonly name = "claude";
  readonly title = "Claude Code";
  readonly mode = "Local JSONL";
  readonly patterns = ["**/*.jsonl"];
  defaultRoots(): string[] {
    return [join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "projects")];
  }
  read(path: string): UsageEvent[] {
    const events = new Map<string, UsageEvent>();
    for (const row of jsonLines(path)) {
      const message = object(row.message ?? {});
      if (row.type !== "assistant" || !message.usage) continue;
      const usage = object(message.usage);
      const event = usageEvent({
        agent: this.name,
        event_id: message.id,
        session_id: row.sessionId || stem(path),
        timestamp: row.timestamp,
        model: message.model || "unknown",
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cache_read_tokens: usage.cache_read_input_tokens,
        cache_write_tokens: usage.cache_creation_input_tokens,
      });
      // Streaming snapshots share an ID: the final snapshot replaces earlier ones.
      events.set(event.event_id, event);
    }
    return [...events.values()];
  }
}
