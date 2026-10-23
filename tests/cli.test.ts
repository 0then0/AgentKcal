import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { fixture, temporary } from "./helpers.ts";

function cli(...args: string[]) {
  return spawnSync(
    process.execPath,
    [fileURLToPath(new URL("../src/cli.ts", import.meta.url)), ...args],
    { encoding: "utf8" },
  );
}
test("CLI imports, reports, filters and exports without overwriting existing files", () => {
  using folder = temporary();
  const base = ["--data-dir", folder.path];
  const imported = cli(...base, "sync", "--adapter", "claude", "--path", fixture("claude.jsonl"));
  assert.equal(imported.status, 0, imported.stderr);
  assert.equal(JSON.parse(imported.stdout).changed, 1);
  const summary = cli(...base, "summary", "--days", "0", "--json");
  assert.equal(summary.status, 0);
  assert.equal(JSON.parse(summary.stdout).totals.total_tokens, 390);
  const target = join(folder.path, "export.csv");
  assert.equal(
    cli(...base, "export", "--days", "0", "--format", "csv", "--output", target).status,
    0,
  );
  const before = readFileSync(target, "utf8");
  assert.match(before, /claude-test/);
  assert.equal(cli(...base, "export", "--output", target).status, 1);
  assert.equal(readFileSync(target, "utf8"), before);
});
test("missing explicit paths return a nonzero status and diagnostic", () => {
  using folder = temporary();
  const result = cli(
    "--data-dir",
    folder.path,
    "sync",
    "--adapter",
    "claude",
    "--path",
    join(folder.path, "missing"),
  );
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).warnings.length, 1);
});
test("CLI init preserves edited config and invalid config fails without a stack trace", () => {
  using folder = temporary();
  const base = ["--data-dir", folder.path];
  assert.equal(cli(...base, "init").status, 0);
  const path = join(folder.path, "config.json");
  const before = `${readFileSync(path, "utf8")}\n`;
  writeFileSync(path, before);
  assert.equal(cli(...base, "init").status, 0);
  assert.equal(readFileSync(path, "utf8"), before);
  writeFileSync(path, '{"version":2}');
  const result = cli(...base, "summary");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unsupported config version/);
  assert.doesNotMatch(result.stderr, /at main|Traceback/);
});
test("CLI flags, adapter selection and ports are validated", () => {
  for (const args of [
    ["sync", "--path", "missing"],
    ["sync", "--adapter", "typo"],
    ["summary", "--days", "13"],
    ["serve", "--port", "-1"],
    ["summary", "--port", "1234"],
  ])
    assert.equal(cli(...args).status, 1, args.join(" "));
  assert.equal(cli("--version").stdout.trim(), "0.1.0");
  assert.match(cli("--help").stdout, /Usage: agentkcal/);
});
test("compact CLI refresh uses configured sources and reports incomplete sync", () => {
  using folder = temporary();
  const base = ["--data-dir", folder.path];
  cli(...base, "init");
  const path = join(folder.path, "config.json");
  const config = JSON.parse(readFileSync(path, "utf8"));
  config.sources.claude = [fixture("claude.jsonl")];
  writeFileSync(path, JSON.stringify(config));
  const fresh = cli(...base, "status", "--days", "0", "--agent", "claude", "--sync", "--json");
  assert.equal(fresh.status, 0, fresh.stderr);
  assert.equal(JSON.parse(fresh.stdout).totals.total_tokens, 390);
  assert.match(
    cli(...base, "status", "--days", "0", "--agent", "claude", "--language", "ru").stdout,
    /390 токенов.*Вт·ч.*ккал/,
  );
  config.sources.claude = [join(folder.path, "missing")];
  writeFileSync(path, JSON.stringify(config));
  const incomplete = cli(
    ...base,
    "status",
    "--days",
    "0",
    "--agent",
    "claude",
    "--sync",
    "--language",
    "ru",
  );
  assert.equal(incomplete.status, 1);
  assert.match(incomplete.stderr, /source does not exist/);
  assert.match(incomplete.stdout, /390 токенов.*синхронизация неполная/);
});
