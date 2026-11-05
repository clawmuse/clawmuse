import type { Language } from "./i18n/locales";
import { englishArticles } from "./editorial-en";
import { chineseArticles } from "./editorial-zh";
import { englishWorkflowArticles } from "./editorial-workflows-en";
import { chineseWorkflowArticles } from "./editorial-workflows-zh";

export const learnArticleRoutes = [
  "/learn/own-computer-ai-agents",
  "/compare/cloud-ai-agents",
  "/compare/claude-code-codex",
  "/guides/always-on-ai-workstation",
  "/guides/phone-ai-coding",
  "/guides/local-data-and-cloud-models",
] as const;
export const docArticleRoutes = [
  "/docs/first-task",
  "/docs/agents",
  "/docs/workflows",
  "/docs/goals-status",
  "/docs/voice",
] as const;
export const blogArticleRoutes = ["/blog/why-clawmuse", "/blog/from-idea-to-result"] as const;
export const articleRoutes = [
  ...learnArticleRoutes,
  ...docArticleRoutes,
  ...blogArticleRoutes,
] as const;
export type LearnArticlePage = (typeof learnArticleRoutes)[number];
export type WorkflowArticlePage =
  | (typeof docArticleRoutes)[number]
  | (typeof blogArticleRoutes)[number];
export type ArticlePage = (typeof articleRoutes)[number];
export type EditorialLanguage = "en" | "zh-CN";
export const editorialLanguages: Language[] = ["en", "zh-CN"];
export const editorialDate = "2026-10-25";

export interface ArticleSection {
  id: string;
  title: string;
  paragraphs: string[];
  points?: string[];
  steps?: string[];
  links?: {
    title: string;
    page:
      | ArticlePage
      | "/docs"
      | "/agents"
      | "/brand"
      | "/download"
      | "/security"
      | "/pricing"
      | "/support"
      | "/docs/linux";
  }[];
  table?: { headers: string[]; rows: string[][] };
  sources?: { title: string; url: string }[];
}
export interface Article {
  updated?: string;
  title: string;
  description: string;
  category: string;
  lead: string;
  takeaway: string;
  sections: ArticleSection[];
  faq: { question: string; answer: string }[];
  related: ArticlePage[];
}

export function editorialLanguage(language: Language): EditorialLanguage {
  return language === "zh-CN" ? "zh-CN" : "en";
}
export function isArticlePage(page: string): page is ArticlePage {
  return articleRoutes.some((route) => route === page);
}
export function articleFor(page: ArticlePage, language: Language): Article {
  const articles =
    language === "zh-CN"
      ? { ...chineseArticles, ...chineseWorkflowArticles }
      : { ...englishArticles, ...englishWorkflowArticles };
  return articles[page];
}
export const learnCopy = {
  en: {
    title: "Build your own AI workspace",
    description:
      "Practical guides to self-hosted AI agents, cloud computer alternatives, Claude Code and Codex on your phone, and local data control with ClawMuse.",
    lead: "Set up your computer, choose an agent and learn to work from your phone.",
    eyebrow: "ClawMuse field guide",
    featured: "Start with the bigger picture",
    read: "Read the guide",
    all: "All guides & comparisons",
    updated: "Updated",
    author: "ClawMuse team",
    takeaway: "The practical answer",
    contents: "In this guide",
    faq: "Common questions",
    related: "Keep exploring",
    sources: "Sources",
    comparisonNote:
      "Product capabilities change. External comparisons were checked against the linked official documentation on October 25, 2026. ClawMuse is an independent project and is not affiliated with these providers.",
    demo: "Try the product demo",
    install: "Set up your computer",
  },
  "zh-CN": {
    title: "搭建属于自己的 AI 工作站",
    description:
      "了解自托管 AI Agent、云电脑与本地电脑的区别、在手机上使用 Claude Code 和 Codex，以及 ClawMuse 的部署方式与数据边界。",
    lead: "配置电脑、选择 Agent，了解怎么从手机继续工作。",
    eyebrow: "ClawMuse 使用与选型指南",
    featured: "从工作方式开始了解",
    read: "阅读全文",
    all: "全部指南与对比",
    updated: "更新于",
    author: "ClawMuse 团队",
    takeaway: "先看结论",
    contents: "本文内容",
    faq: "常见问题",
    related: "继续了解",
    sources: "资料来源",
    comparisonNote:
      "产品能力会持续变化。外部产品信息已于 2026 年 10 月 25 日根据文中官方资料核对。ClawMuse 是独立项目，与所列 Provider 无隶属关系。",
    demo: "体验产品演示",
    install: "配置你的电脑",
  },
};

export const blogCopy = {
  en: {
    eyebrow: "ClawMuse journal",
    title: "ClawMuse stories and examples",
    description:
      "The thinking behind ClawMuse and practical ways to bring your personal agents into everyday work.",
    lead: "Why we’re building ClawMuse, and examples of using it day to day.",
    all: "From the journal",
  },
  "zh-CN": {
    eyebrow: "ClawMuse 博客",
    title: "关于 ClawMuse，也聊聊怎么用。",
    description: "ClawMuse 的产品想法与使用案例。",
    lead: "分享做这个产品的原因，以及日常使用的例子。",
    all: "最新文章",
  },
};
