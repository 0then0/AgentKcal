/// <reference path="../src/web/browser.d.ts" />

import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as vm from "node:vm";

const web = fileURLToPath(new URL("../src/web/", import.meta.url));
interface TextNode {
  dataset: Record<string, string>;
  textContent?: string;
  setAttribute?(name: string, value: string): void;
}
function browser({
  language = "en-US",
  dark = false,
  saved = {},
  storageBlocked = false,
  languages,
}: {
  language?: string;
  dark?: boolean;
  saved?: Record<string, string>;
  storageBlocked?: boolean;
  languages?: string[];
} = {}) {
  const storage = new Map(Object.entries(saved));
  const listeners: Record<string, ((event: { type: string; key?: string | null }) => void)[]> = {};
  const media = {
    matches: dark,
    listener: () => {},
    addEventListener(_: string, listener: () => void) {
      this.listener = listener;
    },
  };
  const document = {
    documentElement: { lang: "", dataset: {} as Record<string, string> },
    querySelectorAll: (_selector: string): TextNode[] => [],
  };
  const window = {
    matchMedia: () => media,
    localStorage: {
      getItem(key: string) {
        if (storageBlocked) throw Error("blocked");
        return storage.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        if (storageBlocked) throw Error("blocked");
        storage.set(key, value);
      },
    },
    addEventListener(
      name: string,
      listener: (event: { type: string; key?: string | null }) => void,
    ) {
      listeners[name] ??= [];
      listeners[name].push(listener);
    },
    dispatchEvent(event: { type: string; key?: string | null }) {
      for (const listener of listeners[event.type] || []) listener(event);
    },
  };
  const context = vm.createContext({ window, document, navigator: { language, languages }, Event });
  for (const name of ["preferences", "locales", "i18n", "foods"])
    vm.runInContext(
      fs.readFileSync(new URL(`../dist/web/${name}.js`, import.meta.url), "utf8"),
      context,
    );
  const apis = window as unknown as Window;
  return {
    preferences: apis.AgentKcalPreferences,
    i18n: apis.AgentKcalI18n,
    foods: apis.AgentKcalFoods,
    document,
    storage,
    changeSystemTheme(dark: boolean) {
      media.matches = dark;
      media.listener();
    },
    storageEvent(key: string | null) {
      window.dispatchEvent({ type: "storage", key });
    },
  };
}
test("first visit uses browser language and tracks the system theme live", () => {
  const b = browser({ language: "ru-RU", dark: true });
  assert.equal(b.document.documentElement.lang, "ru");
  assert.equal(b.preferences.theme, "system");
  assert.equal(b.document.documentElement.dataset.theme, "dark");
  b.changeSystemTheme(false);
  assert.equal(b.document.documentElement.dataset.theme, "light");
});

test("explicit themes override OS changes; returning to system follows the OS", () => {
  const b = browser();
  b.preferences.setTheme("dark");
  b.changeSystemTheme(false);
  assert.equal(b.document.documentElement.dataset.theme, "dark");
  b.preferences.setTheme("light");
  b.changeSystemTheme(true);
  assert.equal(b.document.documentElement.dataset.theme, "light");
  b.preferences.setTheme("system");
  assert.equal(b.document.documentElement.dataset.theme, "dark");
});

test("language and theme survive a new page load", () => {
  const b = browser();
  b.preferences.setLanguage("ru");
  b.preferences.setTheme("dark");
  b.preferences.setFood("banana");
  const next = browser({ saved: Object.fromEntries(b.storage) });
  assert.equal(next.preferences.language, "ru");
  assert.equal(next.preferences.theme, "dark");
  assert.equal(next.preferences.food, "banana");
  assert.equal(next.document.documentElement.lang, "ru");
});

test("invalid saved preferences fall back safely; unknown choices are ignored", () => {
  const b = browser({
    language: "zh-CN",
    saved: { "agentkcal.theme": "invalid", "agentkcal.language": "xx" },
  });
  assert.equal(b.preferences.language, "en");
  assert.equal(b.preferences.theme, "system");
  b.preferences.setTheme("invalid");
  b.preferences.setLanguage("invalid");
  assert.equal(b.preferences.language, "en");
  assert.equal(b.preferences.theme, "system");
});

test("blocked localStorage still permits session-only settings", () => {
  const b = browser({ storageBlocked: true });
  b.preferences.setLanguage("ru");
  b.preferences.setTheme("dark");
  b.preferences.setFood("bread");
  assert.equal(b.document.documentElement.lang, "ru");
  assert.equal(b.document.documentElement.dataset.theme, "dark");
  assert.equal(b.preferences.food, "bread");
});

test("settings synchronize across tabs and handle cleared storage", () => {
  const b = browser();
  b.storage.set("agentkcal.language", "ru");
  b.storage.set("agentkcal.theme", "dark");
  b.storage.set("agentkcal.food", "dumpling");
  b.storageEvent("agentkcal.theme");
  assert.equal(b.document.documentElement.lang, "ru");
  assert.equal(b.document.documentElement.dataset.theme, "dark");
  assert.equal(b.preferences.food, "dumpling");
  b.storage.clear();
  b.storageEvent(null);
  assert.equal(b.preferences.language, "en");
  assert.equal(b.preferences.theme, "system");
  assert.equal(b.preferences.food, "buckwheat");
});

test("every supported food is selectable and unknown saved selections fall back", () => {
  const b = browser({ saved: { "agentkcal.food": "unknown" } });
  assert.equal(b.preferences.food, "buckwheat");
  for (const food of b.foods.items) {
    b.preferences.setFood(food.id);
    assert.equal(b.preferences.food, food.id);
  }
  b.preferences.setFood("banana");
  b.preferences.setFood("unknown");
  assert.equal(b.preferences.food, "banana");
});

test("food equivalents derive from kcal and the declared portion mass", () => {
  const { foods } = browser();
  for (const food of foods.items) {
    const perPortion = (food.grams * food.kcalPer100g) / 100;
    const result = foods.equivalent(perPortion * 2.5, food.id);
    assert.ok(Math.abs(result.quantity - 2.5) < 1e-12, food.id);
    assert.equal(result.portionKcal, perPortion);
    assert.equal(result.icons.length, 5);
    assert.deepEqual(Array.from(result.icons), [1, 1, 0.5, 0, 0]);
    assert.equal(result.extra, 0);
  }
  assert.equal(foods.equivalent(2680, "buckwheat").quantity, 1);
  assert.equal(foods.equivalent(590, "milk").quantity, 1);
  assert.equal(foods.equivalent(2920, "rice").quantity, 1);
  assert.equal(foods.equivalent(86, "corn").quantity, 1);
  assert.equal(foods.equivalent(115.5, "potato").quantity, 1);
});

test("all foods have translated labels and a matching local illustration", () => {
  const { foods, i18n } = browser();
  const svg = fs.readFileSync(path.join(web, "assets", "foods.svg"), "utf8");
  for (const food of foods.items) {
    assert.ok(i18n.messages[food.title], food.title);
    assert.ok(i18n.messages[food.portion], food.portion);
    assert.ok(svg.includes(`id="${food.id}"`), food.id);
    assert.ok(food.grams > 0 && food.kcalPer100g > 0);
  }
});

test("zero, integer boundaries and fractions never create imaginary portions", () => {
  const { foods } = browser();
  const empty = foods.equivalent(0, "banana");
  assert.equal(empty.quantity, 0);
  assert.deepEqual(Array.from(empty.icons), [0, 0, 0, 0, 0]);
  assert.equal(empty.fraction, 0);
  for (const food of foods.items) {
    const result = foods.equivalent(((food.grams * food.kcalPer100g) / 100) * 3, food.id);
    assert.equal(result.quantity, 3);
    assert.equal(result.fraction, 0);
  }
  const tiny = foods.equivalent(1e-12, "banana");
  assert.ok(tiny.quantity > 0);
  assert.ok((tiny.icons[0] ?? 0) > 0);
});

test("large equivalents use five icons and an exact overflow count", () => {
  const { foods } = browser();
  const result = foods.equivalent(1060 * 126.75, "bread");
  assert.equal(result.quantity, 126.75);
  assert.equal(result.extra, 121.75);
  assert.equal(result.fraction, 0.75);
  assert.deepEqual(Array.from(result.icons), [1, 1, 1, 1, 1]);
  assert.equal(foods.equivalent(1e20, "dumpling").icons.length, 5);
});

test("invalid energy and unsupported foods are rejected", () => {
  const { foods } = browser();
  for (const kcal of [-1, NaN, Infinity, "100", null])
    assert.throws(() => foods.equivalent(kcal as number, "banana"));
  assert.throws(() => foods.equivalent(100, "unknown"));
});

test("food unit grammar follows the visible rounded amount in both languages", () => {
  const { foods } = browser();
  const banana = foods.items.find((food) => food.id === "banana");
  assert.ok(banana);
  assert.equal(foods.units(banana, 1, "en"), "banana");
  assert.equal(foods.units(banana, 2, "en"), "bananas");
  assert.equal(foods.units(banana, 21, "ru"), "банан");
  assert.equal(foods.units(banana, 22, "ru"), "банана");
  assert.equal(foods.units(banana, 11, "ru"), "бананов");
  assert.equal(foods.units(banana, 1.5, "ru"), "банана");
  assert.equal(foods.units(banana, 4.999, "ru"), "бананов");
  assert.equal(foods.units(banana, 0.001, "ru"), "банана");
  for (const [id, one, few, many, english] of [
    ["rice", "пачка риса", "пачки риса", "пачек риса", "packs of rice"],
    ["corn", "початок кукурузы", "початка кукурузы", "початков кукурузы", "cobs of corn"],
    ["potato", "картофелина", "картофелины", "картофелин", "potatoes"],
  ]) {
    const food = foods.items.find((item) => item.id === id);
    assert.ok(food);
    assert.equal(foods.units(food, 1, "ru"), one);
    assert.equal(foods.units(food, 2, "ru"), few);
    assert.equal(foods.units(food, 5, "ru"), many);
    assert.equal(foods.units(food, 1.5, "ru"), few);
    assert.equal(foods.units(food, 2, "en"), english);
  }
});

test("translation round trips retain the source key and accessible labels", () => {
  const b = browser();
  const text = { dataset: { i18n: "" }, textContent: "Energy equivalent" };
  const label = {
    label: "",
    dataset: { i18nAriaLabel: "Main navigation" },
    setAttribute(_: string, value: string) {
      this.label = value;
    },
  };
  b.document.querySelectorAll = (selector) => (selector === "[data-i18n]" ? [text] : [label]);
  b.preferences.setLanguage("ru");
  b.i18n.apply();
  assert.equal(text.textContent, "Энергетический эквивалент");
  assert.equal(label.label, "Основная навигация");
  b.preferences.setLanguage("en");
  b.i18n.apply();
  assert.equal(text.textContent, "Energy equivalent");
  assert.equal(label.label, "Main navigation");
});

test("Russian numbers, dynamic messages, and user labels preserve their meaning", () => {
  const b = browser({ language: "ru" });
  assert.equal(b.i18n.formats().decimal.format(1.5), "1,5");
  assert.equal(b.i18n.t("{wh} Wh", { wh: "1,5" }), "1,5 Вт·ч");
  assert.equal(b.i18n.t("User-defined calibration"), "User-defined calibration");
});

test("record labels use Russian plural forms and English singular", () => {
  const b = browser({ language: "ru" });
  for (const count of [1, 21, 101])
    assert.equal(b.i18n.usageRecords(count), "запись об использовании");
  for (const count of [2, 4, 22])
    assert.equal(b.i18n.usageRecords(count), "записи об использовании");
  for (const count of [0, 5, 11, 12, 14, 25])
    assert.equal(b.i18n.usageRecords(count), "записей об использовании");
  b.preferences.setLanguage("en");
  assert.equal(b.i18n.usageRecords(1), "usage record");
  assert.equal(b.i18n.usageRecords(21), "usage records");
});

test("every Russian message preserves the original interpolation parameters", () => {
  const { i18n } = browser();
  const placeholders = (text: string) =>
    [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
  for (const [english, russian] of Object.entries(i18n.messages)) {
    assert.deepEqual(placeholders(russian), placeholders(english), english);
  }
});

test("all marked HTML strings and accessible labels have a Russian translation", () => {
  const { i18n } = browser();
  const html = fs.readFileSync(path.join(web, "index.html"), "utf8");
  const decode = (text: string) =>
    text
      .trim()
      .replace(/\s+/g, " ")
      .replaceAll("&amp;", "&")
      .replaceAll("&#x27;", "'")
      .replaceAll("&quot;", '"');
  const leaves = [...html.matchAll(/<(\w+)\b[^>]*\sdata-i18n(?=\s|>)[^>]*>([^<]*)<\/\1>/g)];
  assert.ok(leaves.length > 80, "static dashboard messages are marked");
  for (const match of leaves) assert.ok(i18n.messages[decode(match[2] ?? "")], match[2]);
  for (const match of html.matchAll(/data-i18n-aria-label="([^"]+)"/g))
    assert.ok(i18n.messages[decode(match[1] ?? "")], match[1]);
});

const supportedLanguages: Language[] = ["en", "ru", "es", "de", "fr", "ja", "pt-BR"];
test("browser language negotiation honors preference order, regions and Brazilian Portuguese", () => {
  for (const [language, expected] of [
    ["es-MX", "es"],
    ["de-AT", "de"],
    ["fr-CA", "fr"],
    ["ja-JP", "ja"],
    ["pt-BR", "pt-BR"],
    ["pt-PT", "pt-BR"],
    ["zh-CN", "en"],
  ])
    assert.equal(browser({ language }).preferences.language, expected);
  assert.equal(browser({ languages: ["zh-CN", "fr-CA", "es-ES"] }).preferences.language, "fr");
  assert.equal(browser({ languages: ["en-GB", "ja-JP"] }).preferences.language, "en");
});
test("every locale persists, updates document language and round trips without losing source keys", () => {
  const b = browser();
  const node = { dataset: { i18n: "" }, textContent: "Energy equivalent" };
  b.document.querySelectorAll = (selector) => (selector === "[data-i18n]" ? [node] : []);
  for (const language of supportedLanguages) {
    b.preferences.setLanguage(language);
    b.i18n.apply();
    assert.equal(b.document.documentElement.lang, language);
    assert.equal(node.dataset.i18n, "Energy equivalent");
    assert.equal(
      node.textContent,
      language === "en" ? "Energy equivalent" : b.i18n.catalogs[language]["Energy equivalent"],
    );
    const next = browser({ saved: Object.fromEntries(b.storage) });
    assert.equal(next.preferences.language, language);
  }
});
test("all translated catalogs cover every message and preserve interpolation parameters", () => {
  const { i18n } = browser();
  const keys = Object.keys(i18n.messages).sort();
  const parameters = (text: string) =>
    [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
  for (const [language, messages] of Object.entries(i18n.catalogs)) {
    assert.deepEqual(Object.keys(messages).sort(), keys, language);
    for (const [key, value] of Object.entries(messages)) {
      assert.ok(value.trim(), `${language}: ${key}`);
      assert.deepEqual(parameters(value), parameters(key), `${language}: ${key}`);
    }
  }
});
test("new locales format numbers, record counts and food portions in their own language", () => {
  const examples: {
    language: Language;
    decimal: string;
    records: string;
    one: string;
    many: string;
  }[] = [
    { language: "es", decimal: "1,5", records: "registros de uso", one: "patata", many: "patatas" },
    {
      language: "de",
      decimal: "1,5",
      records: "Nutzungseinträge",
      one: "Kartoffel",
      many: "Kartoffeln",
    },
    {
      language: "fr",
      decimal: "1,5",
      records: "entrées d’utilisation",
      one: "pomme de terre",
      many: "pommes de terre",
    },
    {
      language: "ja",
      decimal: "1.5",
      records: "件の使用記録",
      one: "個（じゃがいも）",
      many: "個（じゃがいも）",
    },
    {
      language: "pt-BR",
      decimal: "1,5",
      records: "registros de uso",
      one: "batata",
      many: "batatas",
    },
  ];
  for (const example of examples) {
    const b = browser({ saved: { "agentkcal.language": example.language } });
    assert.equal(b.i18n.formats().decimal.format(1.5), example.decimal);
    assert.equal(b.i18n.usageRecords(2), example.records);
    const potato = b.foods.items.find((food) => food.id === "potato");
    assert.ok(potato);
    assert.equal(b.foods.units(potato, 1, example.language), example.one);
    assert.equal(b.foods.units(potato, 2, example.language), example.many);
    assert.equal(
      b.i18n
        .t("Current filters: {period} · {agent}", { period: "TEST_PERIOD", agent: "TEST_AGENT" })
        .includes("TEST_AGENT"),
      true,
    );
  }
});
test("every product has localized units, labels and portion assumptions in every locale", () => {
  const { foods, i18n } = browser();
  for (const food of foods.items)
    for (const language of supportedLanguages) {
      const forms = food.units[language];
      assert.ok(forms?.other, `${language}: ${food.id}`);
      if (language !== "en") {
        assert.ok(i18n.catalogs[language][food.title]);
        assert.ok(i18n.catalogs[language][food.portion]);
      }
    }
  const html = fs.readFileSync(path.join(web, "index.html"), "utf8");
  for (const language of supportedLanguages)
    assert.ok(html.includes(`value="${language}" lang="${language}"`), language);
});
