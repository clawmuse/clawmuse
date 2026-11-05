import { useMemo } from "react";
import { ArrowRight, ArrowUpRight, Cpu, Layers, Smartphone } from "lucide-react";
import { href } from "./content";
import {
  articleFor,
  learnArticleRoutes,
  blogArticleRoutes,
  blogCopy,
  editorialDate,
  editorialLanguage,
  learnCopy,
  type ArticlePage,
  type ArticleSection,
} from "./editorial-content";
import type { Language } from "./i18n/locales";
import { useScrollSpy } from "./ui";

interface Localized {
  language: Language;
}
export function Learn({ language }: Localized) {
  const copy = learnCopy[editorialLanguage(language)];
  return (
    <div className="container learn-page">
      <header className="learn-header">
        <span className="eyebrow">{copy.eyebrow}</span>
        <h1>{copy.title}</h1>
        <p>{copy.lead}</p>
      </header>
      <div className="learn-featured">
        <OwnershipDiagram language={language} />
        <ArticleCard page={learnArticleRoutes[0]} language={language} featured />
      </div>
      <section className="learn-library" aria-labelledby="library-title">
        <h2 id="library-title">{copy.all}</h2>
        <div className="learn-grid">
          {learnArticleRoutes.slice(1).map((page) => (
            <ArticleCard key={page} page={page} language={language} />
          ))}
        </div>
      </section>
      <EditorialCTA language={language} />
    </div>
  );
}
export function Blog({ language }: Localized) {
  const copy = blogCopy[editorialLanguage(language)];
  return (
    <div className="container learn-page blog-page">
      <header className="learn-header">
        <span className="eyebrow">{copy.eyebrow}</span>
        <h1>{copy.title}</h1>
        <p>{copy.lead}</p>
      </header>
      <section aria-labelledby="blog-library-title">
        <h2 id="blog-library-title" className="sr-only">
          {copy.all}
        </h2>
        <div className="learn-grid blog-grid">
          {blogArticleRoutes.map((page) => (
            <ArticleCard key={page} page={page} language={language} />
          ))}
        </div>
      </section>
      <EditorialCTA language={language} />
    </div>
  );
}
function ArticleCard({
  page,
  language,
  featured = false,
}: Localized & { page: ArticlePage; featured?: boolean }) {
  const article = articleFor(page, language);
  const copy = learnCopy[editorialLanguage(language)];
  return (
    <a className={`learn-card${featured ? " featured" : ""}`} href={href(page, language)}>
      <span className="eyebrow">{featured ? copy.featured : article.category}</span>
      <h3>{article.title}</h3>
      <p>{article.description}</p>
      <span className="learn-card-link">
        {copy.read}
        <ArrowRight size={17} />
      </span>
    </a>
  );
}
export function EditorialArticle({ page, language }: Localized & { page: ArticlePage }) {
  const article = articleFor(page, language);
  const copy = learnCopy[editorialLanguage(language)];
  let collection: { page: "/docs" | "/blog" | "/learn"; title: string } = {
    page: "/learn",
    title: copy.eyebrow,
  };
  if (page.startsWith("/docs/")) {
    collection = { page: "/docs", title: language === "zh-CN" ? "使用文档" : "Documentation" };
  } else if (page.startsWith("/blog/")) {
    collection = { page: "/blog", title: language === "zh-CN" ? "博客" : "Blog" };
  }
  const updated = article.updated ?? editorialDate;
  const sectionIds = useMemo(
    () => [...article.sections.map((s) => s.id), ...(article.faq.length ? ["questions"] : [])],
    [article.sections, article.faq],
  );
  const activeSectionId = useScrollSpy(sectionIds);
  return (
    <div className="container editorial-page">
      <nav
        className="editorial-breadcrumb"
        aria-label={language === "zh-CN" ? "当前位置" : "Breadcrumb"}
      >
        <a href={href(collection.page, language)}>{collection.title}</a>
        <span aria-hidden="true">/</span>
        <span>{article.category}</span>
      </nav>
      <article>
        <header className="editorial-header">
          <span className="eyebrow">{article.category}</span>
          <h1>{article.title}</h1>
          <p>{article.lead}</p>
          <div className="editorial-byline">
            <span>{copy.author}</span>
            <span>
              {copy.updated} <time dateTime={updated}>{updated}</time>
            </span>
          </div>
        </header>
        <div className="editorial-layout">
          <aside className="editorial-toc">
            <nav aria-label={copy.contents}>
              <strong>{copy.contents}</strong>
              {article.sections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  data-active={activeSectionId === section.id ? "true" : undefined}
                >
                  {section.title}
                </a>
              ))}
              {article.faq.length > 0 && (
                <a
                  href="#questions"
                  data-active={activeSectionId === "questions" ? "true" : undefined}
                >
                  {copy.faq}
                </a>
              )}
            </nav>
          </aside>
          <div className="editorial-body">
            {collection.page !== "/blog" && (
              <div className="editorial-takeaway">
                <span className="eyebrow">{copy.takeaway}</span>
                <p>{article.takeaway}</p>
              </div>
            )}
            {article.sections.map((section) => (
              <ContentSection key={section.id} section={section} language={language} />
            ))}
            {article.faq.length > 0 && (
              <section id="questions" className="editorial-section editorial-faq">
                <h2>{copy.faq}</h2>
                {article.faq.map(({ question, answer }) => (
                  <details key={question}>
                    <summary>{question}</summary>
                    <p>{answer}</p>
                  </details>
                ))}
              </section>
            )}
            <div className="editorial-policy-links">
              <a href={href("/security", language)}>
                {language === "zh-CN" ? "安全与连接边界" : "Security & connections"}
              </a>
              <a href={href("/privacy", language)}>
                {language === "zh-CN" ? "隐私说明" : "Privacy"}
              </a>
            </div>
          </div>
        </div>
      </article>
      <section className="editorial-related" aria-labelledby="related-title">
        <h2 id="related-title">{copy.related}</h2>
        <div className="learn-grid">
          {article.related.map((route) => (
            <ArticleCard key={route} page={route} language={language} />
          ))}
        </div>
      </section>
      <EditorialCTA language={language} />
    </div>
  );
}
function ContentSection({ section, language }: Localized & { section: ArticleSection }) {
  return (
    <section id={section.id} className="editorial-section">
      <h2>{section.title}</h2>
      {section.paragraphs.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      {section.points && (
        <ul>
          {section.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      )}
      {section.steps && (
        <ol>
          {section.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      )}
      {section.links && (
        <div className="editorial-sources">
          {section.links.map((link) => (
            <a key={link.page} href={href(link.page, language)}>
              {link.title}
              <ArrowRight size={14} />
            </a>
          ))}
        </div>
      )}
      {section.table && <ComparisonTable table={section.table} title={section.title} />}
      {section.sources && (
        <div className="editorial-sources">
          <span>{learnCopy[editorialLanguage(language)].sources}</span>
          {section.sources.map((source) => (
            <a key={source.url} href={source.url}>
              {source.title}
              <ArrowUpRight size={14} />
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
export function ComparisonTable({
  table,
  title,
}: {
  table: NonNullable<ArticleSection["table"]>;
  title: string;
}) {
  return (
    <div className="editorial-table-wrap" tabIndex={0} role="region" aria-label={title}>
      <table className="editorial-table">
        <caption className="sr-only">{title}</caption>
        <thead>
          <tr>
            {table.headers.map((header) => (
              <th scope="col" key={header}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map(([label, ...cells]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              {cells.map((cell, index) => (
                <td key={table.headers[index + 1]}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function EditorialCTA({ language }: Localized) {
  const copy = learnCopy[editorialLanguage(language)];
  return (
    <div className="editorial-cta">
      <a className="text-link" href={`${href("/", language)}#experience`}>
        {copy.demo} <ArrowRight size={17} />
      </a>
    </div>
  );
}
function OwnershipDiagram({ language }: Localized) {
  const zh = language === "zh-CN";
  const steps = [
    {
      icon: Cpu,
      title: zh ? "你的电脑" : "Your computer",
      detail: zh ? "项目 · 工具 · 文件" : "Projects · tools · files",
    },
    { icon: Layers, title: zh ? "你的 Agent" : "Your agents", detail: "Claude Code · Codex" },
    {
      icon: Smartphone,
      title: zh ? "随身掌控" : "Your control",
      detail: zh ? "指令 · 审查 · 批准" : "Direct · review · approve",
    },
  ];
  return (
    <div className="ownership-diagram">
      {steps.map(({ icon: Icon, title, detail }, index) => (
        <div className="ownership-node" key={title}>
          <span className="ownership-index">0{index + 1}</span>
          <Icon size={28} />
          <strong>{title}</strong>
          <span>{detail}</span>
        </div>
      ))}
      <p>
        {zh
          ? "工作环境在主机上，决策权在你手里。"
          : "The environment stays on your host. The decisions stay with you."}
      </p>
    </div>
  );
}
export function OwnershipSection({ language }: Localized) {
  if (language !== "en" && language !== "zh-CN") return null;
  const zh = language === "zh-CN";
  return (
    <section className="section container ownership-section">
      <div className="ownership-copy">
        <span className="eyebrow">
          {zh ? "从个人电脑，到个人 AI 工作站" : "A personal AI workstation"}
        </span>
        <h2>{zh ? "继续用自己的电脑和项目。" : "Put the computer you own to work."}</h2>
        <p>
          {zh
            ? "Agent 使用电脑上已有的项目和工具。手机负责发指令、看进度，回来后继续处理同一份文件。"
            : "Your agents use the projects and tools already on your computer. Send instructions and check progress from your phone, then return to the same files."}
        </p>
        <a href={href("/learn/own-computer-ai-agents", language)}>
          {zh ? "为什么选择自己的 AI 工作站" : "Why build your own AI workstation"}
          <ArrowRight size={17} />
        </a>
        <a href={href("/compare/cloud-ai-agents", language)}>
          {zh ? "与托管云电脑比较" : "Compare with managed cloud computers"}
          <ArrowRight size={17} />
        </a>
      </div>
      <OwnershipDiagram language={language} />
    </section>
  );
}
