// The app owns product UI labels. Keep only the subset used by the web demo.
import { build } from "esbuild";
import { writeFile } from "node:fs/promises";
const locales = {
  en: "en",
  ar: "ar",
  es: "es",
  fr: "fr",
  ja: "ja",
  ko: "ko",
  "pt-BR": "ptBR",
  ru: "ru",
  "zh-CN": "zhCN",
};
const labels = {};
for (const [locale, name] of Object.entries(locales)) {
  const entry = new URL(`../../app/src/i18n/resources/${locale}.ts`, import.meta.url);
  const result = await build({
    entryPoints: [entry.pathname],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
  });
  const data = (
    await import(
      `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
    )
  )[name];
  labels[locale] = {
    model: data.modelSelector.model,
    selectModel: data.modelSelector.selectModel,
    searchModels: data.modelSelector.searchPlaceholder,
    searchAllModels: data.modelSelector.searchAllPlaceholder,
    noMatches: data.modelSelector.noMatches,
    providers: data.modelSelector.providers,
    thinking: data.agentControls.thinking.title,
    mode: data.agentControls.mode.title,
    close: data.common.actions.close,
    back: data.common.actions.back,
    tabs: data.workspace.tabs.switcher.title,
    newAgent: data.workspace.header.actions.newAgent,
    newTerminal: data.workspace.header.actions.newTerminal,
  };
}
// Traditional Chinese is a website-only locale; use the same app terminology.
labels["zh-TW"] = {
  ...labels["zh-CN"],
  selectModel: "選擇模型",
  searchModels: "搜尋模型...",
  searchAllModels: "搜尋所有模型...",
  noMatches: "沒有符合的模型",
  providers: "提供方",
  close: "關閉",
  back: "返回",
  tabs: "標籤頁",
  newAgent: "新建 Agent",
  newTerminal: "新建終端",
};
await writeFile(
  new URL("./demo-app-labels.json", import.meta.url),
  `${JSON.stringify(labels, null, 2)}\n`,
);
