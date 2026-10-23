import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { createContext, runInContext } from "node:vm";

// A small DOM surface for exercising the compiled application's real event handlers.
// Browser checks separately cover layout and native download behavior.
class Node {
  value = "";
  textContent = "";
  hidden = false;
  disabled = false;
  clientWidth = 600;
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  attributes = new Map<string, string>();
  children: Node[] = [];
  listeners = new Map<string, (() => unknown)[]>();
  classList = { toggle: (_name: string, _value: boolean) => {} };
  constructor(text = "", value = "") {
    this.textContent = text;
    this.value = value;
  }
  get selectedOptions() {
    return [{ textContent: this.value || "All agents" }];
  }
  append(...nodes: Node[]) {
    this.children.push(...nodes);
  }
  add(node: Node) {
    this.append(node);
  }
  replaceChildren(...nodes: Node[]) {
    this.children = nodes;
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
  addEventListener(name: string, listener: () => unknown) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
  }
  async fire(name: string) {
    await Promise.all((this.listeners.get(name) ?? []).map((listener) => listener()));
  }
}
function dashboard() {
  const nodes = new Map<string, Node>();
  const node = (id: string) => {
    if (!nodes.has(id)) nodes.set(id, new Node());
    return nodes.get(id) as Node;
  };
  node("days").value = "30";
  const requests: { path: string; respond(data: unknown, status?: number): void }[] = [];
  const downloads: string[] = [];
  const listeners = new Map<string, (() => void)[]>();
  const document = {
    documentElement: { dataset: {}, lang: "" },
    getElementById: node,
    querySelectorAll: () => [],
    createElement: () => new Node(),
    createElementNS: () => new Node(),
  };
  const window = {
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    localStorage: { getItem: () => null, setItem() {} },
    location: { assign: (url: string) => downloads.push(url) },
    addEventListener(name: string, listener: () => void) {
      listeners.set(name, [...(listeners.get(name) ?? []), listener]);
    },
    dispatchEvent(event: Event) {
      for (const listener of listeners.get(event.type) ?? []) listener();
    },
  };
  const context = createContext({
    window,
    document,
    navigator: { language: "en-US" },
    Event,
    Option: Node,
    URLSearchParams,
    fetch(path: string) {
      const pending = Promise.withResolvers<unknown>();
      requests.push({
        path,
        respond(data, status = 200) {
          pending.resolve({ ok: status === 200, status, json: async () => data });
        },
      });
      return pending.promise;
    },
  });
  for (const name of ["preferences", "locales", "i18n", "foods", "app"])
    runInContext(readFileSync(new URL(`../dist/web/${name}.js`, import.meta.url), "utf8"), context);
  return {
    node,
    downloads,
    language(value: string) {
      runInContext(`window.AgentKcalPreferences.setLanguage(${JSON.stringify(value)})`, context);
    },
    async request(path: string) {
      await setImmediate();
      const request = requests.find((row) => row.path === path);
      assert.ok(request, `Missing request: ${path}`);
      requests.splice(requests.indexOf(request), 1);
      return request;
    },
    change(id: string, value: string) {
      node(id).value = value;
      return node(id).fire("change");
    },
  };
}
const empty = () => ({
  totals: {
    records: 0,
    total_tokens: 0,
    wh: 0,
    low_wh: 0,
    high_wh: 0,
    kcal: 0,
    input_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
  },
  agents: [],
  by_agent: {},
  daily: [],
  records: [],
  scenario: { pue: 1.2, label: "test" },
  generated_at: "2026-01-02T00:00:00Z",
});
async function loaded() {
  const view = dashboard();
  (await view.request("/api/status")).respond({ demo: false, token: "test", adapters: [] });
  (await view.request("/api/summary?days=30")).respond(empty());
  await setImmediate();
  return view;
}
function disabled(view: ReturnType<typeof dashboard>, expected: boolean) {
  for (const format of ["csv", "json"])
    assert.equal(view.node(`export-${format}`).disabled, expected, format);
}

test("export stays disabled until the initial report has loaded", async () => {
  const view = dashboard();
  disabled(view, true);
  (await view.request("/api/status")).respond({ demo: false, token: "test", adapters: [] });
  disabled(view, true);
  const request = await view.request("/api/summary?days=30");
  request.respond(empty());
  await setImmediate();
  disabled(view, false);
  await view.node("export-csv").fire("click");
  assert.deepEqual(view.downloads, ["/api/export?days=30&format=csv"]);
});

test("changing filters disables export, including during preference rerenders", async () => {
  const view = await loaded();
  const changing = view.change("days", "7");
  const request = await view.request("/api/summary?days=7");
  disabled(view, true);
  view.language("ru");
  disabled(view, true);
  await view.node("export-csv").fire("click");
  assert.deepEqual(view.downloads, []);
  request.respond(empty());
  await changing;
  disabled(view, false);
  await view.node("export-json").fire("click");
  assert.deepEqual(view.downloads, ["/api/export?days=7&format=json"]);
});

test("a failed report leaves exports disabled until a successful retry", async () => {
  const view = await loaded();
  const failed = view.change("agent", "codex");
  (await view.request("/api/summary?days=30&agent=codex")).respond({ error: "test failure" }, 500);
  await failed;
  disabled(view, true);
  assert.equal(view.node("content").hidden, true);
  view.language("de");
  await view.node("export-json").fire("click");
  assert.deepEqual(view.downloads, []);
  const retry = view.change("days", "7");
  (await view.request("/api/summary?days=7&agent=codex")).respond(empty());
  await retry;
  disabled(view, false);
  await view.node("export-csv").fire("click");
  assert.deepEqual(view.downloads, ["/api/export?days=7&agent=codex&format=csv"]);
});

test("an outdated response cannot enable export while a newer report is pending", async () => {
  const view = await loaded();
  const a = view.change("days", "7");
  const first = await view.request("/api/summary?days=7");
  const b = view.change("agent", "claude");
  const second = await view.request("/api/summary?days=7&agent=claude");
  first.respond(empty());
  await a;
  disabled(view, true);
  second.respond(empty());
  await b;
  disabled(view, false);
  await view.node("export-json").fire("click");
  assert.deepEqual(view.downloads, ["/api/export?days=7&agent=claude&format=json"]);
});
