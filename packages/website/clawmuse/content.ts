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
const descriptions = {
  en: {
    "/": "ClawMuse brings Claude Code, Codex and other AI tools to your computer, phone, tablet and the web — manage and use your workspace online right in the browser. Use real-time voice to give tasks, hear progress and continue work.",
    "/product":
      "Choose the AI tool that fits each task. Use Claude Code, Codex and more in ClawMuse to give instructions, review changes and follow up across devices. Try the browser demo.",
    "/download":
      "Install ClawMuse on a supported computer and connect your mobile client. Find desktop downloads and the Linux host setup guide.",
    "/docs":
      "Set up ClawMuse: prepare an agent on your host, connect your devices and verify your first remote workspace task.",
    "/docs/linux":
      "Run a ClawMuse host on Linux: installation, service operation, provider setup and connecting a phone or web client.",
    "/security":
      "Understand ClawMuse security: host permissions, device pairing, end-to-end encrypted relay connections and external model provider boundaries.",
    "/pricing":
      "ClawMuse is open source under the Apache-2.0 license, with the code on GitHub. Use your AI tools across devices. Model subscriptions, API usage and cloud speech are billed separately.",
    "/about":
      "Meet ClawMuse: a personal workspace where you choose your AI tools, use your own computers and work across devices.",
    "/brand":
      "Download ClawMuse logos and wordmarks in SVG format. Find brand colors and usage guidelines.",
    "/changelog":
      "Follow ClawMuse updates to voice interaction, regional relay connections, streamed responses and the cross-device workspace.",
    "/privacy":
      "Read how ClawMuse handles project data, account discovery, optional services, speech processing and connections to model providers.",
    "/terms":
      "ClawMuse terms for using the software, host and provider responsibilities, acceptable use and availability.",
    "/support":
      "Get help with ClawMuse setup, device connections and agent workflows. Find documentation and the information to include in a support request.",
    "/account-deletion":
      "Understand how to disconnect ClawMuse devices, stop tasks and handle account and data removal requests. Local files and external provider data have separate controls.",
  },
  "zh-CN": {
    "/": "ClawMuse，自由选择 AI Agent 的工作台。聚合 Claude Code、Codex 等工具，电脑、手机、平板与 Web 网页均可使用，打开浏览器即可在线管理和使用。实时语音交办任务，听取进度汇报，继续推进工作。",
    "/product":
      "按任务选择 Claude Code、Codex 等 AI 工具，在 ClawMuse 中派发任务、查看文件改动，跨设备跟进成果。打开网页演示，体验工作台。",
    "/download": "下载适用于 Windows、macOS、Linux、Android 和 iOS 的 ClawMuse，连接电脑与手机。",
    "/docs": "安装 ClawMuse，登录账号，连接手机，开始第一个 AI 任务。",
    "/docs/linux":
      "在 Linux 上运行 ClawMuse 主机：安装、服务管理、Provider 配置，以及手机和网页客户端连接。",
    "/security": "了解 ClawMuse 的连接加密、设备授权，以及电脑、账号服务和 AI 服务商处理的数据。",
    "/pricing":
      "ClawMuse 代码开源，以 Apache-2.0 许可在 GitHub 公开。连接电脑与手机，跨设备使用自己的 AI 工具。模型订阅、API 用量和云端语音费用另计。",
    "/about": "为什么做 ClawMuse：让你自由选择 AI 工具，使用自己的电脑，按自己的方式跨设备工作。",
    "/brand": "下载 ClawMuse 标识与品牌字 SVG，查看品牌配色和使用说明。",
    "/changelog": "查看 ClawMuse 在语音交互、区域中继连接、流式回复和跨设备工作区方面的最新更新。",
    "/privacy":
      "了解 ClawMuse 如何处理项目数据、账号发现、附加服务、语音处理与模型 Provider 连接。",
    "/terms": "ClawMuse 使用条款：软件使用、主机与 Provider 责任、使用边界和服务可用性。",
    "/support": "查找 ClawMuse 安装指南，排查设备离线、登录和连接问题，联系支持。",
    "/account-deletion":
      "了解 ClawMuse 设备断开、任务停止、账号与数据删除请求的处理边界。本地文件与外部模型服务的数据需分别管理。",
  },
};
export function descriptionFor(language: Language, page: Page = "/") {
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
