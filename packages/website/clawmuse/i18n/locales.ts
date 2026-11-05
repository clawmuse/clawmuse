export const languages = [
  "en",
  "zh-CN",
  "zh-TW",
  "ar",
  "es",
  "fr",
  "ja",
  "ko",
  "pt-BR",
  "ru",
] as const;
export type Language = (typeof languages)[number];

export const locales = {
  en: { label: "English", prefix: "", ogLocale: "en_US", dir: "ltr" },
  "zh-CN": { label: "简体中文", prefix: "/zh", ogLocale: "zh_CN", dir: "ltr" },
  "zh-TW": { label: "繁體中文", prefix: "/zh-TW", ogLocale: "zh_TW", dir: "ltr" },
  ar: { label: "العربية", prefix: "/ar", ogLocale: "ar_AR", dir: "rtl" },
  es: { label: "Español", prefix: "/es", ogLocale: "es_ES", dir: "ltr" },
  fr: { label: "Français", prefix: "/fr", ogLocale: "fr_FR", dir: "ltr" },
  ja: { label: "日本語", prefix: "/ja", ogLocale: "ja_JP", dir: "ltr" },
  ko: { label: "한국어", prefix: "/ko", ogLocale: "ko_KR", dir: "ltr" },
  "pt-BR": { label: "Português BR", prefix: "/pt-BR", ogLocale: "pt_BR", dir: "ltr" },
  ru: { label: "Русский", prefix: "/ru", ogLocale: "ru_RU", dir: "ltr" },
} satisfies Record<
  Language,
  { label: string; prefix: string; ogLocale: string; dir: "ltr" | "rtl" }
>;
