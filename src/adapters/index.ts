import type { Adapter } from "./base.ts";
import { ClaudeAdapter } from "./claude.ts";
import { CodexAdapter } from "./codex.ts";
import { ClineAdapter, CursorAdapter, GenericAdapter, OpenCodeAdapter } from "./exports.ts";
import { GeminiAdapter } from "./gemini.ts";

export const ADAPTERS: ReadonlyMap<string, Adapter> = new Map(
  [
    new ClaudeAdapter(),
    new CodexAdapter(),
    new GeminiAdapter(),
    new CursorAdapter(),
    new OpenCodeAdapter(),
    new ClineAdapter(),
    new GenericAdapter(),
  ].map((adapter) => [adapter.name, adapter]),
);
export type { Adapter } from "./base.ts";
