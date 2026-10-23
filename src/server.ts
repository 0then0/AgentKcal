import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { load } from "./config.ts";
import { errorMessage } from "./models.ts";
import { adapterStatus, exportReport, report, sync } from "./service.ts";
import { Store } from "./storage.ts";

const STATIC = new Map<string, [string, string]>([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ...["app", "preferences", "locales", "i18n", "foods"].map(
    (name) =>
      [`/${name}.js`, [`${name}.js`, "text/javascript; charset=utf-8"]] as [
        string,
        [string, string],
      ],
  ),
  ["/style.css", ["style.css", "text/css; charset=utf-8"]],
  ["/assets/icon.svg", ["assets/icon.svg", "image/svg+xml"]],
  ["/assets/foods.svg", ["assets/foods.svg", "image/svg+xml"]],
]);
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
function send(
  response: ServerResponse,
  status: number,
  value: unknown,
  mime = "application/json; charset=utf-8",
  filename?: string,
): void {
  const data = Buffer.isBuffer(value)
    ? value
    : Buffer.from(typeof value === "string" ? value : JSON.stringify(value));
  response.writeHead(status, {
    "Content-Type": mime,
    "Content-Length": data.length,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": CSP,
    ...(filename ? { "Content-Disposition": `attachment; filename="${filename}"` } : {}),
  });
  response.end(data);
}
export function createServerFor(
  dataDir: string,
  demo = false,
  webRoot = new URL("./web/", import.meta.url),
) {
  const token = randomBytes(32).toString("base64url");
  let syncing = false;
  const server = createServer(async (request, response) => {
    const address = server.address();
    const authority = `127.0.0.1:${address && typeof address === "object" ? address.port : 0}`;
    const reject = (status: number, error: string) => send(response, status, { error });
    if (request.headers.host !== authority) return reject(403, "Use the printed 127.0.0.1 URL");
    if (request.headers.origin && request.headers.origin !== `http://${authority}`)
      return reject(403, "Cross-origin requests are not allowed");
    if (request.headers["sec-fetch-site"] === "cross-site")
      return reject(403, "Cross-site requests are not allowed");
    try {
      // Do not normalize traversal paths into allowlisted static routes.
      const path = (request.url ?? "").split("?")[0] ?? "";
      if (request.method === "GET") {
        const asset = STATIC.get(path);
        if (asset) return send(response, 200, readFileSync(new URL(asset[0], webRoot)), asset[1]);
        if (!["/api/status", "/api/summary", "/api/export"].includes(path))
          return reject(404, "Not found");
        const config = load(dataDir);
        if (path === "/api/status")
          return send(response, 200, {
            demo,
            token,
            adapters: adapterStatus(config).map(({ paths: _paths, ...row }) => row),
          });
        const params = new URL(request.url ?? "/", `http://${authority}`).searchParams;
        const rawDays = params.get("days") ?? "30";
        if (!/^(0|7|30|90)$/.test(rawDays)) return reject(400, "days must be 0, 7, 30 or 90");
        const store = new Store(dataDir);
        try {
          const data = report(store, config, Number(rawDays), params.get("agent") || undefined);
          if (path === "/api/export") {
            const format = params.get("format") ?? "json";
            const output = exportReport(data, format);
            return send(
              response,
              200,
              output,
              format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
              `agentkcal.${format}`,
            );
          }
          data.records = data.records.slice(0, 100);
          return send(response, 200, data);
        } finally {
          store.close();
        }
      }
      if (request.method !== "POST" || request.url !== "/api/sync") return reject(404, "Not found");
      const supplied = Buffer.from(String(request.headers["x-agentkcal-token"] ?? "")),
        expected = Buffer.from(token);
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
        return reject(403, "Invalid request token");
      if (demo) return reject(409, "Demo is isolated. Start serve to sync your own logs.");
      if (syncing) return reject(409, "A sync is already running");
      syncing = true;
      try {
        // Yield once so already queued sync requests can observe the lock.
        await new Promise<void>((resolve) => setImmediate(resolve));
        const store = new Store(dataDir);
        try {
          send(response, 200, sync(store, load(dataDir)));
        } finally {
          store.close();
        }
      } finally {
        syncing = false;
      }
    } catch (error) {
      reject(400, errorMessage(error));
    }
  });
  server.requestTimeout = 15_000;
  return server;
}
export async function listen(
  dataDir: string,
  port = 8765,
  demo = false,
  webRoot?: URL,
): Promise<ReturnType<typeof createServerFor>> {
  const server = createServerFor(dataDir, demo, webRoot);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  return server;
}
