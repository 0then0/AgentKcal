# Adapter formats

Use `agentkcal agents` to inspect current roots. Defaults are read-only. An explicit `--path` requires `--adapter`; this prevents attempting to parse a file using every adapter. Directories are searched using adapter-specific patterns. Export directories should be dedicated to the relevant format.

## Claude Code

Source: `~/.claude/projects/**/*.jsonl`, or `$CLAUDE_CONFIG_DIR/projects/`. Includes nested subagents.

Only `type: assistant` entries with `message.usage` are imported. `message.id` plus session identity identifies the record. Last snapshot in a file wins, so streaming chunks are not summed. Cache-read and cache-creation counters are disjoint from input. Output includes thinking if the originating API counts it there; reasoning is not added independently.

Source semantics: [monitoring](https://code.claude.com/docs/en/monitoring-usage), [Anthropic caching fields](https://github.com/anthropics/skills/blob/main/skills/claude-api/shared/prompt-caching.md).

## Codex

Source: `$CODEX_HOME/sessions/**/rollout-*.jsonl` and `archived_sessions`, with `~/.codex` as the default home.

Reads `session_meta`, model from `turn_context`, and `event_msg` / `token_count` / `info.total_token_usage`. Repeated cumulative snapshots produce no new usage. `last_token_usage` is not summed. Cache read/write are subtracted from total input; reasoning is subtracted from total output to create disjoint buckets. Absent optional cache-write counters are zero. An absent model remains `unknown`.

The first available cumulative snapshot includes all prior usage reflected in that snapshot and is attributed to that timestamp. Decreasing counters and inconsistent subsets reject the file because a reset cannot be distinguished reliably from inconsistent data. Non-rollout event streams, custom app transports, and `token_usage_record` variants are not supported by this adapter.

Source: [Codex protocol](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/protocol.rs). Protocol schemas evolve; attach a minimal redacted fixture when requesting support for a changed format.

## Gemini CLI

Source: `~/.gemini/tmp/**/chats/session-*.json` or `.jsonl`.

JSON snapshots contain `sessionId` and `messages`. JSONL records contain metadata, full messages, optional `$set` metadata updates, and content patches. Full `type: gemini` messages with `tokens` are imported. Repeated messages replace earlier snapshots. Content patches and rewinds do not remove already consumed inference. Legacy `$set.messages` snapshots are accepted.

`input` includes `cached`; subtract cache from input, retain `output` and `thoughts` separately, and add separately reported `tool` prompt tokens to uncached input. Omitted counters default to zero. This follows the recording schema's mapping to API counters; unusual provider counter semantics still require a dedicated fixture.

Sources: [session management](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/session-management.md), [recording types](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/services/chatRecordingTypes.ts), [API counter mapping](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/services/chatRecordingService.ts).

## Cursor

Export usage as CSV from your account's Usage dashboard, then import the local file:

```sh
agentkcal sync --adapter cursor --path ./cursor-usage.csv
```

Required case-sensitive columns: `Date`, `Model`, `Input (w/ Cache Write)`, `Input (w/o Cache Write)`, `Cache Read`, `Output Tokens`. Dates require an ISO 8601 timezone offset or `Z`. Counts must be integers; quoted counts containing thousands separators are accepted. UTF-8 BOM is accepted. Other columns are ignored for totals. Included/subscription usage counts too, because token consumption is independent of the row's price. Rows lacking counters fail rather than turning missing usage into zero.

No cloud API, authentication or editor database integration is included. CSV schemas vary by account and product release; unsupported schemas are rejected. User identity, where present, participates only in an in-memory identity hash and is not stored as a separate field.

## OpenCode

Import a local session JSON export with `info.id` and a `messages` array:

```sh
agentkcal sync --adapter opencode --path ./session-export.json
```

Classic message shape: `{ "info": { "id", "role": "assistant", "modelID", "time", "tokens" }, "parts": [] }`. Newer flat messages use `type: assistant`, `model`, `time`, and `tokens` directly. Usage-bearing compaction records are also accepted. Model reference uses `modelID` or `id` where present, otherwise `unknown`. Time is a millisecond epoch value or an ISO timestamp with offset. Buckets `input`, `output`, `reasoning`, `cache.read`, `cache.write` are disjoint. Exported session aggregate totals are not added to per-message counters.

Use your installed OpenCode version's session export command. Sources: [export handler](https://github.com/anomalyco/opencode/blob/dev/packages/cli/src/commands/handlers/session/export.ts), [transfer schema](https://github.com/anomalyco/opencode/blob/dev/packages/schema/src/session-transfer.ts), [usage normalization](https://github.com/anomalyco/opencode/blob/dev/packages/core/src/session/usage.ts). Native database schemas are not accessed.

## Cline

Explicitly select a task's `ui_messages.json` or a tasks directory. The JSON must be an array of Cline messages. Usage-bearing `say` records of kind `api_req_started` and `subagent_usage` contain JSON text with `tokensIn`, `tokensOut`, `cacheReads`, and `cacheWrites`. Record `ts` is a millisecond epoch timestamp and an identity within the task directory's name. Request text is ignored and never persisted. Finished messages are not counted again.

`deleted_api_reqs` aggregates are excluded because they overlap previously imported requests and lack individual stable identities. A first import after compaction can undercount deleted history. The ledger retains previously imported records even if source history is later pruned. Model is `unknown`, so configure a fallback energy scenario accordingly. Renaming a task directory changes its inferred session identity; do not reimport renamed copies into the same ledger.

Source: [Cline metrics](https://github.com/cline/cline/blob/main/apps/vscode/src/shared/getApiMetrics.ts), [message types](https://github.com/cline/cline/blob/main/apps/vscode/src/shared/ExtensionMessage.ts).

## Universal JSONL

One normalized `UsageEvent` per line. Required: `agent`, `event_id`, `session_id`, `timestamp`. Optional: `model` (defaults to `unknown`), all five token buckets (default zero), `gpu_seconds` and `gpu_watts` (supply together). Unknown fields are rejected; do not include prompts or secrets. ISO timestamps require timezone offsets; numeric timestamps, if used, are milliseconds. See [example](../examples/usage.jsonl).

Agent, event, session and model IDs must be non-empty strings up to 512 characters. Token counts must be finite non-negative integers. GPU telemetry must be finite, non-negative, and paired. Reuse stable event/session IDs to update a record rather than inserting another copy. Do not import both native and generic copies of the same work under different identities.

## Identity and completeness

- Ledger key: `(agent, session_id, event_id)`. Reimporting unchanged records is a no-op; later snapshots update existing records.
- A whole file is parsed before a transaction writes its normalized events. Malformed or truncated files commit no partial prefix; retry when their writer finishes. Other valid files continue importing.
- Default roots that do not exist are normal for uninstalled agents. Missing explicit paths produce warnings; empty or unsupported files also produce warnings.
- The ledger is append/update oriented. Removing source logs does not remove usage. There is no automatic pruning or source-snapshot reconciliation.
- CSV exports have no reliable native request ID. AgentKcal hashes usage identity and user identity, plus an occurrence ordinal for otherwise identical rows. Repeated copies of the same export deduplicate. Overlapping exports can be ambiguous when identical rows represent distinct requests, or metadata/counters change. Cursor's `session_id` is the placeholder `cursor-csv`; it is not a real session count.
- Mirrored or forked histories with different session IDs can double-count shared ancestry. AgentKcal does not reconcile across identities, devices, native/generic imports, or vendors.
- Counts reflect available data, not a claim of complete account usage. Private backend work, deleted logs, dropped counters, and some compaction/retry records can be absent.
- Every sync rescans selected sources and materializes each file's normalized events before writing. Very large histories can consume substantial memory and time. Reports also materialize matching ledger events.

The formats described above define supported inputs. Upstream schemas can change; include a minimal synthetic record and the agent version when reporting an unsupported format.
