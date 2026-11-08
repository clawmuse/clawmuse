import { useCallback, useEffect, useRef, type KeyboardEvent, type MouseEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  Globe,
  LockKeyhole,
  Monitor,
  RotateCw,
  ShieldCheck,
  Terminal,
  X,
} from "lucide-react";
import { useSiteTranslation } from "./i18n/i18n";
import type { Language } from "./i18n/locales";
import type { DemoSession } from "./demo-session";
import { DemoModelSheet } from "./demo-model-sheet";
import appLabels from "./demo-app-labels.json";

interface Props {
  language: Language;
  demo: DemoSession;
}
const panelTabs = ["chat", "files", "terminal", "browser"] as const;
function containFocus(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key !== "Tab") return;
  const controls = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>(
      "button:not(:disabled), input:not(:disabled)",
    ),
  );
  const first = controls[0];
  const last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
export function DemoSheet({ language, demo }: Props) {
  const { t } = useSiteTranslation(language);
  const ref = useRef<HTMLDivElement>(null);
  const interactive = demo.sheetInteractive;
  const modelSheet = demo.sheet === "models";
  const { closeSheet } = demo;
  const dismissBackdrop = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) closeSheet();
    },
    [closeSheet],
  );
  useEffect(() => {
    if (!interactive) return;
    const previous = modelSheet
      ? ref.current?.closest(".workspace-device")?.querySelector(".demo-model-control")
      : document.activeElement;
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [interactive, modelSheet]);
  return (
    <div
      className="demo-sheet-backdrop"
      onKeyDownCapture={demo.closeOnEscape}
      onClick={dismissBackdrop}
    >
      <div
        className={`demo-sheet ${demo.sheet === "models" ? "demo-model-sheet" : ""}`}
        role="dialog"
        aria-modal={interactive}
        aria-label={
          demo.sheet === "models" ? appLabels[language].selectModel : appLabels[language].tabs
        }
        ref={ref}
        onPointerDownCapture={demo.inspectSheet}
        onKeyDownCapture={demo.inspectSheet}
        onKeyDown={containFocus}
      >
        {demo.sheet === "models" ? (
          <DemoModelSheet language={language} demo={demo} />
        ) : (
          <>
            <div className="demo-sheet-header">
              <h4>{appLabels[language].tabs}</h4>
              <button type="button" onClick={demo.closeSheet} aria-label={t("tour.close")}>
                <X size={20} />
              </button>
            </div>
            <TabPicker language={language} demo={demo} />
          </>
        )}
      </div>
    </div>
  );
}
function TabPicker({ language, demo }: Props) {
  const { t } = useSiteTranslation(language);
  return (
    <div className="demo-picker-list">
      {panelTabs
        .filter((scene) => scene !== "chat" || !demo.chatClosed)
        .map((scene) => (
          <button
            key={scene}
            type="button"
            data-scene={scene}
            onClick={demo.selectScene}
            aria-pressed={demo.scene === scene}
          >
            <span>{t(`tour.${scene}`)}</span>
            <ChevronRight size={18} />
          </button>
        ))}
      <button type="button" onClick={demo.reset}>
        <span>＋ {t("demo.newTask")}</span>
      </button>
    </div>
  );
}
export function DemoPermission({ language, demo }: Props) {
  const { t } = useSiteTranslation(language);
  if (!demo.permission)
    return (
      <button
        type="button"
        className="demo-activity demo-permission-trigger"
        onClick={demo.requestPermission}
      >
        <ShieldCheck size={18} />
        {t("tour.permission")}
      </button>
    );
  return (
    <div className="demo-permission" data-demo-target="permission">
      <h5>
        <ShieldCheck size={19} />
        {t("tour.permission")}
      </h5>
      <code>npm run check</code>
      {demo.permission === "pending" ? (
        <PermissionActions language={language} demo={demo} />
      ) : (
        <p>{t(demo.permission === "approved" ? "tour.approved" : "tour.denied")}</p>
      )}
    </div>
  );
}
function PermissionActions({ language, demo }: Props) {
  const { t } = useSiteTranslation(language);
  return (
    <>
      <p>{t("tour.permissionBody")}</p>
      <div className="demo-permission-actions">
        <button type="button" onClick={demo.denyPermission}>
          {t("tour.deny")}
        </button>
        <button type="button" onClick={demo.approvePermission}>
          {t("tour.allow")}
        </button>
      </div>
    </>
  );
}
export function DemoTerminal({ language, demo }: Props) {
  const { t } = useSiteTranslation(language);
  const output = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (output.current) output.current.scrollTop = output.current.scrollHeight;
  }, [demo.terminalLines]);
  return (
    <div className="demo-terminal-panel" data-demo-target="terminal">
      <div className="demo-panel-toolbar">
        <Terminal size={18} />
        <span>zsh · clawmuse.com</span>
        <span className="live-dot" />
      </div>
      <pre ref={output} tabIndex={0} aria-label={t("tour.terminal")} dir="ltr">
        {demo.terminalLines.join("\n")}
      </pre>
      <form className="demo-terminal-input" onSubmit={demo.runCommand} dir="ltr">
        <span>$</span>
        <input
          aria-label={t("tour.terminal")}
          value={demo.command}
          onChange={demo.changeCommand}
          autoComplete="off"
          spellCheck={false}
          placeholder="git status"
        />
        <button type="submit" aria-label={t("tour.send")}>
          <ArrowRight size={18} />
        </button>
      </form>
      <div className="demo-terminal-shortcuts">
        <button type="button" className="tour-action" onClick={demo.runChecks}>
          {t("tour.runChecks")}
        </button>
        <button
          type="button"
          className="tour-action"
          data-scene="browser"
          onClick={demo.selectScene}
        >
          <Globe size={16} />
          {t("tour.browser")}
        </button>
      </div>
    </div>
  );
}
export function DemoBrowser({ language, demo }: Props) {
  const { t } = useSiteTranslation(language);
  if (demo.device === "phone")
    return (
      <div className="demo-browser-unavailable">
        <Monitor size={40} />
        <h4>{t("tour.browser")}</h4>
        <p>{t("tour.desktopOnly")}</p>
        <button type="button" className="tour-action" onClick={demo.openDesktop}>
          {t("tour.openDesktop")}
          <ArrowUpRight size={16} />
        </button>
      </div>
    );
  return (
    <div className="demo-browser-panel" data-demo-target="browser">
      <div className="demo-browser-address" dir="ltr">
        <button
          type="button"
          onClick={demo.navigatePreview}
          aria-label={t("tour.previewBack")}
          disabled={demo.previewPage === "home"}
        >
          <ArrowLeft size={17} />
        </button>
        <button type="button" onClick={demo.reloadPreview} aria-label={t("tour.reloadPreview")}>
          <RotateCw size={16} />
        </button>
        <span>
          <Globe size={14} />
          localhost:5173/{demo.previewLocale === "zh" ? "zh/" : ""}
          {demo.previewPage === "about" ? "about" : ""}
        </span>
      </div>
      <BrowserContent key={demo.previewReload} demo={demo} />
    </div>
  );
}
function BrowserContent({ demo }: { demo: DemoSession }) {
  const zh = demo.previewLocale === "zh";
  const title = zh ? "让好想法，成为现实。" : "Make room for good ideas.";
  const about = zh ? "为专注工作而设计。" : "Designed for focused work.";
  return (
    <div className="demo-preview-site" lang={zh ? "zh-CN" : "en"} dir="ltr">
      <nav>
        <strong>studio.</strong>
        <div>
          <button
            type="button"
            data-locale="en"
            onClick={demo.selectPreviewLocale}
            aria-pressed={!zh}
          >
            EN
          </button>
          <button
            type="button"
            data-locale="zh"
            onClick={demo.selectPreviewLocale}
            aria-pressed={zh}
          >
            中文
          </button>
        </div>
      </nav>
      <div className="demo-preview-page">
        <span>DESIGN / BUILD / SHIP</span>
        <h3>{demo.previewPage === "home" ? title : about}</h3>
        <p>
          {zh
            ? "一个从桌面到手机，都清晰易用的工作空间。"
            : "A thoughtful workspace, from your desktop to your phone."}
        </p>
        <button type="button" onClick={demo.navigatePreview}>
          {zh ? "探索工作室" : "Explore the studio"}
          <ArrowRight size={18} />
        </button>
      </div>
      <div className="demo-preview-grid">
        <span>01 / {zh ? "构思" : "Ideas"}</span>
        <span>02 / {zh ? "设计" : "Design"}</span>
        <span>03 / {zh ? "实现" : "Build"}</span>
      </div>
    </div>
  );
}
export function DemoStatus({ language, demo }: Props) {
  const { t } = useSiteTranslation(language);
  return (
    <div className="demo-status-panel" data-demo-target="status">
      <div className="demo-panel-toolbar">
        <LockKeyhole size={18} />
        <span>ClawMuse Status</span>
      </div>
      <div className="demo-status-tabs">
        <button
          type="button"
          aria-pressed={demo.statusView === "activity"}
          onClick={demo.toggleStatus}
          disabled={demo.statusView === "activity"}
        >
          {t("tour.liveActivity")}
        </button>
        <button
          type="button"
          aria-pressed={demo.statusView === "widget"}
          onClick={demo.toggleStatus}
          disabled={demo.statusView === "widget"}
        >
          {t("tour.widget")}
        </button>
      </div>
      {demo.statusView === "activity" ? (
        <LiveActivity language={language} demo={demo} />
      ) : (
        <QuotaWidget language={language} />
      )}
    </div>
  );
}
function LiveActivity({ language, demo }: Props) {
  const { t } = useSiteTranslation(language);
  return (
    <div className="demo-lockscreen">
      <LockKeyhole size={23} />
      <strong className="demo-lock-time">9:41</strong>
      <div className="demo-live-capsule">
        <span>
          <span className="live-dot" /> ClawMuse
        </span>
        <h5>{t("tour.review")}</h5>
        <p>{demo.host} · Codex</p>
        <div>
          <span>Claude Code</span>
          <meter min="0" max="100" value="38" aria-label="Claude Code" />
          <b>38%</b>
        </div>
        <button type="button" onClick={demo.openChat}>
          {t("tour.chat")}
          <ArrowUpRight size={17} />
        </button>
      </div>
    </div>
  );
}
function QuotaWidget({ language }: { language: Language }) {
  const { t } = useSiteTranslation(language);
  return (
    <div className="demo-quota-widget">
      <span>ClawMuse</span>
      <h5>{t("tour.usage")}</h5>
      <label>
        Claude Code <b>38%</b>
        <meter min="0" max="100" value="38" />
      </label>
      <label>
        Codex <b>21%</b>
        <meter min="0" max="100" value="21" />
      </label>
      <small>MacBook Pro</small>
    </div>
  );
}
