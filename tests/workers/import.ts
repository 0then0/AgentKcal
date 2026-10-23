import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT } from "../../src/config.ts";
import { claudeStatusline } from "../../src/integrations/compact.ts";
import type { UsageEvent } from "../../src/models.ts";
import { sync } from "../../src/service.ts";
import { Store } from "../../src/storage.ts";

const [role, mode, dataDir, source, signals, session] = process.argv.slice(2);
if (!role || !mode || !dataDir || !source || !signals || !session)
  throw new Error("Missing worker arguments");
writeFileSync(join(signals, `${role}-started`), "ready");
const original = Store.prototype.upsert;
Store.prototype.upsert = function (input) {
  const read = (): UsageEvent[] => {
    const events = typeof input === "function" ? input() : input;
    if (role === "first") {
      writeFileSync(join(signals, "first-read"), "ready");
      const deadline = Date.now() + 20_000;
      while (!existsSync(join(signals, "release"))) {
        if (Date.now() > deadline) throw new Error("Timed out waiting for release");
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
      }
    }
    return events;
  };
  // Preserve eager/lazy input so the test also detects the original eager-read race.
  return original.call(this, typeof input === "function" ? read : read());
};
if (mode === "statusline")
  claudeStatusline(dataDir, { session_id: session, transcript_path: source });
else {
  using store = new Store(dataDir);
  const result = sync(store, DEFAULT, "claude", [source]);
  if (result.errors.length) throw new Error(result.errors.join("\n"));
}
