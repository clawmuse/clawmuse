import { getTranslator, type TranslationKey } from "./i18n/i18n";
import { languages, locales, type Language } from "./i18n/locales";
import { agentFor, agentLanguages, agentRoutes, agentsCopy, isAgentPage } from "./agents-content";
import {
  articleFor,
  articleRoutes,
  blogCopy,
  editorialLanguage,
  editorialLanguages,
  isArticlePage,
  learnCopy,
} from "./editorial-content";
import { pluginLanguages, pluginsCopy } from "./plugins-content";
import { isSeoPage, seoCopy } from "./seo-copy";

export const coreRoutes = [
  "/",
  "/product",
  "/download",
  "/docs",
  "/docs/linux",
  "/security",
  "/pricing",
  "/about",
  "/brand",
  "/changelog",
  "/privacy",
  "/terms",
  "/support",
  "/account-deletion",
] as const;
export const routes = [
  ...coreRoutes,
  "/plugins",
  "/learn",
  "/blog",
  "/agents",
  ...articleRoutes,
  ...agentRoutes,
] as const;
export type Page = (typeof routes)[number];
export function pageLanguages(page: Page): readonly Language[] {
  if (page === "/plugins") return pluginLanguages;
  if (page === "/agents" || isAgentPage(page)) return agentLanguages;
  const hasEditorialTranslations = page === "/learn" || page === "/blog" || isArticlePage(page);
  return hasEditorialTranslations ? editorialLanguages : languages;
}
export function routeInfo(pathname: string): { language: Language; page: Page; found: boolean } {
  const path = pathname.replace(/\/+$/, "") || "/";
  let language: Language = "en";
  let slug = path;
  for (const locale of languages) {
    const { prefix } = locales[locale];
    if (prefix && (path === prefix || path.startsWith(`${prefix}/`))) {
      language = locale;
      slug = path.slice(prefix.length) || "/";
      break;
    }
  }
  if (path === "/en" || path.startsWith("/en/")) slug = path.slice(3) || "/";
  const page = routes.find((item) => item === slug && pageLanguages(item).includes(language));
  return {
    language,
    page: page ?? "/",
    found: page !== undefined,
  };
}
export function href(page: Page, language: Language) {
  const locale = pageLanguages(page).includes(language) ? language : "en";
  const path = `${locales[locale].prefix}${page}`;
  return path.endsWith("/") ? path : `${path}/`;
}
const titleKeys = {
  "/": "meta.title.home",
  "/product": "meta.title.product",
  "/download": "meta.title.download",
  "/docs": "meta.title.docs",
  "/docs/linux": "meta.title.docs.linux",
  "/security": "meta.title.security",
  "/pricing": "meta.title.pricing",
  "/about": "meta.title.about",
  "/brand": "meta.title.brand",
  "/changelog": "meta.title.changelog",
  "/privacy": "meta.title.privacy",
  "/terms": "meta.title.terms",
  "/support": "meta.title.support",
  "/account-deletion": "accountData.title",
} satisfies Record<(typeof coreRoutes)[number], TranslationKey>;
export function titleFor(page: Page, language: Language) {
  if (page === "/plugins") return pluginsCopy(language).title;
  if (page === "/agents") return agentsCopy[editorialLanguage(language)].title;
  if (isAgentPage(page)) return agentFor(page, language).title;
  if (page === "/learn") return learnCopy[editorialLanguage(language)].title;
  if (page === "/blog") return blogCopy[editorialLanguage(language)].title;
  if (isArticlePage(page)) return articleFor(page, language).title;
  return getTranslator(language)(titleKeys[page]);
}
export function documentTitleFor(page: Page, language: Language) {
  if (isSeoPage(page)) return seoCopy[language][page].title;
  if (page === "/agents")
    return agentsCopy[editorialLanguage(language)].seoTitle(agentRoutes.length);
  return `${titleFor(page, language)} — ClawMuse`;
}
const descriptions = {
  en: {
    "/brand":
      "Download ClawMuse logos and wordmarks in SVG format. Find brand colors and usage guidelines.",
    "/privacy":
      "Read how ClawMuse handles project data, account discovery, optional services, speech processing and connections to model providers.",
    "/terms":
      "ClawMuse terms for using the software, host and provider responsibilities, acceptable use and availability.",
    "/account-deletion":
      "Understand how to disconnect ClawMuse devices, stop tasks and handle account and data removal requests. Local files and external provider data have separate controls.",
  },
  "zh-CN": {
    "/brand": "下载 ClawMuse 标识与品牌字 SVG，查看品牌配色和使用说明。",
    "/privacy":
      "了解 ClawMuse 如何处理项目数据、账号发现、附加服务、语音处理与模型 Provider 连接。",
    "/terms": "ClawMuse 使用条款：软件使用、主机与 Provider 责任、使用边界和服务可用性。",
    "/account-deletion":
      "了解 ClawMuse 设备断开、任务停止、账号与数据删除请求的处理边界。本地文件与外部模型服务的数据需分别管理。",
  },
};
export function descriptionFor(language: Language, page: Page = "/") {
  if (isSeoPage(page)) return seoCopy[language][page].description;
  if (page === "/plugins") return pluginsCopy(language).description;
  if (page === "/agents") return agentsCopy[editorialLanguage(language)].description;
  if (isAgentPage(page)) return agentFor(page, language).description;
  if (page === "/learn") return learnCopy[editorialLanguage(language)].description;
  if (page === "/blog") return blogCopy[editorialLanguage(language)].description;
  if (isArticlePage(page)) return articleFor(page, language).description;
  if (language === "en" || language === "zh-CN") return descriptions[language][page];
  return getTranslator(language)("meta.description");
}
export const accountUrl = "https://agent-hub.clawmuse.com/";
export const appUrl = "https://app.clawmuse.com/";
export const sourceUrl = "https://github.com/clawmuse/clawmuse";
export const contactEmail = "hello@clawmuse.com";
