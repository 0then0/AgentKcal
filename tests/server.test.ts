import assert from "node:assert/strict";
import { request } from "node:http";
import test from "node:test";
import { listen } from "../src/server.ts";
import { Store } from "../src/storage.ts";
import { event, temporary } from "./helpers.ts";

async function serverFixture(demo = true) {
  const folder = temporary();
  const server = await listen(folder.path, 0, demo, new URL("../dist/web/", import.meta.url));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  return {
    folder,
    server,
    port,
    async [Symbol.asyncDispose]() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      folder[Symbol.dispose]();
    },
  };
}
function get(
  port: number,
  path: string,
  method = "GET",
  headers: Record<string, string> = {},
): Promise<{
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port, path, method, headers }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.end();
  });
}
test("dashboard assets are packaged locally with pre-paint preferences and strict CSP", async () => {
  await using local = await serverFixture();
  const summary = await get(local.port, "/api/summary");
  assert.equal(summary.status, 200);
  assert.equal(JSON.parse(summary.body).totals.records, 0);
  assert.match(String(summary.headers["content-security-policy"]), /default-src 'self'/);
  for (const path of [
    "/app.js",
    "/preferences.js",
    "/i18n.js",
    "/locales.js",
    "/foods.js",
    "/style.css",
    "/assets/foods.svg",
    "/assets/icon.svg",
  ])
    assert.equal((await get(local.port, path)).status, 200, path);
  const html = (await get(local.port, "/")).body;
  assert.ok(html.indexOf('src="/locales.js"') < html.indexOf('src="/i18n.js"'));
  assert.ok(html.indexOf('src="/preferences.js"') < html.indexOf('href="/style.css"'));
  for (const name of ["i18n", "foods"])
    assert.ok(html.indexOf(`src="/${name}.js"`) < html.indexOf('src="/app.js"'));
});
test("Host/Origin/Fetch-Site protections reject foreign requests", async () => {
  await using local = await serverFixture();
  for (const headers of [
    { Host: "evil.example" },
    { Origin: "https://evil.example" },
    { "Sec-Fetch-Site": "cross-site" },
  ] as Record<string, string>[])
    assert.equal((await get(local.port, "/api/status", "GET", headers)).status, 403);
  assert.equal(
    (await get(local.port, "/api/status", "GET", { Origin: `http://127.0.0.1:${local.port}` }))
      .status,
    200,
  );
});
test("sync requires a request token, and demo cannot mutate the real ledger", async () => {
  await using local = await serverFixture();
  assert.equal((await get(local.port, "/api/sync", "POST")).status, 403);
  const status = JSON.parse((await get(local.port, "/api/status")).body);
  assert.ok(status.adapters.every((adapter: Record<string, unknown>) => !("paths" in adapter)));
  assert.equal(
    (await get(local.port, "/api/sync", "POST", { "X-AgentKcal-Token": status.token })).status,
    409,
  );
});
test("static paths never expose traversal, config or source files", async () => {
  await using local = await serverFixture();
  for (const path of [
    "/../config.json",
    "/assets/../../config.json",
    "/%2e%2e/config.json",
    "/server.ts",
    "/config.json",
  ])
    assert.equal((await get(local.port, path)).status, 404);
});
test("invalid filters fail explicitly; filtered exports include all matching records", async () => {
  await using local = await serverFixture();
  {
    using store = new Store(local.folder.path);
    store.upsert(Array.from({ length: 105 }, (_, i) => event({ event_id: `e${i}` })));
  }
  for (const path of [
    "/api/summary?days=13",
    "/api/summary?days=not-a-number",
    "/api/export?format=xml",
  ])
    assert.equal((await get(local.port, path)).status, 400);
  const summary = JSON.parse((await get(local.port, "/api/summary?days=0&agent=test")).body);
  assert.equal(summary.totals.records, 105);
  assert.equal(summary.records.length, 100);
  const full = await get(local.port, "/api/export?days=0&agent=test");
  assert.equal(JSON.parse(full.body).records.length, 105);
  assert.match(String(full.headers["content-disposition"]), /attachment/);
  const csv = await get(local.port, "/api/export?format=csv&days=0");
  assert.ok(csv.body.startsWith("agent,"));
});
