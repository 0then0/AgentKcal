# CLI reference

Run commands from a built repository with `node dist/cli.js`. After installing the package, use `agentkcal` instead.

```sh
node dist/cli.js --help
node dist/cli.js --version
```

## Install the CLI

From the repository:

```sh
npm ci
npm run build
npm pack
npm install --global ./agentkcal-0.1.0.tgz
```

The archive contains compiled code and dashboard assets. The installed CLI requires Node.js 24.12+; it does not need development dependencies. When installing a different version, use the archive name printed by `npm pack`.

To remove the global installation:

```sh
npm uninstall --global agentkcal
```

This removes the executable, not your usage database. [Manage local data](privacy.md#back-up-or-remove-data).

## Data directory

Set `--data-dir PATH` to keep an experiment or another workspace separate:

```sh
node dist/cli.js --data-dir ./local-data status
```

Without the flag, AgentKcal uses `AGENTKCAL_HOME`, then `$XDG_DATA_HOME/agentkcal`, or `~/.local/share/agentkcal`. See [configuration](configuration.md#data-directory).

## Initialize and inspect

```sh
node dist/cli.js init
node dist/cli.js agents
```

`init` creates the default `config.json` if it is missing and prints its path. Existing configuration is preserved.

`agents` prints JSON with each adapter's ID, title, mode, configured paths and whether any source root exists. A found directory does not necessarily contain supported usage records. This command is useful when a sync finds no data.

## Import usage

```sh
node dist/cli.js sync
node dist/cli.js sync --adapter claude
node dist/cli.js sync --adapter cursor --path ./cursor-usage.csv
node dist/cli.js sync --adapter generic --path ./first.jsonl --path ./second.jsonl
```

Without `--adapter`, sync checks every adapter's default or configured roots. `--path` selects files or directories for this invocation and requires `--adapter`; it does not save paths to the configuration. Repeat `--path` to select multiple locations.

The JSON result contains:
- `files`: files examined.
- `records`: normalized records read from successful files, including unchanged records.
- `changed`: records inserted or updated in SQLite.
- `errors` and `warnings`: per-source diagnostics.

A valid file imports in one transaction. A malformed or truncated file is skipped in full, while other files continue. Unchanged records are not duplicated. Source formats and identity rules are documented in [adapters](adapters.md).

## Compact status

```sh
node dist/cli.js status
node dist/cli.js status --days 7 --agent codex
node dist/cli.js status --agent claude --session SESSION_ID --days 0
node dist/cli.js status --sync --agent codex --language ru
node dist/cli.js status --days 0 --json
```

`status` defaults to today in UTC and reads the existing ledger. Use `--sync` to refresh configured sources before displaying it. `--agent` filters by a normalized agent ID; when combined with `--sync`, that ID must also be a registered adapter.

Supported periods are `1`, `7`, `30`, `90`, or `0` for all time. `--session` filters by a known native session ID. Cursor CSV records use the shared placeholder `cursor-csv`, not real session IDs.

`--language` accepts `en`, `ru`, `es`, `de`, `fr`, `ja` and `pt-BR`. JSON output includes totals, the selected filters, the read timestamp, the last matching event's timestamp and the scenario label. The read timestamp alone does not indicate when source files were last imported.

## Full summary

```sh
node dist/cli.js summary --days 30
node dist/cli.js summary --days 0 --agent codex --json
```

`summary` defaults to 30 days. Supported periods are `7`, `30`, `90`, or `0`. Text output shows totals and the agent breakdown. JSON also includes per-model totals, daily values, matching records and the complete energy scenario.

All periods use UTC calendar days including today. Future-dated events are omitted until their timestamps are reached. Empty days are included in fixed-length daily series. A summary reads the ledger without refreshing logs.

## Export

```sh
node dist/cli.js export --days 30 --format json --output usage.json
node dist/cli.js export --days 0 --agent codex --format csv --output usage.csv
node dist/cli.js export --days 7 --format json
```

Without `--output`, export writes to stdout. A file is created exclusively: an existing destination is never overwritten. Supported formats are `json` (default) and `csv`; periods and agent filtering match `summary`.

JSON includes the normalized records, totals and exact scenario configuration. CSV includes a JSON-valued `scenario` column on each row. Text fields beginning with spreadsheet formula markers receive a leading apostrophe. Exports contain every matching record, while the dashboard's recent-usage table shows at most 100.

Exported identifiers and model names can still contain identifying metadata. Treat the resulting files as private usage records.

## Dashboard and demo

```sh
node dist/cli.js serve
node dist/cli.js --data-dir ./local-data serve --port 8766
node dist/cli.js demo --port 8767
```

Both commands bind to IPv4 `127.0.0.1`. Open the exact URL printed by the CLI. The default port is `8765`; `--port 0` requests a free port. Press Ctrl+C to stop.

`serve` uses the selected data directory. `demo` uses a separate temporary ledger with synthetic data and disables log sync. Its temporary files are removed on normal shutdown.

## Agent integration commands

```sh
node dist/cli.js integration --agent claude --language ru
node dist/cli.js integration --agent codex
node dist/cli.js mcp
```

`integration` prints configuration for `claude`, `codex`, `gemini`, `cursor`, `opencode`, `cline` or generic `mcp`. It never edits host settings. `--language` controls the generated Claude status line.

`mcp` runs the local stdio server. Its stdout is reserved for newline-delimited MCP messages, so start it through an MCP host rather than using it as an interactive summary command.

`statusline --language CODE` is the native Claude entry point. Claude supplies JSON on stdin with `session_id` and `transcript_path`; malformed or temporarily incomplete input produces a short unavailable message. [Integration setup](integrations.md).

## Exit codes and troubleshooting

- `0`: the command succeeded. The Claude status-line entry point also uses 0 for its waiting/unavailable display states.
- `1`: invalid arguments, configuration/storage errors, or any warning/error during an explicit sync. Successful files from that sync remain imported.

For **no data**, run `agents`, check source paths, import the appropriate export, and use `--days 0` for older history. A newly connected MCP host still needs its sources configured and imported.

For a **malformed or truncated source**, retry after the agent finishes writing. The skipped file does not partially import.

For an **invalid configuration**, check the JSON and required settings in [configuration](configuration.md). Values must be finite numbers, and the final model profile must be `*`.

For an **occupied port**, stop the other local server or choose another `--port`. A port change creates a different browser origin, so browser preferences may differ.
