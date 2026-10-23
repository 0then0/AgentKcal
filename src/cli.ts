#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { ADAPTERS } from "./adapters/index.ts";
import { defaultDataDir, expandPath, initialize, load } from "./config.ts";
import { demoEvents } from "./demo.ts";
import { claudeStatusline, compact, snapshot } from "./integrations/compact.ts";
import { integrationConfig } from "./integrations/config.ts";
import { COMPACT_MESSAGES, isLanguage, LANGUAGES } from "./integrations/languages.ts";
import { runMcp } from "./integrations/mcp.ts";
import { errorMessage } from "./models.ts";
import { listen } from "./server.ts";
import { adapterStatus, exportReport, report, sync } from "./service.ts";
import { Store } from "./storage.ts";

const HELP = `AgentKcal 0.1.0 · Local AI usage → energy scenarios → kcal.

Usage: agentkcal [--data-dir PATH] <command> [options]

  init                         Create config.json without overwriting it
  agents                       List adapters and source paths
  sync [--adapter ID] [--path PATH ...]  Import local logs (repeatable)
  summary [--days 0|7|30|90] [--agent ID] [--json]
  export [--days 0|7|30|90] [--agent ID] [--format json|csv] [--output PATH]
  status [--days 0|1|7|30|90] [--agent ID] [--session ID] [--sync] [--language CODE] [--json]
  statusline [--language CODE]  Claude Code native statusLine (JSON stdin)
  mcp                          Local stdio MCP for in-agent usage summaries
  integration --agent ID       Print native integration config; no settings changed
  serve [--port 8765]           Start loopback dashboard
  demo [--port 8765]            Start isolated synthetic dashboard

Options: --help, --version, --data-dir (or AGENTKCAL_HOME)
Languages: en, ru, es, de, fr, ja, pt-BR
Days use UTC calendar dates, including today. 0 = all time.
Estimates are illustrative scenarios, not measurements.
`;
async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      "data-dir": { type: "string" },
      version: { type: "boolean" },
      help: { type: "boolean", short: "h" },
      adapter: { type: "string" },
      path: { type: "string", multiple: true },
      days: { type: "string" },
      agent: { type: "string" },
      json: { type: "boolean" },
      format: { type: "string" },
      output: { type: "string" },
      port: { type: "string" },
      session: { type: "string" },
      sync: { type: "boolean" },
      language: { type: "string" },
    },
  });
  if (values.version) {
    console.log("0.1.0");
    return 0;
  }
  if (values.help || !positionals.length) {
    process.stdout.write(HELP);
    return 0;
  }
  const command = positionals[0];
  const allowed: Record<string, string[]> = {
    init: [],
    agents: [],
    sync: ["adapter", "path"],
    summary: ["days", "agent", "json"],
    export: ["days", "agent", "format", "output"],
    serve: ["port"],
    demo: ["port"],
    status: ["days", "agent", "session", "sync", "language", "json"],
    statusline: ["language"],
    mcp: [],
    integration: ["agent", "language"],
  };
  if (!command || !Object.hasOwn(allowed, command) || positionals.length > 1)
    throw new Error("unknown command; use --help");
  for (const key of Object.keys(values))
    if (key !== "data-dir" && !allowed[command]?.includes(key))
      throw new Error(`--${key} is not supported by ${command}`);
  if (values.path && !values.adapter) throw new Error("--path requires --adapter");
  if (values.adapter && !ADAPTERS.has(values.adapter)) throw new Error("unknown adapter");
  const days = values.days ?? (command === "status" ? "1" : "30");
  if (!(command === "status" ? /^(0|1|7|30|90)$/ : /^(0|7|30|90)$/).test(days))
    throw new Error("unsupported days; use --help");
  const port = values.port ?? "8765";
  if (!/^\d+$/.test(port) || Number(port) > 65535)
    throw new Error("--port must be between 0 and 65535");
  const dataDir = expandPath(values["data-dir"] ?? defaultDataDir());
  const language = values.language ?? "en";
  if (!isLanguage(language)) throw new Error(`language must be one of: ${LANGUAGES.join(", ")}`);
  if (command === "integration") {
    if (!values.agent) throw new Error("integration requires --agent");
    process.stdout.write(integrationConfig(values.agent, dataDir, language));
    return 0;
  }
  if (command === "mcp") {
    await runMcp(dataDir);
    return 0;
  }
  if (command === "statusline") {
    try {
      const input = readFileSync(0, "utf8");
      if (Buffer.byteLength(input) > 1_048_576) throw new Error("statusLine input too large");
      console.log(claudeStatusline(dataDir, JSON.parse(input), language));
    } catch {
      console.log(`AgentKcal · ${COMPACT_MESSAGES[language].unavailable}`);
    }
    return 0;
  }
  if (command === "init") {
    console.log(initialize(dataDir));
    return 0;
  }
  if (command === "demo" || command === "serve") {
    const isolated =
      command === "demo" ? mkdtempSync(join(tmpdir(), "agentkcal-demo-")) : undefined;
    try {
      const folder = isolated ?? dataDir;
      if (isolated) {
        const store = new Store(folder);
        try {
          store.upsert(demoEvents());
        } finally {
          store.close();
        }
      } else {
        load(folder);
        initialize(folder);
      }
      const server = await listen(folder, Number(port), !!isolated),
        address = server.address();
      console.log(
        `AgentKcal${isolated ? " · SYNTHETIC DEMO" : ""}: http://127.0.0.1:${address && typeof address === "object" ? address.port : port}`,
      );
      console.log("Local only. Press Ctrl+C to stop.");
      await new Promise<void>((resolve) => {
        const stop = () => {
          server.close(() => resolve());
          server.closeAllConnections();
        };
        process.once("SIGINT", stop);
        process.once("SIGTERM", stop);
        server.once("close", () => {
          process.off("SIGINT", stop);
          process.off("SIGTERM", stop);
        });
      });
    } finally {
      if (isolated) rmSync(isolated, { recursive: true, force: true });
    }
    return 0;
  }
  const config = load(dataDir);
  if (command === "agents") {
    console.log(JSON.stringify(adapterStatus(config), null, 2));
    return 0;
  }
  initialize(dataDir);
  const store = new Store(dataDir);
  try {
    if (command === "status") {
      let failed = false;
      if (values.sync) {
        const result = sync(store, config, values.agent);
        failed = !!result.errors.length || !!result.warnings.length;
        for (const message of [...result.errors, ...result.warnings]) console.error(message);
      }
      const data = snapshot(store, config, {
        days: Number(days),
        agent: values.agent,
        session: values.session,
      });
      console.log(
        values.json
          ? JSON.stringify(data, null, 2)
          : `${compact(data, language)}${failed ? ` · ${COMPACT_MESSAGES[language].incomplete}` : ""}`,
      );
      return failed ? 1 : 0;
    }
    if (command === "sync") {
      const result = sync(store, config, values.adapter, values.path);
      console.log(JSON.stringify(result, null, 2));
      return result.errors.length || result.warnings.length ? 1 : 0;
    }
    const data = report(store, config, Number(days), values.agent);
    if (command === "export" || values.json) {
      const output = exportReport(data, command === "export" ? (values.format ?? "json") : "json");
      if (values.output)
        writeFileSync(expandPath(values.output), output, { flag: "wx", mode: 0o600 });
      else process.stdout.write(output);
    } else {
      const t = data.totals;
      console.log(
        `AgentKcal · ${Number(days) || "all"} UTC days · ${t.records.toLocaleString("en-US")} records\nTokens: ${t.total_tokens.toLocaleString("en-US")}\nEnergy scenario: ${t.wh.toFixed(3)} Wh (${t.low_wh.toFixed(3)}–${t.high_wh.toFixed(3)} Wh)\nEnergy equivalent: ${t.kcal.toFixed(3)} kcal\n${config.energy.label}`,
      );
      for (const [agent, row] of Object.entries(data.by_agent).sort())
        console.log(
          `  ${agent.padEnd(12)} ${row.total_tokens.toLocaleString("en-US").padStart(12)} tokens  ${row.wh.toFixed(3).padStart(10)} Wh`,
        );
    }
  } finally {
    store.close();
  }
  return 0;
}
try {
  process.exitCode = await main();
} catch (error) {
  console.error(`agentkcal: ${errorMessage(error)}`);
  process.exitCode = 1;
}
