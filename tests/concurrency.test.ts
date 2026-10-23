import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { Store } from "../src/storage.ts";
import { fixture, temporary } from "./helpers.ts";

async function waitFor(path: string, child: ChildProcess) {
  const deadline = Date.now() + 15_000;
  while (!existsSync(path)) {
    assert.equal(child.exitCode, null, "worker exited before reaching checkpoint");
    assert.ok(Date.now() < deadline, `Worker checkpoint timed out: ${path}`);
    await setTimeout(10);
  }
}
for (const [first, second] of [
  ["sync", "statusline"],
  ["statusline", "sync"],
]) {
  test(`${first} and ${second} serialize source reads across processes`, {
    timeout: 30_000,
  }, async () => {
    using folder = temporary();
    const dataDir = join(folder.path, "db"),
      source = join(folder.path, "session.jsonl");
    const complete = readFileSync(fixture("claude.jsonl"), "utf8");
    const lines = complete.trim().split("\n");
    const session = JSON.parse(
      lines.find((line) => line.includes('"sessionId"')) ?? "{}",
    ).sessionId;
    writeFileSync(source, lines.slice(0, 2).join("\n"));
    const initial = new Store(dataDir);
    initial.close();
    const workers: { child: ChildProcess; done: Promise<void> }[] = [];
    const start = (role: string, mode: string) => {
      const child = spawn(
        process.execPath,
        [
          fileURLToPath(new URL("./workers/import.ts", import.meta.url)),
          role,
          mode,
          dataDir,
          source,
          folder.path,
          session,
        ],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
      let stderr = "";
      child.stderr?.on("data", (chunk) => {
        stderr += String(chunk);
      });
      const done = once(child, "exit").then(([code]) => {
        assert.equal(code, 0, stderr);
      });
      // A failure is checked below; avoid an unhandled rejection while waiting for a checkpoint.
      void done.catch(() => {});
      workers.push({ child, done });
      return child;
    };
    try {
      const a = start("first", first ?? assert.fail());
      await waitFor(join(folder.path, "first-read"), a);
      const probe = new DatabaseSync(join(dataDir, "usage.sqlite3"));
      let locked = false;
      try {
        probe.exec("PRAGMA busy_timeout=0");
        try {
          probe.exec("BEGIN IMMEDIATE");
          probe.exec("ROLLBACK");
        } catch (error) {
          assert.match(String(error), /locked|busy/i);
          locked = true;
        }
      } finally {
        probe.close();
      }
      assert.ok(locked, "source was read before acquiring the cross-process writer lock");
      writeFileSync(source, complete);
      const b = start("second", second ?? assert.fail());
      await waitFor(join(folder.path, "second-started"), b);
      writeFileSync(join(folder.path, "release"), "go");
      await Promise.all(workers.map((worker) => worker.done));
      using store = new Store(dataDir);
      assert.equal(store.events().length, 1);
      assert.equal(store.events()[0]?.output_tokens, 40);
    } finally {
      writeFileSync(join(folder.path, "release"), "go");
      for (const { child } of workers) if (child.exitCode === null) child.kill();
      await Promise.allSettled(workers.map((worker) => worker.done));
    }
  });
}
