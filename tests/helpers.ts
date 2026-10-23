import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type UsageEvent, usageEvent } from "../src/models.ts";

export const fixtures = fileURLToPath(new URL("./fixtures/", import.meta.url));
export function fixture(name: string): string {
  return join(fixtures, name);
}
export function event(overrides: Record<string, unknown> = {}): UsageEvent {
  return usageEvent({
    agent: "test",
    event_id: "e1",
    session_id: "s1",
    timestamp: "2026-01-02T10:00:00Z",
    model: "test-model",
    ...overrides,
  });
}
export function temporary(): Disposable & { path: string } {
  const path = mkdtempSync(join(tmpdir(), "agentkcal-test-"));
  return {
    path,
    [Symbol.dispose]() {
      rmSync(path, { recursive: true, force: true });
    },
  };
}
