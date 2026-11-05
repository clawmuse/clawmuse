import { createInstance } from "i18next";
import en from "./locales/en.json";
import type { T } from "./format";

/**
 * English `t` for tests that exercise formatting helpers without a React tree. Lives outside
 * `format.ts` so production code never pulls i18next into its module graph.
 */
export function testT(): T {
  const engine = createInstance();
  void engine.init({
    initAsync: false,
    lng: "en",
    fallbackLng: "en",
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
    returnNull: false,
    returnObjects: false,
  });
  return engine.t.bind(engine) as T;
}
