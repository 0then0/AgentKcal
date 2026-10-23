---
name: agentkcal
description: Show a compact summary of locally recorded AI agent tokens and illustrative Wh/kcal when the user asks about AI usage, energy or calories. Refresh local logs only when requested.
---

Use the connected AgentKcal MCP server's `get_usage` tool. Default to today's UTC usage. Honor the user's agent, period, session and language; supported language codes are `en`, `ru`, `es`, `de`, `fr`, `ja` and `pt-BR`. Use the user's language, with English as the fallback. Do not guess the active session ID or call other tools to search conversation logs.

If the user explicitly asks for current or refreshed usage, first call `sync_usage`, optionally selecting a supported adapter. Mention any error/warning counts. Cursor, OpenCode and Cline require user-configured export or task-journal paths; do not discover their private databases or credentials.

Return one compact line with the period, tokens, approximate Wh and kcal. State that it uses the local ledger and include `last_event_at` when freshness matters. These are energy scenarios, not measured power, money, food consumed or human calories burned. The current tool invocation itself may not yet be present in the agent's log.

If MCP is unavailable and the installed `agentkcal` executable is on PATH, run `agentkcal status --language CODE` with the user's supported language code using the host's normal shell tool. Add `--sync` only for an explicit refresh request. Never install packages or alter agent settings automatically.

Offer the local dashboard only if the user requests history or detailed comparisons. Never claim that this skill installs a persistent footer or editor status bar.
