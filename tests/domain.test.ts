import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { parseCsv } from "../src/adapters/csv.ts";
import { DEFAULT, initialize, load, validate } from "../src/config.ts";
import { totalTokens, usageEvent } from "../src/models.ts";
import { matches, ScenarioProvider } from "../src/providers/energy.ts";
import { exportReport, report } from "../src/service.ts";
import { Store } from "../src/storage.ts";
import { event, temporary } from "./helpers.ts";

test("all disjoint buckets contribute once, with exact Wh to kcal convention", () => {
  const value = event({
    input_tokens: 1e6,
    output_tokens: 1e6,
    cache_read_tokens: 1e6,
    cache_write_tokens: 1e6,
    reasoning_tokens: 1e6,
  });
  const estimate = new ScenarioProvider(DEFAULT.energy).estimate(value);
  assert.equal(totalTokens(value), 5e6);
  assert.equal(estimate.wh, 1242);
  assert.equal(estimate.kcal, (1242 * 3600) / 4184);
  assert.equal(estimate.low_wh, 124.2);
  assert.equal(estimate.high_wh, 12420);
});
test("GPU telemetry substitutes for the token estimate", () => {
  const estimate = new ScenarioProvider(DEFAULT.energy).estimate(
    event({ input_tokens: 1e9, gpu_seconds: 3600, gpu_watts: 100 }),
  );
  assert.equal(estimate.wh, 120);
  assert.equal(estimate.method, "compute");
});
test("model patterns use first-match case insensitive glob semantics with an explicit fallback", () => {
  const config = structuredClone(DEFAULT);
  const fallback = config.energy.profiles[0];
  assert.ok(fallback);
  config.energy.profiles.unshift({
    ...fallback,
    model_pattern: "TEST-*",
    input_wh_per_million: 200,
  });
  const provider = new ScenarioProvider(config.energy);
  assert.equal(provider.estimate(event({ input_tokens: 1e6 })).wh, 240);
  assert.equal(provider.estimate(event({ model: "unknown", input_tokens: 1e6 })).wh, 120);
  assert.ok(matches("model-a2", "MODEL-[ab]?"));
  assert.ok(!matches("model-z2", "model-[ab]?"));
});
test("tokens reject negative, fractional, nonfinite, boolean and string input", () => {
  for (const invalid of [-1, NaN, Infinity, 1.5, true, "100", 1e16])
    assert.throws(() => event({ input_tokens: invalid }));
});
test("telemetry requires a pair and finite nonnegative values", () => {
  assert.throws(() => event({ gpu_seconds: 10 }), /together/);
  for (const gpu_watts of [-1, Infinity, true, "100"])
    assert.throws(() => event({ gpu_seconds: 10, gpu_watts }));
});
test("timestamps require a timezone, reject invalid dates and normalize offsets/milliseconds", () => {
  for (const timestamp of ["2026-01-02T10:00:00", "2026-02-30T10:00:00Z", "broken", NaN])
    assert.throws(() => event({ timestamp }));
  assert.equal(
    event({ timestamp: "2026-01-02T13:00:00+03:00" }).timestamp,
    "2026-01-02T10:00:00.000Z",
  );
  assert.equal(event({ timestamp: 1767348000000 }).timestamp, "2026-01-02T10:00:00.000Z");
});
test("generic payloads reject unexpected fields and empty identifiers", () => {
  assert.throws(() => usageEvent({ ...event(), prompt: "private" }), /unknown fields/);
  assert.throws(() => event({ agent: " " }));
  assert.throws(() => event({ model: null }));
});
test("UTC calendar windows include empty days and exclude future usage", () => {
  using folder = temporary();
  using store = new Store(folder.path);
  store.upsert([
    event({ input_tokens: 100 }),
    event({ event_id: "old", timestamp: "2025-12-20T10:00:00Z" }),
    event({ event_id: "future", timestamp: "2030-01-01T10:00:00Z" }),
  ]);
  const data = report(store, DEFAULT, 7, undefined, new Date("2026-01-03T00:00:00Z"));
  assert.equal(data.totals.records, 1);
  assert.equal(data.daily.length, 7);
  assert.equal(data.daily[0]?.date, "2025-12-28");
  assert.equal(
    report(store, DEFAULT, 0, undefined, new Date("2026-01-03T00:00:00Z")).totals.records,
    2,
  );
});
test("filters and scenario provenance are retained in JSON and CSV exports", () => {
  using folder = temporary();
  using store = new Store(folder.path);
  store.upsert([
    event({ model: "=HYPERLINK(1)", input_tokens: 100 }),
    event({ agent: "other", event_id: "e2" }),
  ]);
  const data = report(store, DEFAULT, 0, "test");
  const json = JSON.parse(exportReport(data, "json"));
  assert.equal(json.totals.records, 1);
  assert.deepEqual(json.scenario, DEFAULT.energy);
  const [headers = [], row = []] = parseCsv(exportReport(data, "csv"));
  assert.equal(row[headers.indexOf("model")], "'=HYPERLINK(1)");
  assert.deepEqual(JSON.parse(row[headers.indexOf("scenario")] ?? ""), DEFAULT.energy);
  assert.throws(() => exportReport(data, "xml"), /format/);
});
test("untrusted IDs cannot mutate report dictionaries via prototype keys", () => {
  using folder = temporary();
  using store = new Store(folder.path);
  store.upsert([event({ agent: "__proto__", model: "constructor" })]);
  const data = report(store, DEFAULT, 0);
  assert.equal(Object.getOwnPropertyDescriptor(data.by_agent, "__proto__")?.value.records, 1);
  assert.equal(Object.getOwnPropertyDescriptor(data.by_model, "constructor")?.value.records, 1);
});
test("invalid scenario values and missing fallback profiles fail validation", () => {
  for (const [key, value] of [
    ["pue", 0.9],
    ["high_multiplier", 0.5],
    ["low_multiplier", 2],
    ["pue", true],
    ["pue", NaN],
  ] as const) {
    const config = structuredClone(DEFAULT);
    Object.assign(config.energy, { [key]: value });
    assert.throws(() => validate(config));
  }
  const config = structuredClone(DEFAULT);
  const profile = config.energy.profiles[0];
  assert.ok(profile);
  profile.model_pattern = "some-model";
  assert.throws(() => validate(config), /fallback/);
});
test("changing the scenario recalibrates reports without changing raw counts", () => {
  using folder = temporary();
  using store = new Store(folder.path);
  store.upsert([event({ input_tokens: 1e6 })]);
  const first = report(store, DEFAULT, 0);
  const config = structuredClone(DEFAULT);
  config.energy.pue = 2.4;
  assert.equal(report(store, config, 0).totals.wh, first.totals.wh * 2);
  assert.equal(store.events()[0]?.input_tokens, 1e6);
});
test("initialization preserves existing configuration and loading detects invalid JSON", () => {
  using folder = temporary();
  const path = initialize(folder.path);
  const before = readFileSync(path, "utf8");
  initialize(folder.path);
  assert.equal(readFileSync(path, "utf8"), before);
  assert.deepEqual(load(folder.path), DEFAULT);
  writeFileSync(path, "{");
  assert.throws(() => load(folder.path));
});
test("existing schema and JSON serialization reimport without duplication", () => {
  using folder = temporary();
  const value = event({ input_tokens: 100 });
  const db = new DatabaseSync(join(folder.path, "usage.sqlite3"));
  db.exec(
    "CREATE TABLE events (agent TEXT NOT NULL,session_id TEXT NOT NULL,event_id TEXT NOT NULL,timestamp TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(agent,session_id,event_id)); PRAGMA user_version=1",
  );
  const oldPayload = `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}: ${JSON.stringify(value[key as keyof typeof value])}`)
    .join(", ")}}`;
  db.prepare("INSERT INTO events VALUES(?,?,?,?,?)").run(
    value.agent,
    value.session_id,
    value.event_id,
    value.timestamp,
    oldPayload,
  );
  db.close();
  using store = new Store(folder.path);
  assert.deepEqual(store.events(), [value]);
  assert.equal(store.upsert([value]), 0);
  assert.equal(store.upsert([{ ...value, output_tokens: 25 }]), 1);
  assert.equal(store.events().length, 1);
});
test("a failed upsert rolls back all records in its file transaction", () => {
  using folder = temporary();
  using store = new Store(folder.path);
  assert.throws(() => store.upsert([event(), { ...event({ event_id: "bad" }), input_tokens: -1 }]));
  assert.deepEqual(store.events(), []);
});
test("future SQLite schema versions are rejected without altering their ledger", () => {
  using folder = temporary();
  const db = new DatabaseSync(join(folder.path, "usage.sqlite3"));
  db.exec("PRAGMA user_version=2");
  db.close();
  assert.throws(() => new Store(folder.path), /unsupported database version 2/);
});
test("totals that exceed exact JavaScript integer precision fail explicitly", () => {
  using folder = temporary();
  using store = new Store(folder.path);
  const large = {
    input_tokens: 1e15,
    output_tokens: 1e15,
    cache_read_tokens: 1e15,
    cache_write_tokens: 1e15,
    reasoning_tokens: 1e15,
  };
  store.upsert([event(large), event({ ...large, event_id: "e2" })]);
  assert.throws(() => report(store, DEFAULT, 0), /safe integer range/);
});
