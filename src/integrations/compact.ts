import { existsSync } from "node:fs";
import { ClaudeAdapter } from "../adapters/claude.ts";
import { type Config, expandPath, load } from "../config.ts";
import { object, text } from "../models.ts";
import { ScenarioProvider } from "../providers/energy.ts";
import { summarizeEvents, type Totals } from "../service.ts";
import { Store } from "../storage.ts";
import { COMPACT_MESSAGES, type Language } from "./languages.ts";

export interface Snapshot {
  totals: Totals;
  days: number;
  agent: string | null;
  session: string | null;
  generated_at: string;
  last_event_at: string | null;
  scenario_label: string;
}
export interface SnapshotOptions {
  days?: number;
  agent?: string;
  session?: string;
  now?: Date;
}
export function snapshot(store: Store, config: Config, options: SnapshotOptions = {}): Snapshot {
  const days = options.days ?? 1;
  if (![0, 1, 7, 30, 90].includes(days)) throw new Error("days must be 0, 1, 7, 30 or 90");
  const now = options.now ?? new Date(),
    start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - days + 1);
  const end = now.toISOString();
  const events = store
    .events(days ? start.toISOString() : undefined, options.agent, options.session)
    .filter((event) => event.timestamp <= end);
  return {
    totals: summarizeEvents(events, new ScenarioProvider(config.energy)),
    days,
    agent: options.agent ?? null,
    session: options.session ?? null,
    generated_at: end,
    last_event_at: events.at(-1)?.timestamp ?? null,
    scenario_label: config.energy.label,
  };
}
export function compact(data: Snapshot, language: Language = "en"): string {
  const locale = language,
    messages = COMPACT_MESSAGES[language];
  const tokens = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 2 });
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const amount = (value: number) =>
    value > 0 && value < 0.01 ? `<${number.format(0.01)}` : number.format(value);
  const period = data.session
    ? messages.session
    : data.days === 1
      ? messages.today
      : data.days === 0
        ? messages.all
        : messages.days.replace("{days}", new Intl.NumberFormat(locale).format(data.days));
  const category =
    data.totals.total_tokens >= 1000 && language === "ru"
      ? "many"
      : new Intl.PluralRules(language).select(data.totals.total_tokens);
  const tokenLabel = messages.tokens[category] ?? messages.tokens.other;
  const agent = data.agent?.replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, " ");
  return `AgentKcal · ${agent ? `${agent} · ` : ""}${period} · ${tokens.format(data.totals.total_tokens)} ${tokenLabel} · ≈${amount(data.totals.wh)} ${messages.wh} · ≈${amount(data.totals.kcal)} ${messages.kcal}`;
}
/** Native Claude statusLine input. The host supplies a transcript, never a shell command. */
export function claudeStatusline(
  dataDir: string,
  input: unknown,
  language: Language = "en",
): string {
  const row = object(input),
    session = text(row.session_id, "session_id"),
    path = expandPath(text(row.transcript_path, "transcript_path"));
  if (!existsSync(path)) return `AgentKcal · ${COMPACT_MESSAGES[language].waitingTranscript}`;
  const config = load(dataDir);
  const store = new Store(dataDir);
  try {
    store.upsert(() => new ClaudeAdapter().read(path));
    const data = snapshot(store, config, { days: 0, agent: "claude", session });
    if (!data.totals.records) return `AgentKcal · ${COMPACT_MESSAGES[language].waitingUsage}`;
    return compact(data, language);
  } finally {
    store.close();
  }
}
