import { existsSync } from "node:fs";
import { basename } from "node:path";
import { files } from "./adapters/base.ts";
import { ADAPTERS, type Adapter } from "./adapters/index.ts";
import { type Config, type EnergySettings, expandPath } from "./config.ts";
import { errorMessage, TOKEN_FIELDS, type Tokens, totalTokens, type UsageEvent } from "./models.ts";
import { type EnergyEstimate, type EnergyProvider, ScenarioProvider } from "./providers/energy.ts";
import type { Store } from "./storage.ts";

export interface AdapterStatus {
  id: string;
  title: string;
  mode: string;
  configured: boolean;
  available: boolean;
  paths: string[];
}
export interface SyncResult {
  files: number;
  records: number;
  changed: number;
  errors: string[];
  warnings: string[];
}
export interface Totals extends Tokens {
  records: number;
  total_tokens: number;
  wh: number;
  low_wh: number;
  high_wh: number;
  kcal: number;
}
export type UsageRecord = UsageEvent & { total_tokens: number; energy: EnergyEstimate };
export type Daily = Totals & { date: string };
export interface Report {
  totals: Totals;
  by_agent: Record<string, Totals>;
  by_model: Record<string, Totals>;
  daily: Daily[];
  records: UsageRecord[];
  agents: string[];
  days: number;
  timezone: "UTC";
  scenario: EnergySettings;
  generated_at: string;
}
function rootsFor(adapter: Adapter, config: Config): string[] {
  return (config.sources[adapter.name] ?? adapter.defaultRoots()).map(expandPath);
}
export function adapterStatus(config: Config): AdapterStatus[] {
  return [...ADAPTERS.values()].map((adapter) => {
    const paths = rootsFor(adapter, config);
    return {
      id: adapter.name,
      title: adapter.title,
      mode: adapter.mode,
      configured: !!config.sources[adapter.name]?.length,
      available: paths.some((path) => existsSync(path)),
      paths,
    };
  });
}
export function sync(
  store: Store,
  config: Config,
  adapterName?: string,
  paths?: string[],
): SyncResult {
  const unknown = Object.keys(config.sources).filter((key) => !ADAPTERS.has(key));
  if (unknown.length) throw new Error(`unknown adapters in config: ${unknown.sort().join(", ")}`);
  if (paths?.length && !adapterName) throw new Error("--path requires --adapter");
  const selected = adapterName ? ADAPTERS.get(adapterName) : undefined;
  if (adapterName && !selected) throw new Error("unknown adapter");
  const result: SyncResult = { files: 0, records: 0, changed: 0, errors: [], warnings: [] };
  for (const adapter of selected ? [selected] : ADAPTERS.values()) {
    const roots = paths?.length ? paths.map(expandPath) : rootsFor(adapter, config);
    for (const root of roots)
      if (!existsSync(root) && (paths?.length || Object.hasOwn(config.sources, adapter.name)))
        result.warnings.push(`${adapter.name}: source does not exist: ${root}`);
    let candidates: string[];
    try {
      candidates = files(adapter, roots);
    } catch (error) {
      result.errors.push(`${adapter.name}: ${errorMessage(error)}`);
      continue;
    }
    for (const path of candidates) {
      result.files++;
      try {
        // Materialize the whole file before beginning the transaction.
        const events = adapter.read(path);
        result.changed += store.upsert(events);
        result.records += events.length;
        if (!events.length)
          result.warnings.push(`${adapter.name}: ${basename(path)}: no supported usage records`);
      } catch (error) {
        result.errors.push(`${adapter.name}: ${basename(path)}: ${errorMessage(error)}`);
      }
    }
  }
  return result;
}
function totals(): Totals {
  return {
    records: 0,
    total_tokens: 0,
    wh: 0,
    low_wh: 0,
    high_wh: 0,
    kcal: 0,
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    reasoning_tokens: 0,
  };
}
function add(target: Totals, event: UsageEvent, estimate: EnergyEstimate): void {
  target.records++;
  target.total_tokens += totalTokens(event);
  for (const key of TOKEN_FIELDS) target[key] += event[key];
  for (const key of ["wh", "low_wh", "high_wh", "kcal"] as const) target[key] += estimate[key];
  if (
    ![target.records, target.total_tokens, ...TOKEN_FIELDS.map((key) => target[key])].every(
      Number.isSafeInteger,
    )
  )
    throw new Error("token totals exceed the safe integer range");
}
export function summarizeEvents(events: UsageEvent[], provider: EnergyProvider): Totals {
  const result = totals();
  for (const event of events) add(result, event, provider.estimate(event));
  if (!Object.values(result).every(Number.isFinite))
    throw new Error("report exceeds numeric range");
  return result;
}
export function report(
  store: Store,
  config: Config,
  days = 30,
  agent?: string,
  now = new Date(),
  provider: EnergyProvider = new ScenarioProvider(config.energy),
): Report {
  if (![0, 7, 30, 90].includes(days)) throw new Error("days must be 0, 7, 30 or 90");
  const end = now.toISOString();
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - days + 1);
  const overall = totals(),
    byAgent = new Map<string, Totals>(),
    byModel = new Map<string, Totals>(),
    daily = new Map<string, Totals>();
  const bucket = (map: Map<string, Totals>, key: string) => {
    let row = map.get(key);
    if (!row) {
      row = totals();
      map.set(key, row);
    }
    return row;
  };
  if (days)
    for (let i = 0; i < days; i++) {
      const date = new Date(start);
      date.setUTCDate(date.getUTCDate() + i);
      daily.set(date.toISOString().slice(0, 10), totals());
    }
  const records: UsageRecord[] = [];
  for (const event of store.events(days ? start.toISOString() : undefined, agent)) {
    if (event.timestamp > end) continue;
    const estimate = provider.estimate(event);
    for (const target of [
      overall,
      bucket(byAgent, event.agent),
      bucket(byModel, event.model),
      bucket(daily, event.timestamp.slice(0, 10)),
    ])
      add(target, event, estimate);
    records.push({ ...event, total_tokens: totalTokens(event), energy: estimate });
  }
  if (!Object.values(overall).every(Number.isFinite))
    throw new Error("report exceeds numeric range");
  return {
    totals: overall,
    by_agent: Object.fromEntries(byAgent),
    by_model: Object.fromEntries(byModel),
    daily: [...daily]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, row]) => ({ date, ...row })),
    records: records.reverse(),
    agents: store.agents(),
    days,
    timezone: "UTC",
    scenario: config.energy,
    generated_at: end,
  };
}
export function exportReport(data: Report, format: string): string {
  if (format === "json") return `${JSON.stringify(data, null, 2)}\n`;
  if (format !== "csv") throw new Error("format must be json or csv");
  const columns = [
    "agent",
    "session_id",
    "event_id",
    "timestamp",
    "model",
    ...TOKEN_FIELDS,
    "total_tokens",
    "gpu_seconds",
    "gpu_watts",
    "wh",
    "low_wh",
    "high_wh",
    "kcal",
    "method",
    "profile",
    "scenario",
  ];
  const cell = (value: unknown) => {
    let str = value == null ? "" : String(value);
    if (typeof value === "string" && /^[\s]*[=+@-]/.test(str)) str = `'${str}`;
    return /[",\r\n]/.test(str) ? `"${str.replaceAll('"', '""')}"` : str;
  };
  return `${[
    columns.join(","),
    ...data.records.map(({ energy, ...record }) => {
      const flat: Record<string, unknown> = {
        ...record,
        ...energy,
        scenario: JSON.stringify(data.scenario),
      };
      return columns.map((key) => cell(flat[key])).join(",");
    }),
  ].join("\r\n")}\r\n`;
}
