---
description: Show local AI usage, approximate Wh and kcal
---

Call AgentKcal get_usage with agent="opencode", days=1 and the user's language. Show a single compact line with the period, tokens, approximate Wh and kcal. This reads the local ledger; it is not measured power. If the user explicitly asks for refreshed usage, call sync_usage first and report warning counts. OpenCode requires a configured session JSON export. Do not probe private databases or substitute monetary cost for energy.

If MCP is unavailable, run `agentkcal status --agent opencode` using the normal shell tool. Do not install anything or change settings automatically.
