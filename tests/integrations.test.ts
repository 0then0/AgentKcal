import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { DEFAULT, initialize } from "../src/config.ts";
import { claudeStatusline, compact, snapshot } from "../src/integrations/compact.ts";
import { integrationConfig, shellQuote } from "../src/integrations/config.ts";
import { COMPACT_MESSAGES, LANGUAGES } from "../src/integrations/languages.ts";
import { McpSession, runMcp } from "../src/integrations/mcp.ts";
import { object } from "../src/models.ts";
import { Store } from "../src/storage.ts";
import { event, fixture, temporary } from "./helpers.ts";

const init = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-11-25",
    clientInfo: { name: "test", version: "1" },
    capabilities: {},
  },
};
function call(session: McpSession, name: string, args: Record<string, unknown> = {}) {
  const result = session.handle({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name, arguments: args },
  });
  assert.ok(result);
  return object(result.result);
}
test("compact status scopes today's UTC usage, agent and session; excludes future events", () => {
  using folder = temporary();
  using store = new Store(folder.path);
  store.upsert([
    event({ input_tokens: 1e6 }),
    event({ event_id: "other", session_id: "other", input_tokens: 2e6 }),
    event({ event_id: "old", timestamp: "2026-01-01T10:00:00Z" }),
    event({ event_id: "future", timestamp: "2030-01-01T00:00:00Z" }),
  ]);
  const data = snapshot(store, DEFAULT, {
    agent: "test",
    session: "s1",
    now: new Date("2026-01-02T11:00:00Z"),
  });
  assert.equal(data.totals.records, 1);
  assert.equal(data.totals.wh, 120);
  assert.equal(data.last_event_at, "2026-01-02T10:00:00.000Z");
  assert.match(compact(data), /session.*1M tokens.*≈120 Wh/);
  assert.match(compact(data, "ru"), /сессия.*Вт·ч.*ккал/);
  assert.equal(
    snapshot(store, DEFAULT, { now: new Date("2026-01-02T11:00:00Z") }).totals.records,
    2,
  );
});
test("tiny nonzero native estimates remain visibly nonzero", () => {
  using folder = temporary();
  using store = new Store(folder.path);
  store.upsert([event({ input_tokens: 1 })]);
  assert.match(compact(snapshot(store, DEFAULT, { days: 0 })), /≈<0\.01 Wh.*≈<0\.01 kcal/);
});
test("Claude statusLine imports only its transcript and shares ledger identities", () => {
  using folder = temporary();
  const first = JSON.parse(
    readFileSync(fixture("claude.jsonl"), "utf8")
      .split("\n")
      .find((line) => line.includes('"sessionId"')) ?? "{}",
  );
  const input = {
    session_id: first.sessionId,
    transcript_path: fixture("claude.jsonl"),
    cwd: "/PRIVATE_ignored",
    model: { display_name: "PRIVATE_ignored" },
  };
  const line = claudeStatusline(folder.path, input, "ru");
  assert.match(line, /390 токенов/);
  assert.match(line, /сессия/);
  assert.equal(claudeStatusline(folder.path, input, "ru"), line);
  using store = new Store(folder.path);
  assert.equal(store.events().length, 1);
  assert.ok(!JSON.stringify(store.events()).includes("PRIVATE_"));
  assert.match(
    claudeStatusline(folder.path, { ...input, transcript_path: join(folder.path, "missing") }),
    /waiting for transcript/,
  );
});
test("statusLine invalid stdin cannot print conversation contents or crash the agent footer", () => {
  using folder = temporary();
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL("../src/cli.ts", import.meta.url)),
      "--data-dir",
      folder.path,
      "statusline",
      "--language",
      "ru",
    ],
    { input: '{"PRIVATE_PROMPT":', encoding: "utf8" },
  );
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "AgentKcal · данные недоступны");
  assert.doesNotMatch(result.stderr, /PRIVATE_|SyntaxError|at main/);
});
test("native configurations use absolute executable/CLI/data paths without changing settings", () => {
  using folder = temporary();
  for (const agent of ["cursor", "gemini", "cline", "mcp"]) {
    const config = JSON.parse(integrationConfig(agent, folder.path));
    assert.equal(config.mcpServers.agentkcal.command, process.execPath);
    assert.deepEqual(config.mcpServers.agentkcal.args.slice(-3), [
      "--data-dir",
      folder.path,
      "mcp",
    ]);
  }
  assert.match(integrationConfig("codex", folder.path), /\[mcp_servers.agentkcal\]/);
  assert.equal(JSON.parse(integrationConfig("opencode", folder.path)).mcp.agentkcal.type, "local");
  const claude = JSON.parse(integrationConfig("claude", folder.path, "ru"));
  assert.equal(claude.statusLine.type, "command");
  assert.match(claude.statusLine.command, /statusline/);
  assert.equal(shellQuote("a'b", "darwin"), "'a'\\''b'");
  assert.equal(shellQuote("C:\\Program Files\\node.exe", "win32"), '"C:\\Program Files\\node.exe"');
  assert.throws(() => shellQuote("%SECRET%", "win32"));
});
test("MCP initializes, negotiates versions and advertises separate read/write tools", () => {
  using folder = temporary();
  const session = new McpSession(folder.path);
  assert.equal(
    session.handle({ jsonrpc: "2.0", id: 0, method: "tools/list" })?.error?.code,
    -32002,
  );
  const initialized = session.handle(init);
  assert.equal(object(initialized?.result).protocolVersion, "2025-11-25");
  const list = session.handle({ jsonrpc: "2.0", id: "list", method: "tools/list" });
  const tools = object(list?.result).tools as {
    name: string;
    annotations: { readOnlyHint: boolean };
  }[];
  assert.equal(tools.find((tool) => tool.name === "get_usage")?.annotations.readOnlyHint, true);
  assert.equal(tools.find((tool) => tool.name === "sync_usage")?.annotations.readOnlyHint, false);
  assert.equal(session.handle({ jsonrpc: "2.0", method: "notifications/initialized" }), undefined);
  assert.equal(session.handle({ jsonrpc: "2.0", id: 3, method: "unknown" })?.error?.code, -32601);
  for (const protocolVersion of ["2025-06-18", "2025-03-26"])
    assert.equal(
      object(session.handle({ ...init, params: { ...init.params, protocolVersion } })?.result)
        .protocolVersion,
      protocolVersion,
    );
});
test("MCP reads only compact metadata and strictly validates tool arguments", () => {
  using folder = temporary();
  {
    using store = new Store(folder.path);
    store.upsert([event({ input_tokens: 1e6 })]);
  }
  const session = new McpSession(folder.path);
  session.handle(init);
  const result = call(session, "get_usage", { days: 0, agent: "test", language: "ru" });
  const data = object(result.structuredContent);
  assert.equal(object(data.totals).total_tokens, 1e6);
  assert.ok(!("records" in data));
  assert.ok(!JSON.stringify(result).includes(folder.path));
  for (const args of [
    { days: true },
    { days: 13 },
    { agent: false },
    { path: fixture("claude.jsonl") },
    { language: "xx" },
  ])
    assert.equal(call(session, "get_usage", args).isError, true);
  assert.equal(call(session, "sync_usage", { path: fixture("claude.jsonl") }).isError, true);
});
test("MCP refresh imports configured sources idempotently and redacts diagnostics", () => {
  using folder = temporary();
  const config = structuredClone(DEFAULT);
  config.sources.claude = [fixture("claude.jsonl")];
  writeFileSync(initialize(folder.path), JSON.stringify(config));
  const session = new McpSession(folder.path);
  session.handle(init);
  assert.equal(
    object(call(session, "sync_usage", { adapter: "claude" }).structuredContent).changed,
    1,
  );
  assert.equal(
    object(call(session, "sync_usage", { adapter: "claude" }).structuredContent).changed,
    0,
  );
  config.sources.claude = [join(folder.path, "PRIVATE_PATH")];
  writeFileSync(join(folder.path, "config.json"), JSON.stringify(config));
  const failure = call(session, "sync_usage", { adapter: "claude" });
  assert.equal(failure.isError, true);
  assert.ok(!JSON.stringify(failure).includes("PRIVATE_PATH"));
});
test("MCP stdio handles fragmented UTF-8, notifications, parse errors and EOF framing", async () => {
  using folder = temporary();
  const source = `${JSON.stringify(init)}\n${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n{"broken":\n${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_usage", arguments: { agent: "агент", language: "ru" } } })}\nunfinished`;
  const bytes = Buffer.from(source),
    chunks = Array.from({ length: bytes.length }, (_, i) => bytes.subarray(i, i + 1));
  let output = "";
  await runMcp(
    folder.path,
    Readable.from(chunks),
    new Writable({
      write(chunk, _encoding, done) {
        output += chunk.toString();
        done();
      },
    }),
  );
  const messages = output
    .trim()
    .split("\n")
    .map((line) => object(JSON.parse(line)));
  assert.equal(messages.length, 4);
  assert.equal(object(messages[1]?.error).code, -32700);
  assert.match(JSON.stringify(messages[2]), /агент/);
  assert.equal(object(messages[3]?.error).code, -32700);
});
test("oversized MCP input is bounded", async () => {
  using folder = temporary();
  await assert.rejects(
    runMcp(
      folder.path,
      Readable.from([Buffer.alloc(1_048_577, 120)]),
      new Writable({
        write(_chunk, _encoding, done) {
          done();
        },
      }),
    ),
    /exceeds 1 MiB/,
  );
});
test("compact status and MCP support the same seven locales", () => {
  using folder = temporary();
  {
    using store = new Store(folder.path);
    store.upsert([event({ input_tokens: 125000 })]);
  }
  const session = new McpSession(folder.path);
  session.handle(init);
  for (const language of LANGUAGES) {
    const result = call(session, "get_usage", { days: 0, language });
    assert.notEqual(result.isError, true, language);
    const line = (result.content as { text: string }[])[0]?.text ?? "";
    assert.ok(line.includes(COMPACT_MESSAGES[language].all), language);
    assert.ok(line.includes(COMPACT_MESSAGES[language].kcal), language);
    assert.match(line, /≈15 (Wh|Вт·ч)/);
    assert.match(integrationConfig("claude", folder.path, language), new RegExp(language));
  }
});

test("distributed host templates preserve YAML front matter", () => {
  for (const [path, fields] of [
    ["../integrations/opencode/agentkcal.md", ["description"]],
    ["../integrations/skills/agentkcal/SKILL.md", ["name", "description"]],
  ] as const) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    const header = source.match(/^---\r?\n([\s\S]+?)\r?\n---\r?\n/);
    assert.ok(header, path);
    for (const field of fields) assert.match(header[1] ?? "", new RegExp(`^${field}: .+`, "m"));
  }
});
