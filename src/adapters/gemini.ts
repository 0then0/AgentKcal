import { homedir } from "node:os";
import { extname, join } from "node:path";
import { array, count, object, text, type UsageEvent, usageEvent } from "../models.ts";
import { type Adapter, jsonLines, readJson, stem } from "./base.ts";

export class GeminiAdapter implements Adapter {
  readonly name = "gemini";
  readonly title = "Gemini CLI";
  readonly mode = "Local session JSON / JSONL";
  readonly patterns = ["**/chats/session-*.json", "**/chats/session-*.jsonl"];
  defaultRoots(): string[] {
    return [join(homedir(), ".gemini/tmp")];
  }
  read(path: string): UsageEvent[] {
    let session: unknown = stem(path),
      rows: unknown[];
    if (extname(path) === ".jsonl") {
      const messages = new Map<string, unknown>();
      for (const row of jsonLines(path)) {
        session = row.sessionId || session;
        if (row.$set) {
          const set = object(row.$set);
          session = set.sessionId || session;
          for (const message of array(set.messages ?? []))
            messages.set(text(object(message).id), message);
        } else if (row.id && row.type === "gemini") messages.set(text(row.id), row);
      }
      // Content patches and rewinds do not undo inference already consumed.
      rows = [...messages.values()];
    } else {
      const data = object(readJson(path));
      session = data.sessionId;
      rows = array(data.messages);
    }
    return rows.flatMap((value) => {
      const row = object(value);
      if (row.type !== "gemini" || !row.tokens) return [];
      const usage = object(row.tokens),
        cached = count(usage.cached),
        incoming = count(usage.input);
      if (cached > incoming) throw new Error("Gemini cached tokens exceed input");
      return [
        usageEvent({
          agent: this.name,
          session_id: session,
          event_id: row.id,
          timestamp: row.timestamp,
          model: row.model || "unknown",
          input_tokens: incoming - cached + count(usage.tool),
          output_tokens: usage.output,
          cache_read_tokens: cached,
          reasoning_tokens: usage.thoughts,
        }),
      ];
    });
  }
}
