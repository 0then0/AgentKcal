export const LANGUAGES = ["en", "ru", "es", "de", "fr", "ja", "pt-BR"] as const;
export type Language = (typeof LANGUAGES)[number];
export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);
}
interface CompactMessages {
  session: string;
  today: string;
  all: string;
  days: string;
  tokens: Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
  wh: string;
  kcal: string;
  waitingTranscript: string;
  waitingUsage: string;
  unavailable: string;
  incomplete: string;
}
export const COMPACT_MESSAGES: Record<Language, CompactMessages> = {
  en: {
    session: "session",
    today: "today UTC",
    all: "all time",
    days: "{days}d UTC",
    tokens: { one: "token", other: "tokens" },
    wh: "Wh",
    kcal: "kcal",
    waitingTranscript: "waiting for transcript",
    waitingUsage: "waiting for session usage",
    unavailable: "usage unavailable",
    incomplete: "sync incomplete",
  },
  ru: {
    session: "сессия",
    today: "сегодня UTC",
    all: "всё время",
    days: "{days} дн. UTC",
    tokens: { one: "токен", few: "токена", many: "токенов", other: "токенов" },
    wh: "Вт·ч",
    kcal: "ккал",
    waitingTranscript: "ожидаю журнал",
    waitingUsage: "ожидаю данные сессии",
    unavailable: "данные недоступны",
    incomplete: "синхронизация неполная",
  },
  es: {
    session: "sesión",
    today: "hoy UTC",
    all: "todo el historial",
    days: "{days} días UTC",
    tokens: { one: "token", other: "tokens" },
    wh: "Wh",
    kcal: "kcal",
    waitingTranscript: "esperando el registro",
    waitingUsage: "esperando datos de la sesión",
    unavailable: "uso no disponible",
    incomplete: "sincronización incompleta",
  },
  de: {
    session: "Sitzung",
    today: "heute UTC",
    all: "gesamter Zeitraum",
    days: "{days} Tage UTC",
    tokens: { one: "Token", other: "Tokens" },
    wh: "Wh",
    kcal: "kcal",
    waitingTranscript: "warte auf Protokoll",
    waitingUsage: "warte auf Sitzungsdaten",
    unavailable: "Nutzungsdaten nicht verfügbar",
    incomplete: "Abgleich unvollständig",
  },
  fr: {
    session: "session",
    today: "aujourd’hui UTC",
    all: "tout l’historique",
    days: "{days} jours UTC",
    tokens: { one: "token", other: "tokens" },
    wh: "Wh",
    kcal: "kcal",
    waitingTranscript: "en attente du journal",
    waitingUsage: "en attente des données de session",
    unavailable: "données indisponibles",
    incomplete: "synchronisation incomplète",
  },
  ja: {
    session: "セッション",
    today: "今日 UTC",
    all: "全期間",
    days: "{days}日間 UTC",
    tokens: { other: "トークン" },
    wh: "Wh",
    kcal: "kcal",
    waitingTranscript: "ログを待機中",
    waitingUsage: "セッションの使用記録を待機中",
    unavailable: "使用記録を取得できません",
    incomplete: "同期が完了していません",
  },
  "pt-BR": {
    session: "sessão",
    today: "hoje UTC",
    all: "todo o histórico",
    days: "{days} dias UTC",
    tokens: { one: "token", other: "tokens" },
    wh: "Wh",
    kcal: "kcal",
    waitingTranscript: "aguardando o registro",
    waitingUsage: "aguardando dados da sessão",
    unavailable: "uso indisponível",
    incomplete: "sincronização incompleta",
  },
};
