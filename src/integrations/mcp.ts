import type { Readable, Writable } from "node:stream";
import { ADAPTERS } from "../adapters/index.ts";
import { load } from "../config.ts";
import { errorMessage, object, text } from "../models.ts";
import { sync } from "../service.ts";
import { Store } from "../storage.ts";
import { compact, snapshot } from "./compact.ts";
import { isLanguage, LANGUAGES, type Language } from "./languages.ts";

const versions = ["2025-11-25", "2025-06-18", "2025-03-26"];
const filterSchema = {
  type: "object",
  properties: {
    days: {
      type: "integer",
      enum: [0, 1, 7, 30, 90],
      default: 1,
      description: "UTC calendar days, including today; 0 means all time",
    },
    agent: {
      type: "string",
      minLength: 1,
      maxLength: 512,
      description: "Normalized agent ID; omit for all agents",
    },
    session: {
      type: "string",
      minLength: 1,
      maxLength: 512,
      description: "Native session ID; omit for all sessions",
    },
    language: { type: "string", enum: LANGUAGES, default: "en" },
  },
  additionalProperties: false,
};
const tools = [
  {
    name: "get_usage",
    title: "AgentKcal usage",
    description:
      "Read a compact local ledger snapshot: consumed tokens and illustrative Wh/kcal. Does not refresh source logs. Call sync_usage only when the user requests a refresh. No prompts or source paths are returned.",
    inputSchema: filterSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "sync_usage",
    title: "Refresh AgentKcal usage",
    description:
      "Import configured local agent logs into the local ledger. Updates normalized usage only; no network calls. Use when the user requests fresh usage. Cannot select paths or change configuration. Cursor/OpenCode/Cline need export paths configured by the user first.",
    inputSchema: {
      type: "object",
      properties: { adapter: { type: "string", enum: [...ADAPTERS.keys()] } },
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
];
type RpcId = string | number | null;
type RpcResponse = {
  jsonrpc: "2.0";
  id: RpcId;
  result?: unknown;
  error?: { code: number; message: string };
};
function failure(id: RpcId, code: number, message: string): RpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}
function checkKeys(value: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(value).some((key) => !keys.includes(key)))
    throw new Error("Unsupported tool argument");
}
/** Bounded, newline-delimited MCP stdio. No HTTP server or third-party runtime. */
export class McpSession {
  readonly dataDir: string;
  private initialized = false;
  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }
  handle(value: unknown): RpcResponse | undefined {
    let row: Record<string, unknown>;
    try {
      row = object(value);
    } catch {
      return failure(null, -32600, "Invalid request");
    }
    const id =
      typeof row.id === "string" || typeof row.id === "number" || row.id === null ? row.id : null;
    if (
      row.jsonrpc !== "2.0" ||
      typeof row.method !== "string" ||
      ("id" in row && id === null && row.id !== null)
    )
      return failure(null, -32600, "Invalid request");
    if (!("id" in row)) return undefined;
    const ok = (result: unknown): RpcResponse => ({ jsonrpc: "2.0", id, result });
    if (row.method === "initialize") {
      let params: Record<string, unknown>;
      try {
        params = object(row.params);
      } catch {
        return failure(id, -32602, "Invalid initialize parameters");
      }
      if (typeof params.protocolVersion !== "string")
        return failure(id, -32602, "protocolVersion is required");
      this.initialized = true;
      return ok({
        protocolVersion: versions.includes(params.protocolVersion)
          ? params.protocolVersion
          : versions[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "agentkcal", version: "0.1.0" },
        instructions:
          "Show compact usage with get_usage. Energy is an illustrative scenario, not a measurement or food consumed. State the period and freshness. Refresh via sync_usage only when requested; report import warnings. No web dashboard is required.",
      });
    }
    if (row.method === "ping") return ok({});
    if (!this.initialized) return failure(id, -32002, "Initialize the MCP session first");
    if (row.method === "tools/list") return ok({ tools });
    if (row.method !== "tools/call") return failure(id, -32601, "Method not found");
    let params: Record<string, unknown>;
    try {
      params = object(row.params);
    } catch {
      return failure(id, -32602, "Invalid tool call");
    }
    if (!tools.some((tool) => tool.name === params.name))
      return failure(id, -32602, "Unknown tool");
    try {
      const args = object(params.arguments ?? {}),
        config = load(this.dataDir);
      if (params.name === "get_usage") {
        checkKeys(args, ["days", "agent", "session", "language"]);
        if (
          args.days !== undefined &&
          (typeof args.days !== "number" || ![0, 1, 7, 30, 90].includes(args.days))
        )
          throw new Error("days must be 0, 1, 7, 30 or 90");
        if (args.language !== undefined && !isLanguage(args.language))
          throw new Error(`language must be one of: ${LANGUAGES.join(", ")}`);
        const agent = args.agent === undefined ? undefined : text(args.agent, "agent");
        const session = args.session === undefined ? undefined : text(args.session, "session");
        const store = new Store(this.dataDir);
        try {
          const data = snapshot(store, config, {
            days: args.days as number | undefined,
            agent,
            session,
          });
          return ok({
            content: [{ type: "text", text: compact(data, args.language as Language | undefined) }],
            structuredContent: data,
          });
        } finally {
          store.close();
        }
      }
      checkKeys(args, ["adapter"]);
      const adapter = args.adapter === undefined ? undefined : text(args.adapter, "adapter");
      if (adapter !== undefined && !ADAPTERS.has(adapter)) throw new Error("unknown adapter");
      const store = new Store(this.dataDir);
      try {
        const result = sync(store, config, adapter);
        // Paths in diagnostics are useful locally but must not reach the model.
        const summary = {
          files: result.files,
          records: result.records,
          changed: result.changed,
          errors: result.errors.length,
          warnings: result.warnings.length,
        };
        return ok({
          content: [
            {
              type: "text",
              text: `${summary.changed} usage records added or updated; ${summary.errors} errors, ${summary.warnings} warnings. Run agentkcal sync locally for diagnostics.`,
            },
          ],
          structuredContent: summary,
          isError: !!summary.errors || !!summary.warnings,
        });
      } finally {
        store.close();
      }
    } catch (error) {
      // Configuration/OS errors may contain personal paths. Keep MCP errors bounded.
      const detail = errorMessage(error);
      const safe =
        /^(days must|language must|Unsupported tool|unknown adapter|agent must|session must)/.test(
          detail,
        )
          ? detail
          : "Local usage unavailable. Check AgentKcal configuration and source diagnostics locally.";
      return ok({ content: [{ type: "text", text: safe }], isError: true });
    }
  }
}
export async function runMcp(
  dataDir: string,
  input: Readable = process.stdin,
  output: Writable = process.stdout,
): Promise<void> {
  const session = new McpSession(dataDir);
  let pending = Buffer.alloc(0);
  const emit = async (response: RpcResponse) => {
    if (!output.write(`${JSON.stringify(response)}\n`))
      await new Promise<void>((resolve) => output.once("drain", resolve));
  };
  for await (const chunk of input) {
    pending = Buffer.concat([pending, Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))]);
    let newline = pending.indexOf(10);
    while (newline >= 0) {
      const line = pending.subarray(0, newline);
      pending = pending.subarray(newline + 1);
      if (line.length > 1_048_576) throw new Error("MCP message exceeds 1 MiB");
      let value: unknown;
      try {
        value = JSON.parse(line.toString("utf8"));
      } catch {
        await emit(failure(null, -32700, "Parse error"));
        newline = pending.indexOf(10);
        continue;
      }
      const result = session.handle(value);
      if (result) await emit(result);
      newline = pending.indexOf(10);
    }
    if (pending.length > 1_048_576) throw new Error("MCP message exceeds 1 MiB");
  }
  if (pending.length) await emit(failure(null, -32700, "Incomplete MCP message"));
}
