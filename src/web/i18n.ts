window.AgentKcalI18n = (() => {
  // English phrases are stable message keys and the fallback language.
  const preferences = window.AgentKcalPreferences;
  const { messages: catalogs, records: recordForms } = window.AgentKcalLocales;
  const formatsByLanguage = new Map<string, Formats>();
  function t(
    message: string,
    values: Record<string, string | number | null | undefined> = {},
  ): string {
    const dictionary = preferences.language === "en" ? undefined : catalogs[preferences.language];
    const text = dictionary?.[message] ?? message;
    return text.replace(/\{(\w+)\}/g, (_: string, key: string) =>
      String(values[key] ?? `{${key}}`),
    );
  }
  function locale() {
    return {
      en: "en-US",
      ru: "ru-RU",
      es: "es-ES",
      de: "de-DE",
      fr: "fr-FR",
      ja: "ja-JP",
      "pt-BR": "pt-BR",
    }[preferences.language];
  }
  function formats(): Formats {
    const language = locale();
    if (!formatsByLanguage.has(language))
      formatsByLanguage.set(language, {
        integer: new Intl.NumberFormat(language),
        compact: new Intl.NumberFormat(language, { notation: "compact", maximumFractionDigits: 2 }),
        decimal: new Intl.NumberFormat(language, { maximumFractionDigits: 2 }),
        plural: new Intl.PluralRules(language),
      });
    return formatsByLanguage.get(language) as Formats;
  }
  function usageRecords(count: number): string {
    const forms = recordForms[preferences.language];
    return forms[formats().plural.select(count)] ?? forms.other;
  }

  function apply() {
    document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((node) => {
      const key = (node.dataset.i18n || node.textContent || "").trim().replace(/\s+/g, " ");
      node.dataset.i18n = key;
      node.textContent = t(key);
    });
    document.querySelectorAll<HTMLElement>("[data-i18n-aria-label]").forEach((node) => {
      node.setAttribute("aria-label", t(node.dataset.i18nAriaLabel ?? ""));
    });
  }
  apply();
  return {
    t,
    locale,
    formats,
    apply,
    usageRecords,
    messages: catalogs.ru,
    catalogs,
  };
})();
