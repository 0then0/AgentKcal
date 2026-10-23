import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { array, canonical, count, object, type UsageEvent, usageEvent } from "../models.ts";
import { type Adapter, jsonLines, readJson } from "./base.ts";
import { parseCsv } from "./csv.ts";

abstract class ExportAdapter implements Adapter {
  abstract readonly name: string;
  abstract readonly title: string;
  abstract readonly mode: string;
  abstract readonly patterns: string[];
  defaultRoots(): string[] {
    return [];
  }
  abstract read(path: string): UsageEvent[];
}
export class OpenCodeAdapter extends ExportAdapter {
  readonly name = "opencode";
  readonly title = "OpenCode";
  readonly mode = "Session JSON export";
  readonly patterns = ["*.json"];
  read(path: string): UsageEvent[] {
    const data = object(readJson(path)),
      session = object(data.info).id;
    return array(data.messages).flatMap((message) => {
      const container = object(message),
        row = object(container.info ?? message),
        kind = row.role || row.type;
      if (!["assistant", "compaction"].includes(String(kind)) || !row.tokens) return [];
      const usage = object(row.tokens),
        cache = object(usage.cache ?? {}),
        time = object(row.time),
        model = object(row.model ?? {});
      return [
        usageEvent({
          agent: this.name,
          session_id: session,
          event_id: row.id,
          timestamp: time.completed || time.created,
          model: row.modelID || model.modelID || model.id || "unknown",
          input_tokens: usage.input,
          output_tokens: usage.output,
          reasoning_tokens: usage.reasoning,
          cache_read_tokens: cache.read,
          cache_write_tokens: cache.write,
        }),
      ];
    });
  }
}
export class ClineAdapter extends ExportAdapter {
  readonly name = "cline";
  readonly title = "Cline";
  readonly mode = "Task ui_messages.json";
  readonly patterns = ["**/ui_messages.json"];
  read(path: string): UsageEvent[] {
    return array(readJson(path)).flatMap((value) => {
      const row = object(value);
      if (row.type !== "say" || !["api_req_started", "subagent_usage"].includes(String(row.say)))
        return [];
      const usage = object(JSON.parse(typeof row.text === "string" && row.text ? row.text : "{}"));
      if (!["tokensIn", "tokensOut", "cacheWrites", "cacheReads"].some((key) => key in usage))
        return [];
      return [
        usageEvent({
          agent: this.name,
          session_id: basename(dirname(path)),
          event_id: String(row.ts),
          timestamp: row.ts,
          model: "unknown",
          input_tokens: usage.tokensIn,
          output_tokens: usage.tokensOut,
          cache_read_tokens: usage.cacheReads,
          cache_write_tokens: usage.cacheWrites,
        }),
      ];
    });
  }
}
export class CursorAdapter extends ExportAdapter {
  readonly name = "cursor";
  readonly title = "Cursor";
  readonly mode = "Usage CSV export";
  readonly patterns = ["*.csv"];
  read(path: string): UsageEvent[] {
    const [headers = [], ...rows] = parseCsv(readFileSync(path, "utf8"));
    const required = [
      "Date",
      "Model",
      "Input (w/o Cache Write)",
      "Input (w/ Cache Write)",
      "Cache Read",
      "Output Tokens",
    ];
    if (!required.every((key) => headers.includes(key)) || new Set(headers).size !== headers.length)
      throw new Error("unsupported Cursor CSV columns; see docs/adapters.md");
    const occurrences = new Map<string, number>();
    return rows.map((values) => {
      if (values.length !== headers.length)
        throw new Error("Cursor row has missing or extra columns");
      const row = Object.fromEntries(headers.map((key, i) => [key, values[i] ?? ""]));
      const identity = Object.fromEntries(
        [...required, "User"].map((key) => [key, row[key] ?? ""]),
      );
      const digest = createHash("sha256").update(canonical(identity, true)).digest("hex");
      const ordinal = (occurrences.get(digest) ?? 0) + 1;
      occurrences.set(digest, ordinal);
      const token = (key: string) => {
        const value = row[key]?.trim().replaceAll(",", "") ?? "";
        if (!/^\d+$/.test(value)) throw new Error(`Cursor row has missing or invalid ${key}`);
        return count(Number(value));
      };
      return usageEvent({
        agent: this.name,
        session_id: "cursor-csv",
        event_id: `${digest}:${ordinal}`,
        timestamp: row.Date,
        model: row.Model,
        input_tokens: token("Input (w/o Cache Write)"),
        cache_write_tokens: token("Input (w/ Cache Write)"),
        cache_read_tokens: token("Cache Read"),
        output_tokens: token("Output Tokens"),
      });
    });
  }
}
export class GenericAdapter extends ExportAdapter {
  readonly name = "generic";
  readonly title = "Universal JSONL";
  readonly mode = "Normalized event contract";
  readonly patterns = ["*.jsonl"];
  read(path: string): UsageEvent[] {
    return jsonLines(path).map(usageEvent);
  }
}
