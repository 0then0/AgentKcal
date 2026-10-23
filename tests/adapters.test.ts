import assert from "node:assert/strict";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseCsv } from "../src/adapters/csv.ts";
import { ADAPTERS } from "../src/adapters/index.ts";
import { DEFAULT } from "../src/config.ts";
import { object, totalTokens } from "../src/models.ts";
import { sync } from "../src/service.ts";
import { Store } from "../src/storage.ts";
import { fixture, temporary } from "./helpers.ts";

function read(adapter: string, filename: string) {
  const source = ADAPTERS.get(adapter);
  assert.ok(source);
  return source.read(fixture(filename));
}
test("Claude replaces streaming snapshots and preserves disjoint cache buckets", () => {
  const rows = read("claude", "claude.jsonl");
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.output_tokens, 40);
  assert.equal(totalTokens(rows[0] ?? assert.fail()), 390);
});
test("Codex cumulative usage ignores repeated snapshots and splits reasoning", () => {
  const rows = read("codex", "rollout-codex.jsonl");
  assert.equal(rows.length, 2);
  assert.equal(
    rows.reduce((s, e) => s + totalTokens(e), 0),
    1700,
  );
  assert.equal(
    rows.reduce((s, e) => s + e.input_tokens, 0),
    1000,
  );
  assert.equal(
    rows.reduce((s, e) => s + e.reasoning_tokens, 0),
    60,
  );
});
test("Gemini JSONL retains consumed inference on rewind and matches JSON", () => {
  const rows = read("gemini", "session-gemini.json");
  assert.equal(rows[0]?.input_tokens, 420);
  assert.equal(totalTokens(rows[0] ?? assert.fail()), 1200);
  assert.deepEqual(read("gemini", "session-gemini.jsonl"), rows);
});
test("OpenCode classic, flat and compaction messages share disjoint bucket semantics", () => {
  const rows = read("opencode", "opencode.json");
  assert.equal(totalTokens(rows[0] ?? assert.fail()), 390);
  assert.equal(rows[0]?.timestamp, "2026-01-02T13:00:01.000Z");
  using folder = temporary();
  const data = object(JSON.parse(readFileSync(fixture("opencode.json"), "utf8")));
  const message = object((data.messages as unknown[])[0]);
  const row = object(message.info);
  row.type = row.role;
  delete row.role;
  row.model = { id: row.modelID, providerID: "local" };
  delete row.modelID;
  data.messages = [row, { ...row, id: "compact-1", type: "compaction" }];
  const path = join(folder.path, "export.json");
  writeFileSync(path, JSON.stringify(data));
  const flat = ADAPTERS.get("opencode")?.read(path);
  assert.equal(flat?.length, 2);
  assert.equal(flat?.[0]?.model, "local-test");
  assert.equal(
    flat?.reduce((s, e) => s + totalTokens(e), 0),
    780,
  );
});
test("Cline ignores api_req_finished and overlapping aggregates", () => {
  const rows = read("cline", "ui_messages.json");
  assert.equal(rows.length, 1);
  assert.equal(totalTokens(rows[0] ?? assert.fail()), 370);
  assert.equal(rows[0]?.model, "unknown");
});
test("Cursor retains included usage and the existing request identities", () => {
  const rows = read("cursor", "cursor.csv");
  assert.equal(
    rows.reduce((s, e) => s + totalTokens(e), 0),
    710,
  );
  assert.deepEqual(
    rows.map((row) => row.event_id),
    [
      "6fede316eec706e36c30c896df4adfb0d910e3cb8cf55a45aea6a9a027c14dfc:1",
      "2078cff281a2cbd0da003789c24263ea765fb9cca18391733fae66b32ea330b4:1",
    ],
  );
});
test("universal JSONL accepts paired compute telemetry", () => {
  const rows = ADAPTERS.get("generic")?.read(
    fileURLToPath(new URL("../examples/usage.jsonl", import.meta.url)),
  );
  assert.equal(rows?.[1]?.gpu_seconds, 60);
});
test("overlapping paths and subsequent imports are idempotent; prompts never reach SQLite", () => {
  using folder = temporary();
  {
    using store = new Store(folder.path);
    const config = {
      ...DEFAULT,
      sources: { claude: [fixture("claude.jsonl"), fixture("claude.jsonl")] },
    };
    const first = sync(store, config, "claude"),
      second = sync(store, config, "claude");
    assert.equal(first.files, 1);
    assert.equal(first.changed, 1);
    assert.equal(second.changed, 0);
    assert.equal(store.events().length, 1);
    assert.ok(!JSON.stringify(store.events()).includes("PRIVATE_"));
  }
  assert.ok(!readFileSync(join(folder.path, "usage.sqlite3")).includes(Buffer.from("PRIVATE_")));
});
test("a truncated file commits no prefix; other valid files still import", () => {
  using folder = temporary();
  const path = join(folder.path, "broken.jsonl");
  writeFileSync(path, `${readFileSync(fixture("claude.jsonl"), "utf8")}\n{"incomplete":`);
  using store = new Store(join(folder.path, "db"));
  const failed = sync(store, DEFAULT, "claude", [path]);
  assert.equal(failed.changed, 0);
  assert.equal(failed.errors.length, 1);
  assert.deepEqual(store.events(), []);
  copyFileSync(fixture("claude.jsonl"), join(folder.path, "valid.jsonl"));
  const partial = sync(store, DEFAULT, "claude", [folder.path]);
  assert.equal(partial.errors.length, 1);
  assert.equal(store.events().length, 1);
  assert.ok(!JSON.stringify(partial).includes("PRIVATE_"));
});
test("a later Claude snapshot updates one existing record", () => {
  using folder = temporary();
  const path = join(folder.path, "source.jsonl");
  const rows = readFileSync(fixture("claude.jsonl"), "utf8").split(/\r?\n/);
  writeFileSync(path, rows.slice(0, 2).join("\n"));
  using store = new Store(join(folder.path, "db"));
  sync(store, DEFAULT, "claude", [path]);
  assert.equal(store.events()[0]?.output_tokens, 10);
  writeFileSync(path, rows.join("\n"));
  assert.equal(sync(store, DEFAULT, "claude", [path]).changed, 1);
  assert.equal(store.events().length, 1);
  assert.equal(store.events()[0]?.output_tokens, 40);
});
test("missing explicit sources warn and missing native default locations do not", () => {
  using folder = temporary();
  using store = new Store(folder.path);
  assert.equal(sync(store, DEFAULT, "generic", [join(folder.path, "missing")]).warnings.length, 1);
  assert.deepEqual(sync(store, DEFAULT, "generic").warnings, []);
  assert.throws(() => sync(store, { ...DEFAULT, sources: { typo: [] } }), /unknown adapters/);
});
test("Cursor CSV validates columns and preserves quoted commas, newlines and BOM", () => {
  using folder = temporary();
  const path = join(folder.path, "bad.csv");
  writeFileSync(path, "Date,Model\n2026-01-02,gpt-test\n");
  assert.throws(() => ADAPTERS.get("cursor")?.read(path), /unsupported Cursor/);
  assert.deepEqual(parseCsv('\uFEFFa,b\r\n"a,b","c""d\ne"\r\n'), [
    ["a", "b"],
    ["a,b", 'c"d\ne'],
  ]);
  assert.throws(() => parseCsv('a,b\n"unfinished'), /unterminated/);
});
test("Codex counter resets reject the entire file", () => {
  using folder = temporary();
  const rows = readFileSync(fixture("rollout-codex.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((line) => object(JSON.parse(line)));
  const last = rows.at(-1);
  assert.ok(last);
  object(object(object(last.payload).info).total_token_usage).input_tokens = 500;
  const path = join(folder.path, "rollout-reset.jsonl");
  writeFileSync(path, rows.map((row) => JSON.stringify(row)).join("\n"));
  assert.throws(() => ADAPTERS.get("codex")?.read(path), /counters decreased/);
});
