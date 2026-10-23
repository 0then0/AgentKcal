# Configuration reference

AgentKcal stores source settings and energy coefficients in `config.json` inside its data directory. Create the file with `node dist/cli.js init`, then edit it with a text editor. Configuration is read when a command or dashboard request needs it.

## Data directory

Location priority:
1. `--data-dir PATH`.
2. `AGENTKCAL_HOME`.
3. `$XDG_DATA_HOME/agentkcal`, or `~/.local/share/agentkcal` when `XDG_DATA_HOME` is unset.

Use an absolute path when the CLI and an agent integration must share the same ledger. Relative paths resolve from the process's working directory. Tilde expansion is supported for `~` and `~/...`.

The directory contains `config.json`, `usage.sqlite3` and SQLite's associated write-ahead log/shared-memory files. Browser language, theme and food preferences are stored separately in localStorage.

## Default configuration

```json
{
  "version": 1,
  "sources": {},
  "energy": {
    "label": "Illustrative scenario · not a measurement",
    "pue": 1.2,
    "low_multiplier": 0.1,
    "high_multiplier": 10,
    "profiles": [
      {
        "model_pattern": "*",
        "input_wh_per_million": 100,
        "output_wh_per_million": 400,
        "cache_read_wh_per_million": 10,
        "cache_write_wh_per_million": 125,
        "reasoning_wh_per_million": 400
      }
    ]
  }
}
```

`version` must be `1`. Initialization preserves an existing file. If configuration is invalid, the command reports an error instead of silently applying different coefficients.

## Sources

`sources` maps adapter IDs to lists of file or directory paths. For example, add these entries when the files exist:

```json
{
  "cursor": ["~/Downloads/cursor-usage.csv"],
  "opencode": ["~/exports/opencode"],
  "cline": ["/path/to/tasks"]
}
```

This object is the value of `sources` in the full configuration.
- An omitted adapter uses its default roots.
- A configured list replaces that adapter's defaults.
- An empty list disables discovery for that adapter.
- Paths support `~`, files and directories, but not shell variables or glob expressions.
- Unknown adapter IDs are reported during sync.

Claude Code, Codex and Gemini CLI have default local roots. Cursor, OpenCode, Cline and generic imports require explicit paths. See [adapter formats](adapters.md) for each directory pattern and supported file shape.

To select a path for just one import, use `sync --adapter ID --path PATH`. This does not change `sources`.

## Energy settings

`label` is a non-empty description of the scenario. It appears in the dashboard and exports; custom labels are kept in their original language. Include the basis of your coefficients so exported results remain interpretable.

`pue` is the data-center overhead multiplier and must be at least `1`. Set it to `1` if the supplied coefficients or power values already include facility overhead.

`low_multiplier` is between `0` and `1`. `high_multiplier` is at least `1`. They scale the central estimate to form a sensitivity range, including events estimated from GPU telemetry. The range is not a measured error bound or confidence interval.

All numeric settings must be finite. Boolean values and numeric strings are rejected.

## Model profiles

Profiles are tested in order. Matching uses case-insensitive glob patterns (`*`, `?` and character classes); the first match wins. The last profile must use `model_pattern: "*"` so every model has a fallback.

Each profile requires five non-negative coefficients, in Wh per million tokens:
- `input_wh_per_million`: uncached input.
- `output_wh_per_million`: output excluding separately reported reasoning.
- `cache_read_wh_per_million`: cached input reads.
- `cache_write_wh_per_million`: cache creation/write tokens.
- `reasoning_wh_per_million`: separately reported reasoning.

Copy the fallback profile, change its pattern and coefficients, and place it before `*`. Values should describe your chosen system boundary and evidence. A model name alone does not determine hardware, batching or energy consumption. [Calibration guidance](methodology.md#calibrate-a-scenario).

Changing a profile recalculates reports from the existing token counts; another import is not required. Refresh the dashboard or change a filter to read saved changes. JSON exports include the full scenario, allowing an exported estimate to be interpreted after the configuration changes.

## Storage compatibility

The ledger uses SQLite schema version `1` and identifies records by `(agent, session_id, event_id)`. Existing version-1 ledgers are read in place. A newer, unsupported schema version is rejected rather than migrated automatically.

Keep a backup before replacing or moving a data directory. [Backup and removal](privacy.md#back-up-or-remove-data).
