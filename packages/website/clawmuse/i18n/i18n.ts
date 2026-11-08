import { createInstance } from "i18next";
import { useTranslation } from "react-i18next";
import en from "./resources/en.json" with { type: "json" };
import zhCN from "./resources/zh-CN.json" with { type: "json" };
import zhTW from "./resources/zh-TW.json" with { type: "json" };
import ar from "./resources/ar.json" with { type: "json" };
import es from "./resources/es.json" with { type: "json" };
import fr from "./resources/fr.json" with { type: "json" };
import ja from "./resources/ja.json" with { type: "json" };
import ko from "./resources/ko.json" with { type: "json" };
import ptBR from "./resources/pt-BR.json" with { type: "json" };
import ru from "./resources/ru.json" with { type: "json" };
import { languages, type Language } from "./locales";

export type TranslationKey = keyof typeof en;
export const resources = {
  en: { translation: en },
  ar: { translation: ar },
  es: { translation: es },
  fr: { translation: fr },
  ja: { translation: ja },
  ko: { translation: ko },
  "pt-BR": { translation: ptBR },
  ru: { translation: ru },
  "zh-CN": { translation: zhCN },
  "zh-TW": { translation: zhTW },
};

function createLocaleInstance(language: Language) {
  const instance = createInstance();
  void instance.init({
    lng: language,
    supportedLngs: [...languages],
    fallbackLng: "en",
    resources,
    keySeparator: false,
    initAsync: false,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
  return instance;
}

// Prerendering multiple locales must never change another render's language.
const instances = {
  en: createLocaleInstance("en"),
  ar: createLocaleInstance("ar"),
  es: createLocaleInstance("es"),
  fr: createLocaleInstance("fr"),
  ja: createLocaleInstance("ja"),
  ko: createLocaleInstance("ko"),
  "pt-BR": createLocaleInstance("pt-BR"),
  ru: createLocaleInstance("ru"),
  "zh-CN": createLocaleInstance("zh-CN"),
  "zh-TW": createLocaleInstance("zh-TW"),
};
export function getTranslator(language: Language): (key: TranslationKey) => string {
  const t = instances[language].getFixedT(language) as (key: string) => string;
  return (key) => t(key);
}

export function useSiteTranslation(language: Language) {
  const translation = useTranslation("translation", { i18n: instances[language] });
  const translate = translation.t as (key: string) => string;
  const t = (key: TranslationKey) => translate(key);
  return { t };
}
