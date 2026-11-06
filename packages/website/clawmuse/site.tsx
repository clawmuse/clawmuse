import { languages, locales, type Language } from "./i18n/locales";
import { faqItems } from "./i18n/faq";
import { useSiteTranslation, getTranslator } from "./i18n/i18n";
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import {
  ArrowRight,
  AudioLines,
  Activity,
  Check,
  FileCode2,
  Globe,
  LockKeyhole,
  Target,
  ArrowUpRight,
  Command,
  FolderGit2,
  Laptop,
  Menu,
  Moon,
  ShieldCheck,
  Smartphone,
  Sun,
  X,
} from "lucide-react";
import { ClaudeIcon, CodexIcon } from "./demo-provider-icon";
import { AppMark, Mark, Wordmark } from "./mark";
import { ProductDemo } from "./product-demo";
import { AgentShowcase } from "./agents";
import { release } from "./downloads";

import {
  accountUrl,
  appUrl,
  href,
  pageLanguages,
  routeInfo,
  sourceUrl,
  titleFor,
  type Page,
} from "./content";
import { FAQ, PageLink, SectionHeading, type Localized } from "./ui";
import { InnerPage } from "./pages";

function resolveInternalLink(event: MouseEvent<HTMLDivElement>): URL | null {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return null;
  }
  const anchor = (event.target as HTMLElement | null)?.closest?.("a");
  if (!anchor || anchor.target || anchor.hasAttribute("download")) return null;
  const rawHref = anchor.getAttribute("href");
  if (!rawHref || rawHref.startsWith("#") || /^(mailto:|tel:|javascript:)/i.test(rawHref)) {
    return null;
  }
  try {
    const url = new URL(rawHref, window.location.href);
    if (url.origin !== window.location.origin) return null;
    if (url.pathname === window.location.pathname && url.hash) return null;
    return url;
  } catch {
    return null;
  }
}

type SiteProps = Localized & { page: Page; found?: boolean };
export function Site({
  language: initialLanguage,
  page: initialPage,
  found: initialFound = true,
}: SiteProps) {
  const [route, setRoute] = useState({
    language: initialLanguage,
    page: initialPage,
    found: initialFound,
  });
  useEffect(() => {
    setRoute({ language: initialLanguage, page: initialPage, found: initialFound });
  }, [initialFound, initialLanguage, initialPage]);
  useEffect(() => {
    const onPopState = () => setRoute(routeInfo(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  const { language, page, found } = route;
  const { t } = useSiteTranslation(language);
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = locales[language].dir;
    if (found) document.title = `${titleFor(page, language)} — ClawMuse`;
  }, [found, language, page]);
  const handleSiteClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    const url = resolveInternalLink(event);
    if (!url) return;
    const targetRoute = routeInfo(url.pathname);
    if (!targetRoute.found) return;
    event.preventDefault();
    window.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`);
    setRoute(targetRoute);
    if (url.hash) {
      requestAnimationFrame(() => {
        document.getElementById(url.hash.slice(1))?.scrollIntoView();
      });
    } else {
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }, []);
  let body = <Home language={language} />;
  if (!found) body = <NotFound language={language} />;
  else if (page !== "/") body = <InnerPage page={page} language={language} />;
  return (
    <div className="site refined-site" onClick={handleSiteClick}>
      <a className="skip-link" href="#main">
        {t("site.skipToContent")}
      </a>
      <Header language={language} page={page} />
      <main id="main">{body}</main>
      <Footer language={language} />
    </div>
  );
}
function Header({ language, page }: SiteProps) {
  const { t } = useSiteTranslation(language);
  const [open, setOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [theme, setTheme] = useState("dark");
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);
  const toggleMenu = useCallback(() => setOpen((value) => !value), []);
  const toggleTheme = useCallback(
    () =>
      setTheme((value) => {
        const next = value === "dark" ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem("clawmuse-theme", next);
        } catch {
          /* Storage may be disabled. */
        }
        return next;
      }),
    [],
  );
  const changeLanguage = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const next = languages.find((item) => item === event.target.value);
      if (next)
        window.location.assign(href(page, next) + window.location.search + window.location.hash);
    },
    [page],
  );
  const closeMenu = useCallback(() => setOpen(false), []);
  useEffect(() => {
    if (!open) return;
    headerRef.current?.querySelector<HTMLAnchorElement>("nav a")?.focus();
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      menuButtonRef.current?.focus();
    }
    function dismissOutside(event: Event) {
      if (event.target instanceof Node && !headerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", escape);
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("focusin", dismissOutside);
    return () => {
      window.removeEventListener("keydown", escape);
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("focusin", dismissOutside);
    };
  }, [open]);
  const nav: Page[] = [
    "/product",
    ...(language === "en" || language === "zh-CN" ? ["/plugins" as const] : []),
    ...(language === "en" || language === "zh-CN" ? ["/agents" as const] : []),
    "/docs",
    ...(language === "en" || language === "zh-CN" ? ["/blog" as const] : []),
  ];
  const isCurrentPage = (item: Page) => {
    if (page === item) return true;
    if (item === "/plugins" && page.startsWith("/plugins/")) return true;
    if (item === "/agents" && page.startsWith("/agents/")) return true;
    if (item === "/docs" && (page.startsWith("/docs/") || page.startsWith("/guides/"))) return true;
    if (item === "/blog" && page.startsWith("/blog/")) return true;
    return false;
  };
  return (
    <header className="site-header" ref={headerRef}>
      <div className="header-inner container">
        <a
          className="wordmark"
          href={href("/", language)}
          aria-label={t("header.clawmuseHome")}
          onClick={closeMenu}
        >
          <AppMark />
          <Wordmark />
        </a>
        <nav
          id="main-nav"
          className={open ? "nav open" : "nav"}
          aria-label={t("header.mainNavigation")}
        >
          {nav.map((item) => (
            <a
              key={item}
              href={href(item, language)}
              aria-current={isCurrentPage(item) ? "page" : undefined}
              onClick={closeMenu}
            >
              {navLabel(item, language)}
            </a>
          ))}
          <a className="mobile-login" href={appUrl}>
            {t("header.openWorkspace")}
            <ArrowUpRight size={15} />
          </a>
          <a className="mobile-login" href={accountUrl}>
            {t("header.manageAccount")}
            <ArrowUpRight size={15} />
          </a>
        </nav>
        <div className="header-actions">
          <button
            type="button"
            className="icon-button theme-toggle"
            onClick={toggleTheme}
            aria-label={
              theme === "dark" ? t("header.switchToLightTheme") : t("header.switchToDarkTheme")
            }
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <span className="language-picker">
            <span className="language-picker-sizer" aria-hidden="true">
              {locales[language].label}
            </span>
            <select
              className="language-select"
              aria-label={t("common.language")}
              value={language}
              onChange={changeLanguage}
            >
              {pageLanguages(page).map((locale) => (
                <option key={locale} value={locale} lang={locale} dir={locales[locale].dir}>
                  {locales[locale].label}
                </option>
              ))}
            </select>
          </span>
          <a className="button header-login" href={appUrl}>
            {t("header.openWorkspace")}
            <ArrowUpRight size={15} />
          </a>
          <button
            ref={menuButtonRef}
            className="icon-button menu-toggle"
            type="button"
            onClick={toggleMenu}
            aria-expanded={open}
            aria-controls="main-nav"
            aria-label={open ? t("header.closeMenu") : t("header.openMenu")}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
    </header>
  );
}
// iPhone and iPad visitors go straight to the App Store; the prerendered page keeps /download.
function useIsIos() {
  const [isIos, setIsIos] = useState(false);
  useEffect(() => {
    const iPadDesktopMode = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent) || iPadDesktopMode);
  }, []);
  return isIos;
}
function DownloadButton({ language, label }: Localized & { label: string }) {
  const { t } = useSiteTranslation(language);
  const isIos = useIsIos();
  if (isIos) {
    return (
      <a className="button primary" href={release.ios.url}>
        {t("downloads.downloadOnAppStore")}
        <ArrowUpRight size={17} />
      </a>
    );
  }
  return (
    <PageLink page="/download" language={language} className="button primary">
      {label}
    </PageLink>
  );
}
function Home({ language }: Localized) {
  const { t } = useSiteTranslation(language);
  const hasAgentCatalog = language === "en" || language === "zh-CN";
  return (
    <div className="home-page">
      <section className="hero container personal-hero">
        <div className="hero-copy">
          <div className="hero-badge">
            <span className="live-dot" />
            {t("home.yourPersonalAiWorkspaceInBeta")}
          </div>
          <h1>{t("footer.giveInspirationTheAbilityToAct")}</h1>
          <p>{t("home.keepYourAiWorkMovingFromYourPhoneStart")}</p>
          <div className="hero-actions">
            <DownloadButton language={language} label={t("home.getStarted")} />
            <a className="button ghost" href="#experience">
              {t("home.exploreTheWorkspace")}
              <ArrowRight size={17} />
            </a>
          </div>
          <div className="hero-footnote">
            <FolderGit2 size={14} />
            {t("plans.promise")}
            <a href={sourceUrl}>
              GitHub <ArrowUpRight size={13} />
            </a>
          </div>
        </div>
      </section>
      <section
        id="experience"
        className="container experience home-product-showcase"
        aria-labelledby="experience-title"
      >
        <h2 id="experience-title" className="sr-only">
          {t("home.pickUpWhereYourIdeasLeftOff")}
        </h2>
        <ProductDemo language={language} />
      </section>
      {hasAgentCatalog ? (
        <AgentShowcase language={language} />
      ) : (
        <div className="provider-strip container">
          <span>{t("home.bringTheCodingAgentsYouAlreadyUse")}</span>
          <div>
            <b>Claude Code</b>
            <b>Codex</b>
            <b>GitHub Copilot</b>
            <b>OpenCode</b>
            <b>Pi</b>
            <b>Antigravity</b>
            <b>Muse Code</b>
          </div>
        </div>
      )}
      <WebWorkspaceSection language={language} />
      <section className="trust-band">
        <div className="container trust-grid">
          <div>
            <SectionHeading
              eyebrow={t("home.03YourEnvironmentStaysYours")}
              title={t("home.reachFurtherStayInControl")}
            >
              {t("home.projectsAndAgentsRunOnTheMachineYouChoose")}
            </SectionHeading>
            <PageLink page="/security" language={language}>
              {t("home.understandSecurityAndDataBoundaries")}
            </PageLink>
          </div>
          <ConnectionDiagram language={language} />
        </div>
      </section>
      <section className="section container start-section">
        <SectionHeading
          eyebrow={t("home.04YourFirstConnection")}
          title={t("home.oneAccountYourDevicesTogether")}
        />
        <div className="steps-grid">
          {[
            [
              t("home.prepareYourMachine"),
              t("home.installClawmuseAndConfigureYourCodingAgentLinuxNeeds"),
            ],
            [t("home.signInAndConnect"), t("home.signInWithTheSameAccountOnYourComputer")],
            [t("home.startSomething"), t("home.chooseAnOnlineDeviceOpenAWorkspaceAndGive")],
          ].map(([title, body], i) => (
            <article key={title}>
              <span className="step-number">0{i + 1}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
        <PageLink page="/docs" language={language}>
          {t("home.readTheGettingStartedGuide")}
        </PageLink>
      </section>
      <section className="section container home-faq">
        <SectionHeading eyebrow={t("home.goodQuestions")} title={t("home.aFewThingsToKnow")} />
        <FAQ items={faqItems(language)} />
      </section>
      <EndCTA language={language} />
    </div>
  );
}
function webWorkspaceCopy(language: Language) {
  const t = getTranslator(language);
  return {
    eyebrow: t("webWorkspace.eyebrow"),
    title: t("webWorkspace.title"),
    body: t("webWorkspace.body"),
    cta: t("webWorkspace.cta"),
    workspaceGroup: t("webWorkspace.workspaceGroup"),
    sessionsGroup: t("webWorkspace.sessionsGroup"),
    session1: t("webWorkspace.session1"),
    session2: t("webWorkspace.session2"),
    prompt: t("webWorkspace.prompt"),
    reply: t("webWorkspace.reply"),
    placeholder: t("webWorkspace.placeholder"),
    points: [t("webWorkspace.point1"), t("webWorkspace.point2"), t("webWorkspace.point3")],
  };
}

export function WebWorkspaceSection({ language }: Localized) {
  const copy = webWorkspaceCopy(language);
  return (
    <section className="section container web-workspace-section">
      <div className="web-workspace-card">
        <div className="web-workspace-copy">
          <Globe className="web-workspace-watermark" size={180} aria-hidden="true" />
          <span className="eyebrow">{copy.eyebrow}</span>
          <h2>{copy.title}</h2>
          <p>{copy.body}</p>
          <ul>
            {copy.points.map((point) => (
              <li key={point}>
                <Check size={15} aria-hidden="true" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
          <div className="hero-actions">
            <a className="button primary" href={appUrl}>
              {copy.cta}
              <ArrowUpRight size={16} />
            </a>
          </div>
        </div>
        <WebBrowserPreview language={language} />
      </div>
    </section>
  );
}

function WebBrowserPreview({ language }: Localized) {
  const copy = webWorkspaceCopy(language);
  return (
    <figure className="web-browser-preview" dir="ltr">
      <figcaption className="web-browser-bar">
        <span className="plugin-window-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <div className="web-browser-url">
          <LockKeyhole size={12} aria-hidden="true" />
          <code>app.clawmuse.com</code>
        </div>
        <span className="web-browser-status">
          <i className="live-dot" />
          {getTranslator(language)("docs.connected")}
        </span>
      </figcaption>
      <div className="web-browser-body">
        <WebBrowserSidebar copy={copy} />
        <WebBrowserMain copy={copy} />
      </div>
    </figure>
  );
}

function WebBrowserSidebar({ copy }: { copy: ReturnType<typeof webWorkspaceCopy> }) {
  return (
    <aside className="web-browser-sidebar">
      <div className="web-host-pill">
        <span className="live-dot" />
        <div>
          <strong>MacBook Pro</strong>
        </div>
      </div>
      <div className="web-workspace-group">
        <span className="web-group-label">{copy.workspaceGroup}</span>
        <div className="web-workspace-item is-active">
          <FolderGit2 size={13} />
          <span>clawmuse</span>
        </div>
      </div>
      <div className="web-workspace-group">
        <span className="web-group-label">{copy.sessionsGroup}</span>
        <div className="web-session-item is-active">
          <ClaudeIcon size={12} />
          <span>{copy.session1}</span>
        </div>
        <div className="web-session-item">
          <CodexIcon size={12} />
          <span>{copy.session2}</span>
        </div>
      </div>
    </aside>
  );
}

function WebBrowserMain({ copy }: { copy: ReturnType<typeof webWorkspaceCopy> }) {
  return (
    <div className="web-browser-main">
      <div className="web-main-head">
        <strong>{copy.session1}</strong>
        <span>Claude Code · Sonnet 4.6</span>
      </div>
      <div className="web-main-chat">
        <div className="app-user-bubble is-compact">{copy.prompt}</div>
        <div className="web-assistant-card">
          <p>{copy.reply}</p>
          <div className="app-file-pill">
            <FileCode2 size={13} />
            <code>src/workspace/router.ts</code>
            <b>+32 −6</b>
          </div>
        </div>
      </div>
      <div className="web-main-composer">
        <span>{copy.placeholder}</span>
        <span className="web-composer-meta">5h 68% · Sonnet 4.6</span>
      </div>
    </div>
  );
}

export function FeatureGrid({ language }: Localized) {
  const { t } = useSiteTranslation(language);
  const features = [
    {
      icon: <Command />,
      title: t("featureGrid.manyAgentsOneWorkspace"),
      body: t("featureGrid.chooseTheCodingAgentForTheJobAndKeep"),
      tag: t("featureGrid.agentsTag"),
    },
    {
      icon: <FolderGit2 />,
      title: t("featureGrid.seeTheWorkAsItHappens"),
      body: t("featureGrid.keepWorkspacesFileChangesAndTerminalsCloseMoveFrom"),
      tag: t("featureGrid.contextTag"),
    },
    {
      icon: <Smartphone />,
      title: t("featureGrid.stayInvolvedFromYourPhone"),
      body: t("featureGrid.followATaskAddDirectionAndMakeDecisionsWhen"),
      tag: t("featureGrid.continuityTag"),
    },
    {
      icon: <AudioLines />,
      title: t("tour.voice"),
      body: t("tour.voiceBody"),
      tag: "VOICE",
    },
    {
      icon: <Target />,
      title: "ClawMuse Goals",
      body: t("featureGrid.goalsBody"),
      tag: "GOALS",
    },
    {
      icon: <Activity />,
      title: t("updates.status"),
      body: t("updates.statusBody"),
      tag: "STATUS",
    },
  ];
  return (
    <div className="feature-grid">
      {features.map((item) => (
        <article className="feature-card" key={item.tag}>
          <div className="feature-icon">{item.icon}</div>
          <span className="micro-label">{item.tag}</span>
          <h3>{item.title}</h3>
          <p>{item.body}</p>
        </article>
      ))}
    </div>
  );
}
export function ConnectionDiagram({ language }: Localized) {
  const { t } = useSiteTranslation(language);
  return (
    <div className="connection-diagram">
      <div className="connection-node">
        <Smartphone />
        <strong>{t("connectionDiagram.yourPhone")}</strong>
        <small>{t("connectionDiagram.reviewDirectDecide")}</small>
      </div>
      <div className="connection-bridge">
        <span />
        <ShieldCheck size={21} />
        <small>{t("connectionDiagram.endToEndEncryption")}</small>
        <span />
      </div>
      <div className="connection-node">
        <Laptop />
        <strong>{t("connectionDiagram.yourMachine")}</strong>
        <small>{t("connectionDiagram.codeToolsExecution")}</small>
      </div>
    </div>
  );
}
export function EndCTA({ language }: Localized) {
  const { t } = useSiteTranslation(language);
  return (
    <section className="end-cta container">
      <div className="cta-symbol">
        <Mark />
      </div>
      <span className="eyebrow">{t("endCTA.fromInspirationToAction")}</span>
      <h2>{t("endCTA.yourNextIdeaCanStartFromHere")}</h2>
      <DownloadButton language={language} label={t("endCTA.findYourWayIn")} />
    </section>
  );
}
function Footer({ language }: Localized) {
  const { t } = useSiteTranslation(language);
  const groups: { title: string; links: Page[] }[] = [
    {
      title: t("footer.product"),
      links: ["/download", "/changelog"],
    },
    {
      title: t("footer.resources"),
      links: [
        "/docs",
        ...(language === "en" || language === "zh-CN" ? ["/learn" as const] : []),
        "/support",
      ],
    },
    {
      title: t("footer.clawmuse"),
      links: ["/about", "/privacy", "/terms", "/account-deletion"],
    },
  ];
  return (
    <footer className="site-footer container">
      <div className="footer-top">
        <div className="footer-brand">
          <a className="wordmark" href={href("/", language)} aria-label="ClawMuse">
            <AppMark />
            <Wordmark />
          </a>
          <a className="footer-account" href={release.ios.url}>
            App Store <ArrowUpRight size={13} />
          </a>
        </div>
        {groups.map((group) => (
          <div className="footer-group" key={group.title}>
            <strong>{group.title}</strong>
            {group.links.map((item) => (
              <a href={href(item, language)} key={item}>
                {navLabel(item, language) ?? titleFor(item, language)}
              </a>
            ))}
          </div>
        ))}
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getUTCFullYear()} ClawMuse</span>
      </div>
      <div className="footer-watermark" aria-hidden="true">
        <span>CLAWMUSE&gt;_</span>
      </div>
    </footer>
  );
}
function NotFound({ language }: Localized) {
  const { t } = useSiteTranslation(language);
  return (
    <section className="container not-found">
      <span className="eyebrow">{t("notFound.404ASmallDetour")}</span>
      <h1>{t("notFound.thisPathIsStillUnwritten")}</h1>
      <p>{t("notFound.headHomeOrPickThingsUpInTheGuides")}</p>
      <PageLink page="/" language={language} className="button primary">
        {t("notFound.backToHome")}
      </PageLink>
      <PageLink page="/docs" language={language}>
        {t("notFound.gettingStarted")}
      </PageLink>
    </section>
  );
}

function navLabel(page: Page, language: Language) {
  const t = getTranslator(language);
  const labels: Partial<Record<Page, string>> = {
    "/product": t("navLabel.product"),
    "/plugins": language === "zh-CN" ? "官方插件" : "Plugins",
    "/agents": language === "zh-CN" ? "Agent 集成" : "Agents",
    "/docs": t("navLabel.guides"),
    "/learn": t("navLabel.learn"),
    "/blog": t("navLabel.blog"),
    "/brand": t("navLabel.brand"),
    "/pricing": t("navLabel.pricing"),
    "/about": t("navLabel.about"),
  };
  return labels[page];
}
