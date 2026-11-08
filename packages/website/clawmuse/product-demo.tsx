import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  Archive,
  SquarePen,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  AudioLines,
  BatteryFull,
  Check,
  CheckCheck,
  Copy,
  ChevronDown,
  ChevronLeft,
  Globe,
  LockKeyhole,
  MoreHorizontal,
  Paperclip,
  Plus,
  ChevronRight,
  FileCode2,
  FolderGit2,
  GitBranch,
  Laptop,
  MessageSquare,
  Mic,
  MicOff,
  Monitor,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Signal,
  Smartphone,
  Square,
  Target,
  Terminal,
  Wifi,
  X,
} from "lucide-react";
import type { Language } from "./i18n/locales";
import { useSiteTranslation } from "./i18n/i18n";
import { Mark } from "./mark";
import { DemoProviderIcon } from "./demo-provider-icon";
import { modelLabel } from "./demo-models";
import { href } from "./content";
import { useDemoSession, type DemoSession } from "./demo-session";
import { DemoBrowser, DemoPermission, DemoSheet, DemoStatus, DemoTerminal } from "./demo-panels";

interface DemoProps {
  language: Language;
  demo: DemoSession;
}
interface DeviceProps extends DemoProps {
  id: string;
}
const devices = [
  { id: "phone", icon: Smartphone },
  { id: "desktop", icon: Monitor },
  { id: "linux", icon: Terminal },
] as const;
const scenes = [
  { id: "chat", icon: MessageSquare },
  { id: "voice", icon: AudioLines },
  { id: "files", icon: FileCode2 },
  { id: "terminal", icon: Terminal },
  { id: "browser", icon: Globe },
  { id: "hosts", icon: Laptop },
  { id: "goals", icon: Target },
  { id: "status", icon: LockKeyhole },
] as const;
const files = [
  {
    name: "src/i18n.ts",
    added: 24,
    removed: 4,
    before: 'const locale = "en";',
    after: "const locale = getLocale(pathname);",
  },
  {
    name: "src/LanguageSwitch.tsx",
    added: 18,
    removed: 6,
    before: "<span>English</span>",
    after: "<LanguageSwitch locale={locale} />",
  },
  {
    name: "src/styles.css",
    added: 6,
    removed: 2,
    before: ".navigation { gap: 24px; }",
    after: ".navigation { gap: clamp(12px, 3vw, 24px); }",
  },
];
const dictationLabels = {
  idle: "tour.play",
  playing: "tour.pause",
  paused: "tour.resume",
} as const;
const dictationIcons = { idle: Mic, playing: Pause, paused: Play };
const goalLabels = {
  suggested: "tour.suggested",
  running: "tour.working",
  review: "tour.review",
} as const;
const waveformBars = Array.from({ length: 12 }, (_, index) => `bar-${index}`);

function navigateTabs(event: KeyboardEvent<HTMLButtonElement>) {
  if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const tabs = Array.from(
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=tab]") ?? [],
  );
  const direction = event.key === "ArrowRight" ? 1 : -1;
  let index = (tabs.indexOf(event.currentTarget) + direction + tabs.length) % tabs.length;
  if (event.key === "Home") index = 0;
  if (event.key === "End") index = tabs.length - 1;
  tabs[index]?.focus();
  tabs[index]?.click();
}
function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
  event.preventDefault();
  event.currentTarget.form?.requestSubmit();
}

export function ProductDemo({ language }: { language: Language }) {
  const { t } = useSiteTranslation(language);
  const demo = useDemoSession(language);
  const id = useId();
  return (
    <div
      className="product-tour"
      data-testid="product-demo"
      data-visible={demo.visible}
      data-playback={demo.playback}
      data-step={demo.step}
    >
      <DemoToolbar language={language} demo={demo} id={id} />
      <progress
        className="tour-progress"
        max={demo.stepCount}
        value={demo.step + demo.elapsed / demo.currentStep.duration}
        aria-label={t("tour.autoplay")}
      />
      <div
        ref={demo.stageRef}
        className={`tour-stage tour-${demo.device}`}
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-${demo.device}`}
      >
        {demo.device === "linux" ? (
          <LinuxDemo language={language} />
        ) : (
          <>
            <DemoScenes language={language} demo={demo} />
            <DemoDevice language={language} demo={demo} />
          </>
        )}
      </div>
    </div>
  );
}
function DemoPlayback({ language, demo }: DemoProps) {
  const { t } = useSiteTranslation(language);
  const label = {
    playing: "tour.pauseTour",
    paused: "tour.resumeTour",
    manual: "tour.replayTour",
    complete: "tour.replayTour",
  } as const;
  return (
    <div className="tour-playback">
      <button
        type="button"
        onClick={demo.togglePlayback}
        aria-label={t(label[demo.playback])}
        title={t(label[demo.playback])}
      >
        {demo.playback === "playing" ? <Pause size={17} /> : <Play size={17} />}
      </button>
      <button
        type="button"
        onClick={demo.reset}
        aria-label={t("tour.reset")}
        title={t("tour.reset")}
      >
        <RotateCcw size={16} />
      </button>
    </div>
  );
}
function DemoToolbar({ language, demo, id }: DeviceProps) {
  const { t } = useSiteTranslation(language);
  return (
    <div className="tour-toolbar">
      <div className="demo-tabs" role="tablist" aria-label={t("demo.label")}>
        {devices.map(({ id: item, icon: Icon }) => (
          <button
            key={item}
            type="button"
            role="tab"
            id={`${id}-${item}`}
            aria-controls={`${id}-panel`}
            aria-selected={demo.device === item}
            aria-label={t(`demo.devices.${item}`)}
            title={t(`demo.devices.${item}`)}
            tabIndex={demo.device === item ? 0 : -1}
            data-device={item}
            onKeyDown={navigateTabs}
            onClick={demo.selectDevice}
          >
            <Icon size={16} />
            <span>{t(`demo.devices.${item}`)}</span>
          </button>
        ))}
      </div>
      <DemoPlayback language={language} demo={demo} />
    </div>
  );
}
function DemoScenes({ language, demo }: DemoProps) {
  const { t } = useSiteTranslation(language);
  return (
    <div className="tour-scenes" role="group" aria-label={t("tour.scenarios")}>
      {scenes.map(({ id: item, icon: Icon }) => (
        <button
          type="button"
          key={item}
          aria-pressed={demo.scene === item}
          data-scene={item}
          onClick={demo.selectScene}
        >
          <Icon size={17} />
          <span>{t(`tour.${item}`)}</span>
        </button>
      ))}
    </div>
  );
}
function DemoDevice({ language, demo }: DemoProps) {
  const timeline = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  // Keep the prerendered markup free of inline styles under the site's CSP.
  // After hydration, React writes the measured transform through the CSSOM.
  const [scale, setScale] = useState<number | null>(null);
  const deviceStyle = useMemo(
    () =>
      demo.device === "phone" && scale !== null ? { transform: `scale(${scale})` } : undefined,
    [demo.device, scale],
  );
  const chat = demo.scene === "chat" || demo.scene === "voice";
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setScale(Math.min(1, entry.contentRect.width / 456)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const element = timeline.current;
    if (element && chat) element.scrollTop = element.scrollHeight;
  }, [demo.messages, demo.scene, demo.permission, demo.device, chat]);
  useEffect(() => {
    const element = timeline.current;
    if (element && !chat) element.scrollTop = 0;
  }, [demo.scene, demo.device, chat]);
  return (
    <div className={`device-viewport viewport-${demo.device}`} ref={viewport}>
      <div
        className={`workspace-device ${demo.device === "phone" ? "mobile-device" : "wide-device"}`}
        style={deviceStyle}
        data-cue={demo.playback === "playing" ? demo.currentStep.target : undefined}
      >
        {demo.device === "phone" ? (
          <PhoneStatus />
        ) : (
          <div className="tour-window-bar">
            <span className="traffic">
              <i />
              <i />
              <i />
            </span>
            <span>ClawMuse · {demo.host}</span>
          </div>
        )}
        <div className="workspace-demo-body" inert={demo.sheet !== null}>
          <DemoHeader language={language} demo={demo} />
          {demo.sidebarOpen ? (
            <DemoSidebar language={language} demo={demo} />
          ) : (
            <DemoBody language={language} demo={demo} timeline={timeline} />
          )}
        </div>
        {demo.sheet && <DemoSheet language={language} demo={demo} />}
        {demo.device === "phone" && (
          <div className="demo-home-indicator">
            <span />
          </div>
        )}
      </div>
    </div>
  );
}
function DemoBody({
  language,
  demo,
  timeline,
}: DemoProps & { timeline: React.RefObject<HTMLDivElement | null> }) {
  const { t } = useSiteTranslation(language);
  const chat = demo.scene === "chat" || demo.scene === "voice";
  return (
    <>
      <div className={`workspace-demo-scroll scene-${demo.scene}`} ref={timeline}>
        {chat &&
          (demo.chatClosed ? (
            <div className="demo-closed-chat" role="status">
              <p>
                {t(demo.chatClosed === "archived" ? "tour.workspaceArchived" : "tour.chatClosed")}
              </p>
              <button type="button" onClick={demo.reset}>
                <SquarePen size={24} />
                {t("demo.newTask")}
              </button>
            </div>
          ) : (
            <DemoConversation language={language} demo={demo} />
          ))}
        {demo.scene === "files" && <DemoFiles language={language} demo={demo} />}
        {demo.scene === "terminal" && <DemoTerminal language={language} demo={demo} />}
        {demo.scene === "browser" && <DemoBrowser language={language} demo={demo} />}
        {demo.scene === "hosts" && <DemoHosts language={language} demo={demo} />}
        {demo.scene === "goals" && <DemoGoals language={language} demo={demo} />}
        {demo.scene === "status" && <DemoStatus language={language} demo={demo} />}
      </div>
      {chat && !demo.chatClosed && <DemoComposer language={language} demo={demo} />}
    </>
  );
}
function DemoHeader({ language, demo }: DemoProps) {
  const { t } = useSiteTranslation(language);
  return (
    <header className="workspace-demo-header">
      <button
        type="button"
        className="demo-navigation-island"
        aria-label={t(demo.sidebarOpen ? "tour.close" : "demo.workspace")}
        aria-expanded={demo.sidebarOpen}
        onClick={demo.toggleSidebar}
        data-demo-target="workspace"
      >
        {demo.sidebarOpen ? <X size={24} /> : <ChevronLeft size={30} strokeWidth={2.5} />}
      </button>
      <div>
        <strong>main</strong>
        <span>clawmuse.com · {demo.host}</span>
      </div>
      <div className="demo-header-island">
        <button type="button" aria-label={t("tour.tabs")} onClick={demo.openTabs}>
          <span className="demo-tab-count">{demo.chatClosed ? 3 : 4}</span>
        </button>
        <button type="button" aria-label={t("tour.files")} onClick={demo.openFiles}>
          <MoreHorizontal size={24} />
        </button>
      </div>
    </header>
  );
}
function DemoSidebar({ language, demo }: DemoProps) {
  const { t } = useSiteTranslation(language);
  return (
    <div className="tour-sidebar">
      <Mark />
      <h4>{t("demo.workspace")}</h4>
      <span className="demo-sidebar-project">
        <FolderGit2 size={18} />
        clawmuse.com
        <GitBranch size={14} />
        main
      </span>
      {scenes.map(({ id: item, icon: Icon }) => (
        <button type="button" key={item} data-scene={item} onClick={demo.selectScene}>
          <Icon size={18} />
          {t(`tour.${item}`)}
          <ChevronRight size={15} />
        </button>
      ))}
    </div>
  );
}
function DemoConversation({ language, demo }: DemoProps) {
  const { t } = useSiteTranslation(language);
  return (
    <div className="demo-conversation-content" data-demo-target="conversation">
      {demo.messages.length === 0 && (
        <div className="demo-empty-state" aria-hidden="true">
          <Mark />
          <strong>{t("tour.emptyHeading")}</strong>
          <p>{t("tour.chatBody")}</p>
        </div>
      )}
      {demo.messages.map((message) => (
        <div key={message.id} className="demo-message-turn">
          <div className="demo-user-message">{message.prompt}</div>
          <div className="demo-message-actions demo-user-actions">
            <time>9:41</time>
            <DemoCopy language={language} text={message.prompt} />
          </div>
          <p
            className="demo-assistant-message"
            data-testid={message.complete ? "demo-reply" : "demo-stream"}
            aria-busy={!message.complete}
          >
            {message.reply.slice(0, message.revealed)}
            {!message.complete && <span className="demo-thinking" />}
          </p>
          {message.complete && (
            <div className="demo-message-actions">
              <DemoCopy language={language} text={message.reply} />
            </div>
          )}
        </div>
      ))}
      {demo.messages.length > 0 && <DemoActivity language={language} demo={demo} />}
    </div>
  );
}
function DemoCopy({ language, text }: { language: Language; text: string }) {
  const { t } = useSiteTranslation(language);
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }, [text]);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={t("codeBlock.copy")}
      title={t("codeBlock.copy")}
    >
      {copied ? <Check size={20} /> : <Copy size={20} />}
    </button>
  );
}
function DemoActivity({ language, demo }: DemoProps) {
  const { t } = useSiteTranslation(language);
  return (
    <>
      <button
        type="button"
        className="demo-activity"
        aria-expanded={demo.activityOpen}
        onClick={demo.toggleActivity}
      >
        <Check size={17} />
        <span>{t("tour.activity")}</span>
        <ChevronDown size={17} />
      </button>
      {demo.activityOpen && (
        <div className="demo-activity-details">
          <code>read_file · src/i18n.ts</code>
          <code>apply_patch · 3 files</code>
          <code>check · responsive layout</code>
        </div>
      )}
      <DemoPermission language={language} demo={demo} />
      {demo.permission !== "pending" && (
        <div className="tour-file-summary" data-demo-target="changes">
          <button type="button" onClick={demo.openFiles}>
            <FileCode2 size={18} />
            <span>{t("demo.files")}</span>
            <b dir="ltr">
              +48 <em>−12</em>
            </b>
            <ChevronRight size={17} />
          </button>
          {demo.permission === "approved" && (
            <p>
              <CheckCheck size={16} />
              {t("demo.tests")}
            </p>
          )}
        </div>
      )}
    </>
  );
}
function DemoComposer({ language, demo }: DemoProps) {
  const { t } = useSiteTranslation(language);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const node = input.current;
    if (!node) return;
    node.style.height = "0px";
    node.style.height = `${Math.min(140, node.scrollHeight)}px`;
  }, [demo.draft, demo.device]);
  return (
    <div className="demo-composer-area" data-demo-target="composer">
      <div className="demo-composer-rail">
        <button type="button" aria-label={t("demo.newTask")} onClick={demo.reset}>
          <SquarePen size={24} strokeWidth={1.25} />
        </button>
        <button type="button" aria-label={t("tour.closeChat")} onClick={demo.closeChat}>
          <X size={24} strokeWidth={1.25} />
        </button>
        <button
          type="button"
          aria-label={t("tour.archiveWorkspace")}
          onClick={demo.archiveWorkspace}
        >
          <Archive size={24} strokeWidth={1.25} />
        </button>
      </div>

      {demo.attachment && (
        <button type="button" className="demo-attachment" onClick={demo.toggleAttachment}>
          <Paperclip size={16} />
          layout.png
          <X size={15} />
        </button>
      )}
      <div className={`demo-input-surface ${demo.voiceMode ? "is-voice" : ""}`}>
        <form
          inert={demo.voiceMode}
          aria-hidden={demo.voiceMode || undefined}
          className={`demo-composer ${demo.dictation !== "idle" ? "is-dictating" : ""}`}
          onSubmit={demo.send}
        >
          {demo.dictation !== "idle" && (
            <div className="demo-transcription-state">
              <Waveform active={demo.dictation === "playing"} />
              <span>{t(demo.dictation === "playing" ? "tour.transcribing" : "tour.paused")}</span>
              <button type="button" onClick={demo.finishDictation} aria-label={t("tour.finish")}>
                <Check size={15} />
              </button>
            </div>
          )}
          <textarea
            ref={input}
            rows={1}
            aria-label={t("tour.message")}
            placeholder={t("tour.placeholder")}
            value={demo.draft}
            readOnly={demo.dictation !== "idle"}
            maxLength={1000}
            onChange={demo.changeDraft}
            onKeyDown={submitOnEnter}
          />
          <DemoComposerActions language={language} demo={demo} />
        </form>
        {demo.voiceMode && <DemoVoiceControls language={language} demo={demo} />}
      </div>
    </div>
  );
}
function DemoVoiceControls({ language, demo }: DemoProps) {
  const { t } = useSiteTranslation(language);
  return (
    <div className="demo-voice-preview">
      <div className="demo-voice-controls">
        <div
          className={`demo-volume-meter ${!demo.voiceMuted && demo.playback !== "paused" ? "active" : ""}`}
          aria-hidden="true"
        >
          <i />
          <i />
          <i />
        </div>
        {demo.pending && (
          <button type="button" className="voice-interrupt" onClick={demo.stop}>
            {t("tour.interrupt")}
          </button>
        )}
        <button
          type="button"
          aria-label={t(demo.voiceMuted ? "tour.unmute" : "tour.mute")}
          aria-pressed={demo.voiceMuted}
          onClick={demo.muteVoice}
        >
          {demo.voiceMuted ? (
            <MicOff size={24} strokeWidth={2.5} />
          ) : (
            <Mic size={24} strokeWidth={2.5} />
          )}
        </button>
        <button
          type="button"
          className="voice-stop"
          aria-label={t("tour.close")}
          onClick={demo.closeVoice}
        >
          <Square size={24} strokeWidth={2.5} fill="currentColor" />
        </button>
      </div>
    </div>
  );
}
function DemoComposerActions({ language, demo }: DemoProps) {
  const { t } = useSiteTranslation(language);
  const DictationIcon = dictationIcons[demo.dictation];
  return (
    <div className="demo-composer-actions">
      <div className="demo-composer-left">
        <button
          type="button"
          aria-label={t("tour.attach")}
          aria-pressed={demo.attachment}
          onClick={demo.toggleAttachment}
        >
          <Plus size={24} strokeWidth={2.5} />
        </button>
        <button
          type="button"
          className="demo-model-control"
          onClick={demo.openModels}
          aria-label={`${t("tour.models")}: ${demo.provider} · ${modelLabel(demo.provider, demo.model)} · ${demo.thinking}`}
          data-demo-target="models"
        >
          <DemoProviderIcon provider={demo.provider} size={demo.device === "phone" ? 20 : 16} />
          <span className="demo-model-label">
            {modelLabel(demo.provider, demo.model).split("/").at(-1)}
          </span>
          <span className="demo-model-thinking">{demo.thinking}</span>
        </button>
      </div>
      <div className="demo-composer-right">
        <span className="demo-context-meter" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 16 16">
            <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
        </span>
        <button
          type="button"
          className={demo.dictation !== "idle" ? "active" : ""}
          onClick={demo.toggleDictation}
          aria-label={t(dictationLabels[demo.dictation])}
          disabled={demo.pending}
        >
          <DictationIcon size={24} strokeWidth={2.5} />
        </button>
        <DemoPrimaryAction language={language} demo={demo} />
      </div>
    </div>
  );
}

function DemoPrimaryAction({ language, demo }: DemoProps) {
  const { t } = useSiteTranslation(language);
  if (demo.pending)
    return (
      <button type="button" className="demo-send" onClick={demo.stop} aria-label={t("tour.stop")}>
        <Square size={16} fill="currentColor" />
      </button>
    );
  if (demo.draft.trim() || demo.attachment)
    return (
      <button
        type="submit"
        className="demo-send"
        aria-label={t("tour.send")}
        disabled={demo.dictation !== "idle"}
      >
        <ArrowUp size={24} strokeWidth={2.5} />
      </button>
    );
  return (
    <button
      type="button"
      className="demo-send"
      aria-label={t("tour.voiceMode")}
      aria-pressed={demo.voiceMode}
      onClick={demo.toggleVoice}
    >
      <AudioLines size={24} strokeWidth={2.5} />
    </button>
  );
}
function DemoFiles({ language, demo }: DemoProps) {
  const { t } = useSiteTranslation(language);
  const file = files[demo.fileIndex];
  return (
    <div className="demo-file-panel" data-demo-target="diff">
      <span className="demo-pane-eyebrow">{t("tour.files")}</span>
      <h4>{t("demo.files")}</h4>
      <div className="demo-file-list">
        {files.map((item, index) => (
          <button
            type="button"
            key={item.name}
            aria-pressed={demo.fileIndex === index}
            data-file={index}
            onClick={demo.selectFile}
          >
            <FileCode2 size={14} />
            <code>{item.name}</code>
            <b dir="ltr">
              +{item.added} <em>−{item.removed}</em>
            </b>
          </button>
        ))}
      </div>
      <div className="demo-diff">
        <div>
          <span>{file.name}</span>
          <span>diff</span>
        </div>
        <pre>
          <code>
            <span className="diff-context">@@ -1,1 +1,1 @@{"\n"}</span>
            <span className="diff-removed">
              − {file.before}
              {"\n"}
            </span>
            <span className="diff-added">+ {file.after}</span>
          </code>
        </pre>
      </div>
      <button type="button" className="tour-action" onClick={demo.openChat}>
        <ArrowLeft size={14} />
        {t("tour.chat")}
      </button>
    </div>
  );
}
function DemoHosts({ language, demo }: DemoProps) {
  const { t } = useSiteTranslation(language);
  return (
    <div className="demo-host-panel" data-demo-target="hosts">
      <span className="demo-pane-eyebrow">{t("demo.connected")}</span>
      <h4>{t("tour.hosts")}</h4>
      <div className="demo-host-list">
        {["MacBook Pro", "Linux Server"].map((name) => (
          <button
            type="button"
            key={name}
            aria-pressed={demo.host === name}
            data-host={name}
            onClick={demo.selectHost}
          >
            {name === "MacBook Pro" ? <Laptop size={22} /> : <Terminal size={22} />}
            <span>
              <strong>{name}</strong>
              <small>
                <span className="live-dot" />
                {t("demo.online")}
              </small>
            </span>
            {demo.host === name ? <Check size={17} /> : <ChevronRight size={17} />}
          </button>
        ))}
      </div>
      <div className="demo-route">
        <ShieldCheck size={16} />
        <span>{t(demo.host === "MacBook Pro" ? "tour.direct" : "tour.relay")}</span>
      </div>
      <DemoUsage language={language} demo={demo} />
    </div>
  );
}
function DemoUsage({ language, demo }: DemoProps) {
  const { t } = useSiteTranslation(language);
  const usage = [
    { label: "Claude Code", value: demo.host === "MacBook Pro" ? 38 : 24 },
    { label: "Codex", value: demo.host === "MacBook Pro" ? 21 : 46 },
  ];
  return (
    <div className="demo-usage">
      <h5>
        {t("tour.usage")}
        <span>{demo.host}</span>
      </h5>
      {usage.map(({ label, value }) => (
        <div key={label}>
          <span>
            {label}
            <b>{value}%</b>
          </span>
          <meter min={0} max={100} value={value} aria-label={`${label} · ${t("tour.usage")}`} />
        </div>
      ))}
    </div>
  );
}
function DemoGoals({ language, demo }: DemoProps) {
  const { t } = useSiteTranslation(language);
  return (
    <div className="demo-goal-panel" data-demo-target="goals">
      <span className="demo-pane-eyebrow">CLAWMUSE GOALS</span>
      <h4>{t("tour.goals")}</h4>
      <div className="demo-goal-card">
        <span className={`demo-goal-status ${demo.goal}`}>
          <Target size={14} />
          {t(goalLabels[demo.goal])}
        </span>
        <h5>{t("tour.goalTitle")}</h5>
        <p>{t("tour.goalBody")}</p>
        <GoalConfiguration language={language} demo={demo} />
        <DemoGoalAction language={language} demo={demo} />
      </div>
    </div>
  );
}
function GoalConfiguration({ language, demo }: DemoProps) {
  const { t } = useSiteTranslation(language);
  const locked = demo.goal !== "suggested";
  return (
    <div className="demo-goal-config">
      <label>
        {t("tour.hosts")}
        <select value={demo.host} onChange={demo.changeGoalHost} disabled={locked}>
          <option>MacBook Pro</option>
          <option>Linux Server</option>
        </select>
      </label>
      <label>
        Agent
        <select value={demo.goalProvider} onChange={demo.changeGoalProvider} disabled={locked}>
          <option>Codex</option>
          <option>Claude Code</option>
          <option>OpenCode</option>
        </select>
      </label>
      <label>
        {t("tour.budget")}
        <select value={demo.goalBudget} onChange={demo.changeGoalBudget} disabled={locked}>
          <option>1</option>
          <option>3</option>
          <option>5</option>
        </select>
      </label>
    </div>
  );
}
function DemoGoalAction({ language, demo }: DemoProps) {
  const { t } = useSiteTranslation(language);
  if (demo.goal === "suggested")
    return (
      <button type="button" className="tour-action" onClick={demo.approveGoal}>
        <Check size={15} />
        {t("tour.approve")}
      </button>
    );
  if (demo.goal === "running") return <p role="status">{t("tour.working")}</p>;
  return (
    <div className="demo-goal-result" role="status">
      <CheckCheck size={20} />
      <p>{t("tour.goalResult")}</p>
      <button type="button" className="tour-action" onClick={demo.openFiles}>
        {t("tour.files")}
        <ArrowRight size={14} />
      </button>
    </div>
  );
}
function PhoneStatus() {
  return (
    <div className="demo-phone-status" aria-hidden="true">
      <span>9:41</span>
      <span className="demo-island" />
      <span>
        <Signal size={19} />
        <Wifi size={19} />
        <BatteryFull size={26} />
      </span>
    </div>
  );
}
function Waveform({ active = false }: { active?: boolean }) {
  return (
    <span className={`demo-waveform ${active ? "active" : ""}`} aria-hidden="true">
      {waveformBars.map((bar) => (
        <i key={bar} />
      ))}
    </span>
  );
}
function LinuxDemo({ language }: { language: Language }) {
  const { t } = useSiteTranslation(language);
  return (
    <div className="linux-demo">
      <div>
        <div className="eyebrow">{t("demo.clawmuseHeadless")}</div>
        <h3>{t("demo.linuxHint")}</h3>
        <p>{t("demo.linuxCopy")}</p>
        <a href={href("/docs/linux", language)}>
          {t("demo.linuxGuide")}
          <ArrowRight size={16} />
        </a>
      </div>
      <div className="terminal-window">
        <div className="terminal-top">
          <Terminal size={15} />
          user@linux
        </div>
        <pre>
          <span className="muted">$ </span>clawmuse account login --name my-linux{"\n\n"}
          <span className="muted">◇ ClawMuse email</span>
          {"\n"} you@example.com{"\n"}
          <span className="muted">◇ ClawMuse password</span>
          {"\n"} ••••••••••••{"\n\n"}
          <span className="terminal-success">✓ Connected: my-linux</span>
          {"\n\n"}
          <span className="muted">$ </span>clawmuse status
          <span className="cursor" />
        </pre>
      </div>
    </div>
  );
}

export function MobilePreview({ language }: { language: Language }) {
  const { t } = useSiteTranslation(language);
  const demo = useDemoSession(language, true);
  return (
    <div className="hero-product-preview" ref={demo.stageRef}>
      <div className="hero-code-window" aria-hidden="true">
        <div>
          <span className="traffic">
            <i />
            <i />
            <i />
          </span>
          <span>clawmuse.com</span>
        </div>
        <pre>
          <code>
            <span>src/LanguageSwitch.tsx</span>
            {"\n\n"}export function LanguageSwitch() {"{"}
            {"\n"} return ({"\n"} &lt;select lang={"{locale}"}&gt;{"\n"}{" "}
            &lt;option&gt;English&lt;/option&gt;{"\n"} &lt;option&gt;中文&lt;/option&gt;{"\n"}{" "}
            &lt;/select&gt;{"\n"} );{"\n"}
            {"}"}
          </code>
        </pre>
        <span className="hero-code-footer">
          <GitBranch size={13} />
          main<span>+48 −12</span>
        </span>
      </div>
      <div className="hero-device-holder">
        <DemoDevice language={language} demo={demo} />
      </div>
      <div className="hero-voice-badge">
        <AudioLines size={23} />
        <div>
          <strong>{t("tour.voice")}</strong>
          <span>{t("tour.transcribing")}</span>
        </div>
        <Waveform />
      </div>
      <button
        type="button"
        className="hero-playback-toggle"
        onClick={demo.togglePlayback}
        aria-label={t(demo.playback === "playing" ? "tour.pauseTour" : "tour.replayTour")}
      >
        {demo.playback === "playing" ? <Pause size={15} /> : <Play size={15} />}
      </button>
      <a className="hero-demo-link" href="#experience">
        {t("tour.interactive")}
        <ArrowUpRight size={15} />
      </a>
    </div>
  );
}
