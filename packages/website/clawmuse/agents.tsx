import { useCallback, useMemo, useState, type ChangeEvent, type MouseEvent } from "react";
import { ArrowRight, ArrowUpRight, ChevronRight, Search } from "lucide-react";
import { AgentIcon } from "./agent-icon";
import {
  agentEntries,
  agentFor,
  agentsCopy,
  type AgentCategory,
  type AgentContent,
  type AgentPage,
  type AgentSlug,
} from "./agents-content";
import { href } from "./content";
import { CodeBlock, useScrollSpy, type Localized } from "./ui";

const categories = ["all", "core", "plugin", "acp"] as const;
type AgentFilter = "all" | AgentCategory;

function AgentCard({
  agent,
  language,
  headingLevel = "h2",
}: Localized & { agent: AgentContent; headingLevel?: "h2" | "h3" }) {
  const copy = agentsCopy[language === "zh-CN" ? "zh-CN" : "en"];
  const Heading = headingLevel;
  return (
    <article className="agent-directory-card" data-agent={agent.slug}>
      <a href={href(agent.page, language)}>
        <div className="agent-card-heading">
          <AgentIcon slug={agent.slug} />
          <Heading>{agent.name}</Heading>
        </div>
        <p>{agent.intro}</p>
        <div className="agent-card-footer">
          <span className="agent-category">{copy.categories[agent.category]}</span>
          <ArrowRight size={16} aria-hidden="true" />
        </div>
      </a>
    </article>
  );
}

export function AgentDirectory({ language }: Localized) {
  const copy = agentsCopy[language === "zh-CN" ? "zh-CN" : "en"];
  const entries = agentEntries(language);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<AgentFilter>("all");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = entries.filter(
    (agent) =>
      (category === "all" || agent.category === category) &&
      `${agent.name} ${agent.providerId} ${agent.slug}`
        .toLocaleLowerCase()
        .includes(normalizedQuery),
  );
  const hasFilters = query.length > 0 || category !== "all";
  const resetFilters = useCallback(() => {
    setQuery("");
    setCategory("all");
  }, []);
  const changeQuery = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
  }, []);
  const changeCategory = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    const selected = categories.find((item) => item === event.currentTarget.dataset.category);
    if (selected) setCategory(selected);
  }, []);
  return (
    <div className="container agent-directory">
      <header className="page-intro agent-directory-intro">
        <span className="eyebrow">{copy.eyebrow}</span>
        <h1>{copy.title}</h1>
        <p>{copy.description}</p>
      </header>
      <div className="agent-toolbar">
        <label className="agent-search" htmlFor="agent-search">
          <span>{copy.search}</span>
          <div className="agent-search-field">
            <Search size={18} aria-hidden="true" />
            <input
              id="agent-search"
              type="search"
              value={query}
              onChange={changeQuery}
              placeholder={copy.searchPlaceholder}
              autoComplete="off"
              aria-controls="agent-directory-results"
            />
          </div>
        </label>
        <div className="agent-filters" role="group" aria-label={copy.filter}>
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              data-category={item}
              aria-pressed={category === item}
              aria-controls="agent-directory-results"
              onClick={changeCategory}
            >
              {item === "all" ? copy.all : copy.categories[item]}
            </button>
          ))}
        </div>
      </div>
      <div className="agent-results-meta">
        <span role="status" aria-live="polite" data-testid="agent-result-count">
          {filtered.length} / {entries.length} {copy.results}
        </span>
        {hasFilters && (
          <button
            type="button"
            className="agent-clear-filters"
            data-testid="agent-clear-filters"
            onClick={resetFilters}
          >
            {copy.reset}
          </button>
        )}
      </div>
      <div id="agent-directory-results">
        {filtered.length > 0 ? (
          <div className="agent-directory-grid">
            {filtered.map((agent) => (
              <AgentCard key={agent.slug} agent={agent} language={language} />
            ))}
          </div>
        ) : (
          <div className="agent-empty-state" data-testid="agent-empty-state">
            <h2>{copy.empty}</h2>
            <p>{copy.searchPlaceholder}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function AgentDetail({ page, language }: Localized & { page: AgentPage }) {
  const copy = agentsCopy[language === "zh-CN" ? "zh-CN" : "en"];
  const agent = agentFor(page, language);
  const sections = [
    ["about", copy.aboutTitle(agent.name)],
    ["install", copy.installTitle(agent.name)],
    ["connect", copy.connectTitle],
    ["use-cases", copy.useCasesTitle],
    ["questions", copy.faqTitle],
  ] as const;
  const sectionIds = useMemo(
    () => ["about", "install", "connect", "use-cases", "questions"] as const,
    [],
  );
  const activeSectionId = useScrollSpy(sectionIds);
  return (
    <div className="container agent-detail">
      <nav
        className="agent-breadcrumb"
        aria-label={language === "zh-CN" ? "当前位置" : "Breadcrumb"}
      >
        <a href={href("/agents", language)}>{copy.back}</a>
        <ChevronRight size={12} aria-hidden="true" />
        <span>{agent.name}</span>
      </nav>
      <header className="agent-detail-hero">
        <div className="agent-detail-heading">
          <AgentIcon slug={agent.slug} size={48} className="agent-hero-mark" />
          <span className="agent-category">{copy.categories[agent.category]}</span>
          <h1>{agent.title}</h1>
          <p>{agent.intro}</p>
        </div>
        <div className="agent-detail-actions">
          <a className="button primary" href={href("/download", language)}>
            {copy.download}
            <ArrowRight size={16} aria-hidden="true" />
          </a>
          <a className="button ghost" href={href("/docs/agents", language)}>
            {copy.guide}
            <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
      </header>
      <div className="agent-detail-body">
        <aside className="agent-detail-toc">
          <nav aria-label={language === "zh-CN" ? "本页内容" : "On this page"}>
            <strong>{agent.name}</strong>
            {sections.map(([id, title]) => (
              <a key={id} href={`#${id}`} data-active={activeSectionId === id ? "true" : undefined}>
                {title}
              </a>
            ))}
          </nav>
        </aside>
        <div className="agent-detail-prose">
          <section className="agent-detail-section" id="about">
            <h2>{copy.aboutTitle(agent.name)}</h2>
            <p>{agent.about}</p>
          </section>
          <section className="agent-detail-section" id="install">
            <h2>{copy.installTitle(agent.name)}</h2>
            {agent.install.map(({ label, code }) => (
              <CodeBlock key={label} code={code} caption={label} language={language} />
            ))}
            <p>{agent.setup}</p>
            {agent.signInCommand && (
              <CodeBlock
                code={agent.signInCommand}
                caption={copy.signInLabel}
                language={language}
              />
            )}
            <a className="agent-source-link" href={agent.officialUrl}>
              {copy.officialLink(agent.name)}
              <ArrowUpRight size={15} aria-hidden="true" />
            </a>
          </section>
          <section className="agent-detail-section" id="connect">
            <h2>{copy.connectTitle}</h2>
            <ol>
              {agent.connect.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </section>
          <section className="agent-detail-section" id="use-cases">
            <h2>{copy.useCasesTitle}</h2>
            <p>{agent.useCase}</p>
          </section>
          <section className="agent-detail-section" id="questions">
            <h2>{copy.faqTitle}</h2>
            <AgentQuestions faq={agent.faq} />
          </section>
        </div>
      </div>
      <section className="agent-detail-related" aria-labelledby="related-agents-title">
        <h2 id="related-agents-title">{copy.relatedTitle}</h2>
        <div className="agent-directory-grid">
          {agent.related.map((relatedPage) => (
            <AgentCard
              key={relatedPage}
              agent={agentFor(relatedPage, language)}
              language={language}
              headingLevel="h3"
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function AgentQuestions({ faq }: { faq: AgentContent["faq"] }) {
  return (
    <div className="faq-list">
      {faq.map(({ question, answer }) => (
        <details key={question}>
          <summary>
            {question}
            <span aria-hidden="true">+</span>
          </summary>
          <p>{answer}</p>
        </details>
      ))}
    </div>
  );
}

const showcaseSlugs = [
  "claude-code",
  "codex",
  "copilot",
  "cursor",
  "gemini",
  "opencode",
  "pi",
  "muse-code",
  "antigravity",
  "trae-cli",
  "qoder",
  "qwen-code",
  "kimi",
  "cline",
] as const satisfies readonly AgentSlug[];

export function AgentShowcase({ language }: Localized) {
  const copy = agentsCopy[language === "zh-CN" ? "zh-CN" : "en"];
  return (
    <section className="container agent-showcase" aria-labelledby="agent-showcase-title">
      <div className="agent-showcase-heading">
        <h2 id="agent-showcase-title">{copy.showcaseTitle}</h2>
        <a href={href("/agents", language)}>
          {copy.showcaseLink}
          <ArrowRight size={15} aria-hidden="true" />
        </a>
      </div>
      <div className="agent-showcase-marquee">
        <div className="agent-showcase-track">
          <ul className="agent-showcase-list">
            {showcaseSlugs.map((slug) => {
              const agent = agentFor(`/agents/${slug}`, language);
              return (
                <li key={slug}>
                  <a href={href(agent.page, language)}>
                    <AgentIcon slug={slug} />
                    <span>{agent.name}</span>
                  </a>
                </li>
              );
            })}
          </ul>
          <ul className="agent-showcase-list" aria-hidden="true">
            {showcaseSlugs.map((slug) => {
              const agent = agentFor(`/agents/${slug}`, language);
              return (
                <li key={`${slug}-repeat`}>
                  <a href={href(agent.page, language)} tabIndex={-1}>
                    <AgentIcon slug={slug} />
                    <span>{agent.name}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
