import { type UsageEvent, usageEvent } from "./models.ts";

export function demoEvents(now = new Date()): UsageEvent[] {
  const models = {
    claude: "claude-sonnet",
    codex: "gpt-codex",
    gemini: "gemini-pro",
    cursor: "claude-sonnet",
    opencode: "local-model",
    cline: "unknown",
  };
  const events: UsageEvent[] = [];
  for (let day = 0; day < 30; day++)
    for (const [index, [agent, model]] of Object.entries(models).entries()) {
      if ((day + index) % 5 === 0) continue;
      const date = new Date(now);
      date.setUTCHours(0, 0, 0, 0);
      date.setUTCDate(date.getUTCDate() - day);
      const weight = 1 + ((day * 7 + index * 11) % 19) / 10;
      events.push(
        usageEvent({
          agent,
          model,
          event_id: `demo-${day}-${index}`,
          session_id: `demo-${day}-${agent}`,
          timestamp: date.toISOString(),
          input_tokens: Math.trunc(32000 * weight * (6 - index)),
          output_tokens: Math.trunc(8500 * weight),
          cache_read_tokens: Math.trunc(54000 * weight),
          cache_write_tokens: Math.trunc(4200 * weight),
          reasoning_tokens: agent === "codex" ? Math.trunc(2100 * weight) : 0,
          gpu_seconds: agent === "opencode" ? 120 * weight : null,
          gpu_watts: agent === "opencode" ? 180 : null,
        }),
      );
    }
  return events;
}
