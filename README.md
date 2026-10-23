<p align="center">
  <img
    src="src/web/assets/icon.svg"
    width="112"
    height="112"
    alt="AgentKcal icon: a microchip, a lightning bolt, and a grain"
  >
</p>

<p align="center"><strong>English</strong> · <a href="README.ru.md">Русский</a></p>

<h1 align="center">AgentKcal</h1>

<p align="center">Your AI agents, in tokens, watt-hours, and a little perspective.</p>

<p align="center">
  <a href="LICENSE"
    ><img
      src="https://img.shields.io/badge/license-Apache--2.0-285a40?style=flat-square"
      alt="License: Apache 2.0"
    ></a
  >
  <a href="https://github.com/0then0/AgentKcal/actions/workflows/ci.yml"
    ><img
      src="https://img.shields.io/github/actions/workflow/status/0then0/AgentKcal/ci.yml?branch=main&amp;label=CI&amp;style=flat-square"
      alt="GitHub Actions CI status"
    ></a
  >
  <a href="package.json"
    ><img
      src="https://img.shields.io/badge/TypeScript-7.0%2B-3178c6?style=flat-square&amp;logo=typescript&amp;logoColor=white"
      alt="TypeScript 7"
    ></a
  >
  <a href="biome.json"
    ><img
      src="https://img.shields.io/badge/Biome-2.6-60a5fa?style=flat-square&amp;logo=biome&amp;logoColor=white"
      alt="Biome lint and formatting"
    ></a
  >
  <a href="package.json"
    ><img
      src="https://img.shields.io/badge/Node.js-24.12%2B-417e38?style=flat-square&amp;logo=nodedotjs&amp;logoColor=white"
      alt="Node.js 24.12 or newer"
    ></a
  >
  <a href="docs/adapters.md"
    ><img
      src="https://img.shields.io/badge/adapters-7-285a40?style=flat-square"
      alt="7 adapters"
    ></a
  >
  <a href="docs/privacy.md"
    ><img
      src="https://img.shields.io/badge/data-local_only-285a40?style=flat-square"
      alt="Local data only"
    ></a
  >
  <a href="package.json"
    ><img
      src="https://img.shields.io/badge/runtime_dependencies-0-59665d?style=flat-square"
      alt="Zero runtime dependencies"
    ></a
  >
  <a href=".github/workflows/ci.yml"
    ><img
      src="https://img.shields.io/badge/status-alpha-c18c4e?style=flat-square"
      alt="Alpha software"
    ></a
  >
</p>

AgentKcal brings usage from AI coding agents into one local ledger. See consumed tokens, explore configurable energy estimates in watt-hours and kilocalories, and compare that energy with familiar foods.

Use the CLI or an in-agent summary during everyday work, then open the dashboard for history and comparisons. Records stay in a local SQLite database; AgentKcal makes no outbound network requests.

**Energy values are estimates based on configurable assumptions, not power measurements.** Kilocalories express equivalent physical energy, not food consumed or calories burned. [How estimates work](docs/methodology.md).

[![AgentKcal dashboard with synthetic usage, energy estimates, food comparisons and agent history](docs/images/dashboard.png)](docs/images/dashboard.png)

_Dashboard in light mode with synthetic demo data. Open the image to view the full-resolution screenshot._

## Quick start

Requires **Node.js 24.12+** and npm.

```sh
git clone https://github.com/0then0/AgentKcal.git
cd AgentKcal
npm ci
npm run build
npm run demo
```

Open **http://127.0.0.1:8765**. The demo uses a temporary database, does not read your agent logs, and removes its data when stopped normally. Press **Ctrl+C** to stop the server.

The examples below run directly from the repository. You can also [install the CLI from a package](docs/cli.md#install-the-cli).

## Track your usage

```sh
# Create configuration and inspect available adapters.
node dist/cli.js init
node dist/cli.js agents

# Import local logs and show today's UTC usage.
node dist/cli.js sync
node dist/cli.js status

# View a longer period or open the dashboard.
node dist/cli.js summary --days 30
node dist/cli.js serve
```

Imports can be repeated: unchanged events are skipped and updated snapshots replace existing records. Dashboard sync runs the same import as the CLI. Refreshing the page alone reads the ledger without importing logs.

For agents that use exports or explicitly selected task journals:

```sh
node dist/cli.js sync --adapter cursor --path ./cursor-usage.csv
node dist/cli.js sync --adapter opencode --path ./session-export.json
node dist/cli.js sync --adapter cline --path /path/to/tasks
```

For an isolated example that does not use your existing ledger:

```sh
node dist/cli.js --data-dir ./local-data sync --adapter generic --path examples/usage.jsonl
node dist/cli.js --data-dir ./local-data summary --days 0
```

See the [CLI reference](docs/cli.md) for filtering, export formats, exit codes and all commands.

## Supported agents

- **Claude Code:** local project JSONL, including nested subagent journals. Honors `CLAUDE_CONFIG_DIR`.
- **Codex:** local rollout JSONL from sessions and archived sessions. Honors `CODEX_HOME`.
- **Gemini CLI:** local session JSON and JSONL under `~/.gemini/tmp/`.
- **Cursor:** Usage CSV exports with the required token columns.
- **OpenCode:** session JSON exports in classic or flat message format.
- **Cline:** explicitly selected `ui_messages.json` task journals.
- **Other agents:** normalized JSONL through the `generic` adapter, or a dedicated TypeScript adapter.

Support depends on the source format and the availability of usage counters. Connecting an agent to MCP does not add missing telemetry. [Formats, default paths and accounting rules](docs/adapters.md).

## See usage inside your agent

```sh
node dist/cli.js status --agent codex --sync --language en
node dist/cli.js integration --agent claude --language en
node dist/cli.js integration --agent codex
```

- **Claude Code:** a native, persistent status line shows the current session's tokens and approximate Wh/kcal without invoking a model.
- **Codex, Gemini CLI, Cursor, OpenCode and Cline:** a local stdio MCP server provides compact summaries on demand inside the conversation. Skills and command templates make the tools easier to invoke.

The `integration` command prints settings to merge into your agent's configuration. It does not change that configuration. MCP separates `get_usage` from `sync_usage`, so reading a summary does not silently import logs.

MCP summaries enter the agent's context and may be sent to its model provider. Your underlying ledger remains local. [Set up an integration](docs/integrations.md).

## Languages, themes and food comparisons

The dashboard and compact summaries support **English, Russian, Spanish, German, French, Japanese and Brazilian Portuguese**. Language codes: `en`, `ru`, `es`, `de`, `fr`, `ja`, `pt-BR`.

The first visit uses a supported browser language; you can change it in the top bar. Numbers, dates and portion labels follow the selected locale. Agent/model IDs, custom scenario labels, source diagnostics and export field names retain their original form. General CLI help and full text reports are in English.

Choose **System**, **Light** or **Dark**. System follows live OS theme changes. Language, theme and the selected food are saved in browser localStorage and shared between tabs at the same local address.

The food panel compares estimated kcal with **buckwheat, dumplings, bread, milk, bananas, rice, corn or potatoes**. Each product states its assumed portion and energy value. Five illustrations show whole or partial portions; a badge counts additional portions. The progress bar shows the fraction of the next portion. These are energy comparisons, not a dietary target or a record of food consumed. [Portions, formulas and sources](docs/methodology.md#food-comparisons).

## Estimates and accuracy

Adapters normalize usage into disjoint token buckets:

```text
input + output + cache_read + cache_write + reasoning = total_tokens
```

The default token scenario uses configurable Wh-per-million coefficients and a data-center overhead factor, PUE:

```text
Wh = PUE × Σ(bucket_tokens × bucket_Wh_per_million / 1,000,000)
kcal = Wh × 3,600 / 4,184
```

The initial coefficients are **100 input, 400 output, 10 cache read, 125 cache write and 400 reasoning**, with **PUE 1.2**. They are illustrative assumptions shared across models, not vendor efficiency benchmarks. When paired GPU time and power are supplied, `PUE × gpu_seconds × gpu_watts / 3,600` replaces the token estimate for that event.

The default **0.1×–10×** range shows sensitivity to those assumptions. It is not a statistical confidence interval; actual energy may lie outside it. Training, hardware manufacturing, network traffic, your device and unrecorded agent work are outside the estimate. [Methodology and calibration](docs/methodology.md).

## Configuration and privacy

The data directory is selected by `--data-dir`, then `AGENTKCAL_HOME`, then `$XDG_DATA_HOME/agentkcal` or `~/.local/share/agentkcal`.

`init` creates `config.json` without overwriting an existing file. Configure source paths and model profiles there. Changing energy settings recalculates reports from the original counts without another import. [Configuration reference](docs/configuration.md).

SQLite stores usage identifiers, UTC timestamps, model IDs, token counts and optional GPU telemetry. Prompts, responses, tool arguments and credentials are not stored. The dashboard binds to `127.0.0.1`; it is intended for one person's local machine. [Data handling, backups and trust boundaries](docs/privacy.md).

## Documentation

- [CLI reference](docs/cli.md): commands, filters, exports and troubleshooting.
- [Configuration](docs/configuration.md): data locations, source discovery and energy profiles.
- [Agent integrations](docs/integrations.md): Claude status line, MCP and host commands.
- [Adapter formats](docs/adapters.md): supported records and deduplication rules.
- [Methodology](docs/methodology.md): assumptions, formulas and food values.
- [Privacy](docs/privacy.md): stored data, permissions and local access.
- [Extension guide](docs/extending.md): TypeScript adapter and provider interfaces.

## Development

The application uses TypeScript 7, Node's built-in SQLite and HTTP APIs, and plain HTML/CSS. There are no runtime npm dependencies. Biome handles linting and formatting.

```sh
npm ci
npm run check
npm run typecheck
npm test
npm run test:package
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for project structure, testing and contribution guidelines. Dependency updates are grouped monthly through Dependabot; major upgrades require manual review.

## Project status

AgentKcal **0.1.x is alpha software**. Source formats can change. Imports rescan selected files, and reports load matching events into memory, so large histories can take time and memory. Deleted logs, incomplete counters, compacted histories and forks can affect completeness or create ambiguous identities. See [known accounting limitations](docs/adapters.md#identity-and-completeness).


Licensed under [Apache-2.0](LICENSE). [Security policy](SECURITY.md) · [Code of conduct](CODE_OF_CONDUCT.md).
