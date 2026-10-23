type ControlMap = {
  food: HTMLSelectElement;
  days: HTMLSelectElement;
  agent: HTMLSelectElement;
  language: HTMLSelectElement;
  theme: HTMLSelectElement;
  sync: HTMLButtonElement;
  "export-json": HTMLButtonElement;
  "export-csv": HTMLButtonElement;
};
function $<K extends keyof ControlMap>(id: K): ControlMap[K];
function $(id: string): HTMLElement;
function $(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing UI element: ${id}`);
  return node;
}
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
const titles: Record<string, string> = {
  claude: "Claude Code",
  codex: "Codex",
  gemini: "Gemini CLI",
  cursor: "Cursor",
  opencode: "OpenCode",
  cline: "Cline",
  generic: "Universal JSONL",
};
const symbols: Record<string, string> = {
  claude: "✳",
  codex: "⌘",
  gemini: "✧",
  cursor: "↗",
  opencode: "◧",
  cline: "▤",
  generic: "{}",
};
const preferences = window.AgentKcalPreferences;
const { t: tr, locale } = window.AgentKcalI18n;
let { integer, compact, decimal } = window.AgentKcalI18n.formats();
let state: DashboardStatus | null = null;
let requestNumber = 0;
let chartRows: ChartRow[] = [];
let summaryFailed = false;
let summaryPending = true;
let lastReport: DashboardReport | null = null;
let currentNotice: { message: string | (() => string); error: boolean } | null = null;
let syncing = false;

function agentTitle(agent: string) {
  return agent === "generic" ? tr(titles.generic) : titles[agent] || agent;
}

function foodAmount(value: number) {
  return value > 0 && value < 0.01
    ? tr("Less than {amount}", { amount: decimal.format(0.01) })
    : decimal.format(value);
}

function renderFood(data: DashboardReport) {
  const catalog = window.AgentKcalFoods;
  const selected = preferences.food;
  $("food").replaceChildren(...catalog.items.map((food) => new Option(tr(food.title), food.id)));
  $("food").value = selected;
  const result = catalog.equivalent(data.totals.kcal, selected);
  $("food-quantity").textContent =
    result.quantity > 0 && result.quantity < 0.01
      ? foodAmount(result.quantity)
      : `≈ ${decimal.format(result.quantity)}`;
  $("food-units").textContent = catalog.units(result.food, result.quantity, preferences.language);
  $("food-period").textContent = tr("Current filters: {period} · {agent}", {
    period: $("days").selectedOptions[0].textContent,
    agent: $("agent").selectedOptions[0].textContent,
  });
  $("food-basis").textContent = tr("One portion: {portion} · {kcal} kcal", {
    portion: tr(result.food.portion),
    kcal: decimal.format(result.portionKcal),
  });
  const low = catalog.equivalent((data.totals.low_wh * 3600) / 4184, selected).quantity;
  const high = catalog.equivalent((data.totals.high_wh * 3600) / 4184, selected).quantity;
  $("food-range").textContent = tr("Scenario range: {low}–{high} portions", {
    low: decimal.format(low),
    high: decimal.format(high),
  });
  const percent = result.fraction * 100;
  $("food-percent").textContent = `${foodAmount(percent)}%`;
  $("food-progress").setAttribute("aria-valuenow", String(percent));
  $("food-progress").setAttribute(
    "aria-valuetext",
    tr("{percent}% of the next portion", { percent: foodAmount(percent) }),
  );
  $("food-progress-fill").style.width = `${percent}%`;
  $("food-extra").hidden = result.extra === 0;
  $("food-extra").textContent =
    result.extra > 0 && result.extra < 0.01
      ? `+< ${decimal.format(0.01)}`
      : `+${decimal.format(result.extra)}`;
  $("food-visual-caption").textContent = tr(
    result.extra > 0
      ? "First five portions shown; additional portions are counted above."
      : "One icon = one portion. Partial fill = part of a portion.",
  );

  const ns = "http://www.w3.org/2000/svg";
  const svgNode = (tag: string, attributes: Record<string, string | number>) => {
    const node = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    return node;
  };
  $("food-icons").replaceChildren(
    ...result.icons.map((fill, index) => {
      const icon = svgNode("svg", { viewBox: "0 0 84 84", focusable: "false" });
      const defs = svgNode("defs", {});
      const clipId = `food-portion-${index}`;
      const clip = svgNode("clipPath", { id: clipId });
      clip.append(svgNode("rect", { x: 0, y: 0, width: 84 * fill, height: 84 }));
      defs.append(clip);
      const href = `/assets/foods.svg#${selected}`;
      icon.append(
        defs,
        svgNode("use", { href, opacity: ".16" }),
        svgNode("use", { href, "clip-path": `url(#${clipId})` }),
      );
      return icon;
    }),
  );
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function avatar(agent: string) {
  const node = element("span", "agent-avatar", symbols[agent] || agent.slice(0, 1).toUpperCase());
  node.dataset.agent = agent;
  node.setAttribute("aria-hidden", "true");
  return node;
}
function notice(message: string | (() => string), error = false) {
  currentNotice = { message, error };
  $("notice").textContent = typeof message === "function" ? message() : tr(message);
  $("notice").classList.toggle("error", error);
  $("notice").hidden = false;
}
async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || tr("Request failed ({status})", { status: response.status }));
  return data as T;
}
function params() {
  const query = new URLSearchParams({ days: $("days").value });
  if ($("agent").value) query.set("agent", $("agent").value);
  return query;
}
function renderChart(rows: ChartRow[]) {
  const svgNS = "http://www.w3.org/2000/svg";
  const create = (tag: string, attrs: Record<string, string | number>, text?: string) => {
    const node = document.createElementNS(svgNS, tag);
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const width = Math.max(260, $("chart").clientWidth - 29);
  const svg = create("svg", {
    viewBox: `0 0 ${width} 210`,
    role: "img",
    "aria-label": tr("Daily estimated energy. {days} days. Values in watt-hours.", {
      days: integer.format(rows.length),
    }),
    preserveAspectRatio: "none",
  });
  const max = Math.max(...rows.map((r) => r.wh), 0.01) * 1.15;
  const left = 43,
    right = width - 12,
    top = 12,
    bottom = 176;
  for (let i = 0; i <= 4; i++) {
    const y = top + ((bottom - top) * i) / 4;
    svg.append(create("line", { x1: left, y1: y, x2: right, y2: y, class: "gridline" }));
    svg.append(
      create(
        "text",
        { x: left - 10, y: y + 4, "text-anchor": "end" },
        decimal.format(max * (1 - i / 4)),
      ),
    );
  }
  if (!rows.length || !rows.some((r) => r.records)) {
    svg.append(
      create(
        "text",
        { x: (left + right) / 2, y: 100, "text-anchor": "middle" },
        tr("No usage in this period"),
      ),
    );
  }
  rows.forEach((row, index) => {
    const step = (right - left) / rows.length;
    const h = (row.wh / max) * (bottom - top);
    const rect = create("rect", {
      x: left + step * index + step * 0.19,
      y: bottom - h,
      width: Math.max(1, step * 0.62),
      height: h,
      rx: 2,
      class: "bar",
    });
    rect.append(
      create(
        "title",
        {},
        tr("{date}: {wh} Wh · {tokens} tokens", {
          date: row.date,
          wh: decimal.format(row.wh),
          tokens: integer.format(row.total_tokens),
        }),
      ),
    );
    svg.append(rect);
    const interval = Math.max(1, Math.ceil(rows.length / (width < 400 ? 4 : 6)));
    if (index % interval === 0 || index === rows.length - 1) {
      if (index === rows.length - 1 && index % interval !== 0 && index % interval < interval - 1)
        return;
      const label = new Date(`${row.date}T00:00:00Z`).toLocaleDateString(locale(), {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      });
      svg.append(
        create("text", { x: left + step * (index + 0.5), y: 200, "text-anchor": "middle" }, label),
      );
    }
  });
  $("chart").replaceChildren(svg);
  const date = (value: string) =>
    new Date(`${value}T00:00:00Z`).toLocaleDateString(locale(), {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  $("chart-period").textContent = rows.length
    ? `${date(rows[0].date)} — ${date(rows[rows.length - 1].date)}`
    : tr("No recorded dates");
}
function render(data: DashboardReport) {
  const t = data.totals;
  $("tokens").textContent = compact.format(t.total_tokens);
  $("tokens").title = integer.format(t.total_tokens);
  $("record-count").textContent = integer.format(t.records);
  $("record-label").textContent = window.AgentKcalI18n.usageRecords(t.records);
  $("wh").textContent = decimal.format(t.wh);
  $("range").textContent = tr("{low}–{high} Wh", {
    low: decimal.format(t.low_wh),
    high: decimal.format(t.high_wh),
  });
  $("kcal").textContent = decimal.format(t.kcal);
  $("pue").textContent = decimal.format(data.scenario.pue);
  $("scenario-label").textContent =
    data.scenario.label === "Illustrative scenario · not a measurement"
      ? tr(data.scenario.label)
      : data.scenario.label;
  const allInput = t.input_tokens + t.cache_read_tokens + t.cache_write_tokens;
  $("cache-share").textContent = tr("{percent}% cached input", {
    percent: integer.format(allInput ? Math.round((t.cache_read_tokens / allInput) * 100) : 0),
  });
  const selected = $("agent").value;
  $("agent").replaceChildren(new Option(tr("All agents"), ""));
  for (const agent of data.agents) $("agent").add(new Option(agentTitle(agent), agent));
  if (selected && !data.agents.includes(selected))
    $("agent").add(new Option(agentTitle(selected), selected));
  $("agent").value = selected;
  renderFood(data);
  const daily = data.daily.slice(-90);
  chartRows = daily;
  renderChart(daily);
  $("chart-caption").textContent = tr(
    data.daily.length > 90
      ? "Most recent 90 recorded days · estimated Wh"
      : "Estimated watt-hours over time",
  );
  const breakdown = $("agent-breakdown");
  breakdown.replaceChildren();
  const agents = Object.entries(data.by_agent).sort((a, b) => b[1].wh - a[1].wh);
  $("agent-count").textContent = String(agents.length);
  if (!agents.length)
    breakdown.append(element("p", "no-data", tr("Agent totals will appear after import.")));
  for (const [agent, row] of agents) {
    const item = element("div", "agent-row");
    const info = element("div", "agent-info");
    info.append(element("strong", "", agentTitle(agent)));
    const track = element("div", "agent-track");
    const fill = element("div", "agent-fill");
    fill.style.width = `${t.wh ? (row.wh / t.wh) * 100 : 0}%`;
    track.append(fill);
    info.append(track);
    const value = element("div", "agent-value", tr("{wh} Wh", { wh: decimal.format(row.wh) }));
    value.append(
      element(
        "small",
        "",
        tr("{percent}% of total", {
          percent: integer.format(t.wh ? Math.round((row.wh / t.wh) * 100) : 0),
        }),
      ),
    );
    item.append(avatar(agent), info, value);
    breakdown.append(item);
  }
  const body = $("records");
  body.replaceChildren();
  $("empty").hidden = !!data.records.length;
  $("records-wrap").hidden = !data.records.length;
  $("ledger-count").textContent = tr("{shown} OF {total} RECORDS", {
    shown: integer.format(data.records.length),
    total: integer.format(t.records),
  });
  for (const record of data.records) {
    const tableRow = element("tr");
    const agentCell = element("td");
    const label = element("div", "record-agent");
    const copy = element("div");
    copy.append(element("strong", "", agentTitle(record.agent)));
    const model = element("small", "", record.model === "unknown" ? tr("unknown") : record.model);
    model.title = record.model;
    copy.append(model);
    label.append(avatar(record.agent), copy);
    agentCell.append(label);
    const date = new Date(record.timestamp).toLocaleString(locale(), {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
      hourCycle: "h23",
    });
    const energy = element("td", "numeric", decimal.format(record.energy.wh));
    if (record.energy.method === "compute")
      energy.append(element("span", "method-indicator", tr("GPU scenario")));
    tableRow.append(
      agentCell,
      element("td", "muted", date),
      element("td", "numeric", integer.format(record.total_tokens)),
      energy,
      element("td", "numeric", decimal.format(record.energy.kcal)),
    );
    body.append(tableRow);
  }
  renderExports();
  $("updated").textContent = tr("Read at {time} UTC · stored locally", {
    time: new Date(data.generated_at).toLocaleTimeString(locale(), {
      timeZone: "UTC",
      hourCycle: "h23",
    }),
  });
}
function renderExports() {
  const disabled = summaryPending || summaryFailed || !lastReport;
  for (const format of ["csv", "json"] as const) {
    const link = $(`export-${format}`);
    link.disabled = disabled;
  }
}
async function refresh() {
  const number = ++requestNumber;
  summaryPending = true;
  renderExports();
  $("content").setAttribute("aria-busy", "true");
  try {
    const data = await api<DashboardReport>(`/api/summary?${params()}`);
    if (number !== requestNumber) return;
    lastReport = data;
    $("content").hidden = false;
    render(data);
    if (summaryFailed) notice("Local usage loaded. The current filters are applied.");
    summaryFailed = false;
  } catch (error) {
    if (number !== requestNumber) return;
    notice(
      () =>
        tr(
          "Could not read local usage: {error}. Check config.json and try changing the period to reload.",
          { error: errorText(error) },
        ),
      true,
    );
    // Never leave stale totals displayed as the newly selected filter's result.
    $("content").hidden = true;
    summaryFailed = true;
  } finally {
    if (number === requestNumber) {
      summaryPending = false;
      renderExports();
      $("loading").hidden = true;
      $("content").setAttribute("aria-busy", "false");
    }
  }
}
async function loadStatus() {
  state = await api<DashboardStatus>("/api/status");
  $("demo-badge").hidden = !state.demo;
  if (state.demo) {
    notice(
      "You’re viewing synthetic demo data in a temporary ledger. Your agent logs have not been read.",
    );
  }
  renderSyncButton();
  renderAdapters();
}
function renderSyncButton() {
  $("sync").disabled = syncing || !!state?.demo;
  $("sync").textContent = syncing ? tr("Syncing…") : `↻ ${tr("Sync local logs")}`;
  $("sync").title = state?.demo
    ? tr("Demo is isolated. Run agentkcal serve to sync your own logs.")
    : "";
}
function renderAdapters() {
  if (!state) return;
  const list = $("adapter-list");
  list.replaceChildren();
  for (const adapter of state.adapters) {
    const row = element("div", "adapter");
    const text = element("div", "adapter-copy");
    text.append(
      element("strong", "", adapter.id === "generic" ? tr(adapter.title) : adapter.title),
      element("small", "", tr(adapter.mode)),
    );
    const label = tr(state.demo ? "Demo" : adapter.available ? "Source found" : "Import / setup");
    row.append(
      avatar(adapter.id),
      text,
      element("span", `adapter-status${adapter.available && !state.demo ? " ready" : ""}`, label),
    );
    list.append(row);
  }
}
function applyPreferences() {
  window.AgentKcalI18n.apply();
  ({ integer, compact, decimal } = window.AgentKcalI18n.formats());
  $("language").value = preferences.language;
  $("theme").value = preferences.theme;
  renderSyncButton();
  renderAdapters();
  if (lastReport && !summaryFailed) render(lastReport);
  if (currentNotice) notice(currentNotice.message, currentNotice.error);
}
window.addEventListener("agentkcal:preferences", applyPreferences);
$("language").addEventListener("change", () => preferences.setLanguage($("language").value));
$("theme").addEventListener("change", () => preferences.setTheme($("theme").value));
$("food").addEventListener("change", () => preferences.setFood($("food").value));
applyPreferences();
renderExports();
for (const format of ["csv", "json"] as const) {
  const button = $(`export-${format}`);
  button.addEventListener("click", () => {
    if (!button.disabled) window.location.assign(`/api/export?${params()}&format=${format}`);
  });
}
$("days").addEventListener("change", refresh);
$("agent").addEventListener("change", refresh);
window.addEventListener("resize", () => renderChart(chartRows));
$("sync").addEventListener("click", async () => {
  syncing = true;
  renderSyncButton();
  try {
    if (!state) await loadStatus();
    if (!state) throw new Error("Adapter status unavailable");
    const result = await api<DashboardSync>("/api/sync", {
      method: "POST",
      headers: { "X-AgentKcal-Token": state.token },
    });
    const messages = [...result.errors, ...result.warnings];
    notice(() => {
      const suffix = tr(
        !result.files
          ? "No supported sources found. Run agentkcal agents to inspect paths, or configure export sources."
          : "Your ledger is up to date.",
      );
      return (
        tr("Read {files} files · {changed} records added or updated.", {
          files: integer.format(result.files),
          changed: integer.format(result.changed),
        }) + (messages.length ? `\n${messages.join("\n")}` : ` ${suffix}`)
      );
    }, !!messages.length);
    await refresh();
  } catch (error) {
    notice(() => tr("Sync failed: {error}", { error: errorText(error) }), true);
  } finally {
    syncing = false;
    renderSyncButton();
  }
});
(async () => {
  try {
    await loadStatus();
  } catch (error) {
    notice(() => tr("Could not load adapter status: {error}", { error: errorText(error) }), true);
  }
  await refresh();
})();
