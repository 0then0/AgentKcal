import { globSync, readFileSync, realpathSync, type Stats, statSync } from "node:fs";
import { basename, extname } from "node:path";
import { object, type UsageEvent } from "../models.ts";

export interface Adapter {
  readonly name: string;
  readonly title: string;
  readonly mode: string;
  readonly patterns: readonly string[];
  defaultRoots(): string[];
  read(path: string): UsageEvent[];
}
export function stem(path: string): string {
  return basename(path, extname(path));
}
export function files(adapter: Adapter, roots: string[]): string[] {
  const found = new Map<string, string>();
  for (const root of roots) {
    let stats: Stats;
    try {
      stats = statSync(root);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    const candidates = stats.isFile()
      ? [root]
      : stats.isDirectory()
        ? [...globSync([...adapter.patterns], { cwd: root })]
            .sort()
            .map((path) => `${root}/${path}`)
        : [];
    for (const path of candidates) if (statSync(path).isFile()) found.set(realpathSync(path), path);
  }
  return [...found.values()];
}
export function jsonLines(path: string): Record<string, unknown>[] {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .flatMap((line, index) => {
      if (!line.trim()) return [];
      try {
        return [object(JSON.parse(line))];
      } catch {
        throw new Error(
          `invalid JSON object at line ${index + 1}; file skipped, retry after writer finishes`,
        );
      }
    });
}
export function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("invalid JSON");
    throw error;
  }
}
