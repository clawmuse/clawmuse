import { getTranslator } from "./i18n";
import type { Language } from "./locales";

// Setup (0) and cloud storage (2) are already covered on the home page by the steps and trust band.
export function faqItems(language: Language): [string, string][] {
  const t = getTranslator(language);
  return ([4, 1, 3] as const).map((id) => [t(`faq.${id}.question`), t(`faq.${id}.answer`)]);
}
