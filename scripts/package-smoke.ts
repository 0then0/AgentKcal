import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const folder = mkdtempSync(join(tmpdir(), "agentkcal-package-"));
const npm = process.env.npm_execpath;
if (!npm) throw new Error("Run this check with npm run test:package");
try {
  const packed = execFileSync(
    process.execPath,
    [npm, "pack", "--json", "--pack-destination", folder],
    { encoding: "utf8" },
  );
  const result = JSON.parse(packed) as { filename: string; files: { path: string }[] }[];
  const archive = result[0];
  assert.ok(archive);
  assert.ok(
    archive.files.every(
      (file) =>
        (!file.path.endsWith(".py") && !file.path.endsWith(".ts")) || file.path.endsWith(".d.ts"),
    ),
  );
  writeFileSync(join(folder, "package.json"), '{"private":true}');
  execFileSync(
    process.execPath,
    [
      npm,
      "install",
      "--offline",
      "--ignore-scripts",
      "--omit=dev",
      "--no-audit",
      "--no-fund",
      join(folder, archive.filename),
    ],
    { cwd: folder, stdio: "pipe" },
  );
  const root = join(folder, "node_modules/agentkcal"),
    entry = join(root, "dist/cli.js");
  const run = (...args: string[]) =>
    execFileSync(process.execPath, [entry, ...args], { cwd: folder, encoding: "utf8" });
  assert.equal(run("--version").trim(), "0.1.0");
  for (const file of [
    "index.html",
    "preferences.js",
    "i18n.js",
    "locales.js",
    "foods.js",
    "app.js",
    "style.css",
    "assets/icon.svg",
    "assets/foods.svg",
  ])
    assert.ok(existsSync(join(root, "dist/web", file)), file);
  assert.ok(existsSync(join(root, "integrations/skills/agentkcal/SKILL.md")));
  assert.ok(existsSync(join(root, "README.ru.md")));
  const data = join(folder, "data");
  run(
    "--data-dir",
    data,
    "sync",
    "--adapter",
    "generic",
    "--path",
    join(root, "examples/usage.jsonl"),
  );
  assert.equal(
    JSON.parse(run("--data-dir", data, "summary", "--days", "0", "--json")).totals.records,
    2,
  );
  const config = JSON.parse(run("--data-dir", data, "integration", "--agent", "cursor"));
  assert.equal(config.mcpServers.agentkcal.args[0], realpathSync(entry));
  const request = [
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "package-smoke", version: "1" },
      },
    },
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "get_usage", arguments: { days: 0 } },
    },
  ]
    .map((value) => JSON.stringify(value))
    .join("\n");
  const mcp = execFileSync(process.execPath, [entry, "--data-dir", data, "mcp"], {
    cwd: folder,
    input: `${request}\n`,
    encoding: "utf8",
  });
  assert.equal(
    JSON.parse(mcp.trim().split("\n")[1] ?? "{}").result.structuredContent.totals.records,
    2,
  );
  const demo = spawn(process.execPath, [entry, "demo", "--port", "0"], {
    cwd: folder,
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    const url = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Packaged demo did not start")), 10_000);
      let output = "";
      demo.stdout.on("data", (chunk) => {
        output += String(chunk);
        const found = output.match(/http:\/\/127\.0\.0\.1:\d+/);
        if (found) {
          clearTimeout(timeout);
          resolve(found[0]);
        }
      });
      demo.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      demo.on("exit", (code) => {
        clearTimeout(timeout);
        reject(new Error(`Demo exited early: ${code}`));
      });
    });
    for (const path of ["/", "/app.js", "/foods.js", "/api/summary"])
      assert.equal((await fetch(`${url}${path}`)).status, 200, path);
    const status = (await (await fetch(`${url}/api/status`)).json()) as { demo: boolean };
    assert.equal(status.demo, true);
  } finally {
    if (demo.exitCode === null) {
      const exited = new Promise<void>((resolve) => demo.once("exit", () => resolve()));
      demo.kill("SIGTERM");
      await exited;
    }
  }
  assert.equal(
    JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).dependencies,
    undefined,
  );
  console.log(
    "Package smoke check passed: zero runtime dependencies, CLI, MCP, templates and isolated dashboard.",
  );
} finally {
  rmSync(folder, { recursive: true, force: true });
}
