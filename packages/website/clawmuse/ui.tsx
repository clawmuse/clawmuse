import { useSiteTranslation } from "./i18n/i18n";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ArrowRight, Check, Copy } from "lucide-react";
import type { Language } from "./i18n/locales";
import { href, type Page } from "./content";

export interface Localized {
  language: Language;
}
export function PageIntro({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <section className="page-intro container">
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h1>{title}</h1>
      {children && <p>{children}</p>}
    </section>
  );
}
export function SectionHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <span className="eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </div>
  );
}
export function PageLink({
  page,
  language,
  children,
  className = "text-link",
}: Localized & { page: Page; children: ReactNode; className?: string }) {
  return (
    <a href={href(page, language)} className={className}>
      {children}
      {className === "text-link" && <ArrowRight size={17} />}
    </a>
  );
}

export function useScrollSpy(ids: readonly string[]) {
  const [activeId, setActiveId] = useState<string>(ids[0] ?? "");
  useEffect(() => {
    setActiveId(ids[0] ?? "");
    if (typeof window === "undefined" || ids.length === 0) return;
    const updateActive = () => {
      let current = ids[0] ?? "";
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 150) {
          current = id;
        }
      }
      setActiveId(current);
    };
    updateActive();
    window.addEventListener("scroll", updateActive, { passive: true });
    return () => window.removeEventListener("scroll", updateActive);
  }, [ids]);
  return activeId;
}
export function CodeBlock({
  code,
  language,
  caption,
}: Localized & { code: string; caption?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setState("copied");
    } catch {
      setState("error");
    }
  }, [code]);
  const { t } = useSiteTranslation(language);
  let status = "";
  if (state === "copied") status = t("codeBlock.copiedToClipboard");
  if (state === "error") status = t("codeBlock.selectTheCommandToCopyManually");
  return (
    <div className="code-block">
      <div className="code-caption">
        <span>{caption ?? t("common.terminal")}</span>
        <button type="button" onClick={copy}>
          {state === "copied" ? <Check size={14} /> : <Copy size={14} />}
          {t("codeBlock.copy")}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
      <span className="copy-status" role="status">
        {status}
      </span>
    </div>
  );
}
export function FAQ({ items }: { items: readonly (readonly [string, string])[] }) {
  return (
    <div className="faq-list">
      {items.map(([question, answer]) => (
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
export function Note({ children }: { children: ReactNode }) {
  return <div className="note">{children}</div>;
}
