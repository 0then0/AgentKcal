# In-agent usage

The everyday view is a compact line of tokens, approximate Wh and kcal. The dashboard remains the place for history, breakdowns and food comparisons. All integrations use the same normalized ledger and energy provider. They do not convert API prices or subscription limits into energy.

## A compact command

After building the checkout, use `node dist/cli.js` in place of `agentkcal`, or install the local npm package as described in the README.

```sh
agentkcal status --language ru
agentkcal status --agent codex --days 7
agentkcal status --agent codex --sync --language ru
agentkcal status --agent claude --session SESSION_ID --days 0 --json
```

Supported `--language` codes are `en`, `ru`, `es`, `de`, `fr`, `ja` and `pt-BR`; the same values are accepted by MCP `get_usage`.

The default is **today's UTC calendar date**, across agents. `--days 0` means all time. `--session` requires a known native session ID; AgentKcal does not guess it. `status` reads the ledger; `--sync` explicitly refreshes configured logs first and returns status 1 if any import warns or fails. JSON includes the last recorded event timestamp, the read timestamp, scenario label and uncertainty range. Empty usage is zero, while very small positive estimates display `<0.01`.

## Claude Code: persistent native status line

Run:

```sh
agentkcal integration --agent claude --language ru
```

Merge the printed `statusLine` property into `~/.claude/settings.json` (or project settings). Review an existing status line before replacing it; compose commands manually if you already use one. The generator prints configuration only and never edits another application's files.

Claude passes `session_id` and `transcript_path` on stdin. AgentKcal reads that transcript with the Claude adapter, imports its normalized records idempotently, and displays **that session's** tokens and estimated Wh/kcal. It does not scan all agents or treat context-window occupancy as cumulative consumption. Native stdin metadata, prompts and responses are not stored. The command renders a short waiting/unavailable message when a transcript is missing, incomplete or invalid; no private parser diagnostic appears in the footer. Once data is valid, the next invocation refreshes it.

This path does not invoke a model. It rereads the transcript on each native refresh, so very large sessions can make it slower. It includes only records in that transcript; separate subagent journals appear after normal sync, and are not silently attributed to the main session. Generated settings reference the absolute Node executable, installed CLI and selected data directory. Regenerate after moving the package or Node installation. The command needs filesystem permissions to read the transcript and write the local ledger.

[Claude statusLine documentation](https://code.claude.com/docs/en/statusline).

## Codex, Gemini CLI, Cursor, OpenCode and Cline: local MCP

The `agentkcal mcp` command is a **local stdio server**, not a web server. No dashboard, account, API key, network connection or listening port is required by AgentKcal. An MCP-capable host starts it as a subprocess.

Generate the configuration for your installed package and ledger:

```sh
agentkcal integration --agent codex
agentkcal integration --agent gemini
agentkcal integration --agent cursor
agentkcal integration --agent opencode
agentkcal integration --agent cline
```

Merge the output without replacing existing servers:
- **Codex:** TOML for `~/.codex/config.toml`, or the MCP settings UI. The local CLI, desktop and IDE clients can share this configuration. Ask “Show today’s usage through AgentKcal”. Its `tui.status_line` setting lists built-in item identifiers; custom kcal values are available through MCP.
- **Gemini CLI:** JSON `mcpServers` entry for `~/.gemini/settings.json` or project `.gemini/settings.json`. Optionally copy [the custom command](../integrations/gemini/agentkcal.toml) to `.gemini/commands/agentkcal.toml` and run `/agentkcal`.
- **Cursor:** JSON entry for `.cursor/mcp.json` or `~/.cursor/mcp.json`. The shared [AgentKcal skill](../integrations/skills/agentkcal/SKILL.md) can be copied into `.cursor/skills/agentkcal/SKILL.md`; invoke `/agentkcal`.
- **OpenCode:** JSON `mcp` entry for `opencode.json`. Optionally copy [the command](../integrations/opencode/agentkcal.md) to `.opencode/commands/agentkcal.md` and run `/agentkcal`.
- **Cline:** add the JSON server entry in its MCP Servers configuration editor. Ask for the AgentKcal usage tool in the conversation; no private editor database access is required.

For Codex, optionally copy the shared skill folder into `~/.agents/skills/agentkcal/` or project `.agents/skills/agentkcal/`, then invoke `$agentkcal`. Claude can also use this skill from `.claude/skills/agentkcal/`. These files are distributable templates; they are not silently installed into this repository's active agent configuration.

The server exposes two deliberately separate tools:
- `get_usage`: reads a compact snapshot, with optional `days`, `agent`, `session` and `language`. It does **not** refresh logs. It returns totals and provenance, not prompts, source paths or the full record history.
- `sync_usage`: explicitly refreshes configured logs, optionally selecting an adapter. It updates only the local usage ledger. It accepts no source paths, shell commands or configuration changes. Warning/error counts are returned; detailed local diagnostics remain in the CLI.

Cursor and OpenCode exports and Cline task-journal paths must already be configured. Connecting MCP does not manufacture missing native usage telemetry. The host controls tool approvals. The current agent turn or tool invocation may not yet have been written to its logs; ask for a refresh after it finishes.

These are native MCP tools and host command/skill entry points. Except for Claude statusLine, the compact result appears **on demand inside the conversation**, not in a persistent editor status bar. They may require a model turn and consume additional tokens. Summary metadata returned through MCP enters the host's conversation and can be sent to its model provider according to that host's settings. The ledger itself remains local.

Sources: [official OpenAI MCP documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli), [Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference), [Codex skills](https://learn.chatgpt.com/docs/build-skills), [Cursor skills](https://cursor.com/help/customization/skills), [Gemini custom commands](https://geminicli.com/docs/cli/custom-commands/), [OpenCode commands](https://dev.opencode.ai/docs/commands), [Cline MCP](https://github.com/cline/cline/blob/main/docs/mcp/mcp-overview.mdx), [MCP stdio](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).

## Check the connection

Restart the host after changing its MCP configuration. Confirm that AgentKcal appears in its tool list, then request today's usage with `get_usage`. For a fresh import, explicitly request `sync_usage` first. Check warning counts and the last event timestamp when records appear incomplete. Use `agentkcal sync` locally for detailed import diagnostics.

Agent settings and log formats can change between versions. If a tool is unavailable, check the generated executable paths and the host's MCP startup log. Claude status line updates require a transcript containing usage records.
