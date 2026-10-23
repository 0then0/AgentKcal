import { fileURLToPath } from "node:url";
import type { Language } from "./languages.ts";

export function shellQuote(value: string, platform = process.platform): string {
  if (platform === "win32") {
    if (/["%!\r\n]/.test(value))
      throw new Error("This Windows path needs manual statusLine configuration");
    return `"${value}"`;
  }
  return `'${value.replaceAll("'", "'\\''")}'`;
}
/** Print reviewable configuration; never rewrite another application's settings. */
export function integrationConfig(
  agent: string,
  dataDir: string,
  language: Language = "en",
): string {
  const executable = process.execPath,
    entry = fileURLToPath(new URL("../cli.js", import.meta.url));
  const args = [entry, "--data-dir", dataDir, "mcp"];
  if (agent === "codex")
    return `[mcp_servers.agentkcal]\ncommand = ${JSON.stringify(executable)}\nargs = ${JSON.stringify(args)}\n`;
  let config: unknown;
  if (agent === "claude")
    config = {
      statusLine: {
        type: "command",
        command: [executable, entry, "--data-dir", dataDir, "statusline", "--language", language]
          .map((value) => shellQuote(value))
          .join(" "),
        padding: 1,
      },
    };
  else if (agent === "opencode")
    config = {
      mcp: { agentkcal: { type: "local", command: [executable, ...args], enabled: true } },
    };
  else if (["cursor", "gemini", "cline", "mcp"].includes(agent))
    config = { mcpServers: { agentkcal: { command: executable, args } } };
  else
    throw new Error(
      "integration agent must be claude, codex, gemini, cursor, opencode, cline or mcp",
    );
  return `${JSON.stringify(config, null, 2)}\n`;
}
