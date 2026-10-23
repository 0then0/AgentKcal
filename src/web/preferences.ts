/* Runs before the stylesheet to apply the saved theme before the first paint. */

window.AgentKcalPreferences = (() => {
  const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
  const languages: Language[] = ["en", "ru", "es", "de", "fr", "ja", "pt-BR"];
  const themes: Theme[] = ["system", "light", "dark"];
  const foods: FoodId[] = [
    "buckwheat",
    "dumpling",
    "bread",
    "milk",
    "banana",
    "rice",
    "corn",
    "potato",
  ];
  const browserLanguage: Language = (() => {
    for (const candidate of navigator.languages?.length
      ? navigator.languages
      : [navigator.language]) {
      const base = candidate?.toLowerCase().split("-")[0];
      if (base === "pt") return "pt-BR";
      if (languages.includes(base as Language)) return base as Language;
    }
    return "en";
  })();
  function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
    try {
      const value = window.localStorage.getItem(`agentkcal.${key}`);
      return value !== null && allowed.includes(value as T) ? (value as T) : fallback;
    } catch {
      return fallback;
    }
  }
  let language = read("language", languages, browserLanguage);
  let theme = read("theme", themes, "system");
  let food = read("food", foods, "buckwheat");
  function apply() {
    const root = document.documentElement;
    root.lang = language;
    root.dataset.theme = theme === "system" ? (systemTheme.matches ? "dark" : "light") : theme;
    root.dataset.themePreference = theme;
  }
  function save(key: string, value: string) {
    try {
      window.localStorage.setItem(`agentkcal.${key}`, value);
    } catch {
      /* Session-only when storage is unavailable. */
    }
    apply();
    window.dispatchEvent(new Event("agentkcal:preferences"));
  }
  systemTheme.addEventListener("change", () => {
    if (theme === "system") apply();
  });
  window.addEventListener("storage", (event) => {
    if (
      event.key !== null &&
      !["agentkcal.language", "agentkcal.theme", "agentkcal.food"].includes(event.key)
    )
      return;
    language = read("language", languages, browserLanguage);
    theme = read("theme", themes, "system");
    food = read("food", foods, "buckwheat");
    apply();
    window.dispatchEvent(new Event("agentkcal:preferences"));
  });
  apply();
  return {
    get language() {
      return language;
    },
    get theme() {
      return theme;
    },
    get food() {
      return food;
    },
    setLanguage(value: string) {
      if (languages.includes(value as Language)) {
        language = value as Language;
        save("language", value);
      }
    },
    setTheme(value: string) {
      if (themes.includes(value as Theme)) {
        theme = value as Theme;
        save("theme", value);
      }
    },
    setFood(value: string) {
      if (foods.includes(value as FoodId)) {
        food = value as FoodId;
        save("food", value);
      }
    },
  };
})();
