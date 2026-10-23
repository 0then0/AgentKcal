type Language = "en" | "ru" | "es" | "de" | "fr" | "ja" | "pt-BR";
type Theme = "system" | "light" | "dark";
type FoodId = "buckwheat" | "dumpling" | "bread" | "milk" | "banana" | "rice" | "corn" | "potato";
interface Preferences {
  readonly language: Language;
  readonly theme: Theme;
  readonly food: FoodId;
  setLanguage(value: string): void;
  setTheme(value: string): void;
  setFood(value: string): void;
}
type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
interface Food {
  id: FoodId;
  title: string;
  portion: string;
  grams: number;
  kcalPer100g: number;
  units: Record<Language, PluralForms>;
}
interface FoodEquivalent {
  food: Food;
  portionKcal: number;
  quantity: number;
  fraction: number;
  icons: number[];
  extra: number;
}
interface Formats {
  integer: Intl.NumberFormat;
  compact: Intl.NumberFormat;
  decimal: Intl.NumberFormat;
  plural: Intl.PluralRules;
}
interface I18n {
  t(message: string, values?: Record<string, string | number | null | undefined>): string;
  locale(): string;
  formats(): Formats;
  apply(): void;
  usageRecords(count: number): string;
  messages: Record<string, string>;
  catalogs: Record<Exclude<Language, "en">, Record<string, string>>;
}
interface DashboardTotals {
  records: number;
  total_tokens: number;
  wh: number;
  low_wh: number;
  high_wh: number;
  kcal: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  reasoning_tokens: number;
}
interface ChartRow extends DashboardTotals {
  date: string;
}
interface DashboardReport {
  totals: DashboardTotals;
  daily: ChartRow[];
  agents: string[];
  by_agent: Record<string, DashboardTotals>;
  scenario: { pue: number; label: string };
  generated_at: string;
  records: {
    agent: string;
    model: string;
    timestamp: string;
    total_tokens: number;
    energy: { wh: number; kcal: number; method: string };
  }[];
}
interface DashboardStatus {
  demo: boolean;
  token: string;
  adapters: { id: string; title: string; mode: string; available: boolean }[];
}
interface DashboardSync {
  files: number;
  changed: number;
  errors: string[];
  warnings: string[];
}
interface Window {
  AgentKcalPreferences: Preferences;
  AgentKcalI18n: I18n;
  AgentKcalLocales: {
    messages: Record<Exclude<Language, "en">, Record<string, string>>;
    records: Record<Language, PluralForms>;
  };
  AgentKcalFoods: {
    items: Food[];
    equivalent(kcal: number, id: string): FoodEquivalent;
    units(food: Food, quantity: number, language: Language): string;
  };
}
