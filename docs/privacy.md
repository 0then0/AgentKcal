# Local data and privacy

The app has no telemetry, vendor API clients, remote font, CDN dependency or outbound HTTP request. A normal run reads selected local source files and writes local SQLite and configuration files. Browser requests go to `127.0.0.1`. Shields.io images appear only in the GitHub README, not in the running application.

The database stores agent, session, event and model IDs; UTC timestamps; five normalized token counts; and optional GPU time/power values. Reports derive energy on demand. Prompts, responses, tool arguments, source file contents, raw usernames and credentials are not stored. IDs and model names can still be identifying metadata. Generic imports trust you to choose suitable IDs; do not put secrets or personal text in these fields.

Adapters may parse files containing conversations in memory to extract accounting. These files are never copied wholesale. Diagnostic messages can include local paths or file names and validation messages, but should not include source record bodies. `config.json` contains source paths you configure. CLI `agents` prints the source locations; the dashboard status API omits paths.

## Local files

Dashboard language, theme and comparison-product preferences use the browser's localStorage keys `agentkcal.language`, `agentkcal.theme` and `agentkcal.food` for the current local origin. Only these preferences are stored there; usage remains in SQLite. Preferences are shared between tabs of the same origin and fall back to the current page session if storage is unavailable. Clearing browser storage removes these settings without deleting the usage ledger.

Default directory: `~/.local/share/agentkcal`, with overrides documented in the README. Files include `config.json`, `usage.sqlite3`, and temporary SQLite WAL/SHM files. The database and new configuration/CLI export files are set to mode 0600 where supported; newly created data directories request 0700. Existing parent permissions are not changed. Windows uses its platform ACL behavior. Storage is not encrypted and there is no app-level login.

## Back up or remove data

Treat exports and backups as usage metadata. Stop all writers, including the dashboard, CLI imports and agent integrations, before copying the data directory, or use SQLite's backup tooling. Do not commit local data or raw agent journals. The repository ignores known local data paths, databases and conventional usage export names.

To remove AgentKcal's history, stop all writers and delete its configured data directory yourself after backing up anything needed. This does not remove original agent logs.

## Local server boundary

The dashboard binds only to IPv4 `127.0.0.1` and accepts the exact printed host and port. Cross-origin and cross-site requests are rejected. A per-process token is required for sync. Static assets are served from an explicit allowlist, with a restrictive content security policy and no CORS opt-in. The server does not expose an API for choosing arbitrary import paths; configure those locally or use the CLI.

These controls protect normal browser access, including DNS-rebinding attempts. They do not isolate the app from programs or other users able to access your local account or filesystem. Do not publish the server through a reverse proxy or tunnel and do not use it as a shared hosted service. Running under the same OS user is within the trust boundary.

Demo mode uses a separate temporary directory and disables sync. It does not read agent log contents. Normal shutdown removes the temporary ledger; a forced process termination or machine crash can leave a temporary directory for OS cleanup.

## In-agent summaries

Claude's native statusLine reads only the host-supplied transcript and records normalized usage in the same ledger. Its input metadata is not persisted. The local stdio MCP exposes a compact read tool and a separate configured-source refresh tool; it accepts no paths or executable commands. MCP diagnostics expose counts rather than private source paths. Summary metadata returned to an agent becomes part of its context and may reach its model provider. See [integration boundaries](integrations.md).
