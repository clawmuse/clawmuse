import {
  AudioLines,
  Blocks,
  Check,
  Clock,
  GitBranch,
  Globe,
  Mic,
  ShieldCheck,
  Smartphone,
  Target,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import { useSiteTranslation } from "./i18n/i18n";
import { SectionHeading, type Localized } from "./ui";

const VOICE_BARS = [
  { id: "b0", heightClass: "h-1" },
  { id: "b1", heightClass: "h-2" },
  { id: "b2", heightClass: "h-4" },
  { id: "b3", heightClass: "h-3" },
  { id: "b4", heightClass: "h-5" },
  { id: "b5", heightClass: "h-4" },
  { id: "b6", heightClass: "h-2" },
  { id: "b7", heightClass: "h-5" },
  { id: "b8", heightClass: "h-3" },
  { id: "b9", heightClass: "h-4" },
  { id: "b10", heightClass: "h-2" },
  { id: "b11", heightClass: "h-1" },
] as const;

const USAGE_DAYS = [
  { id: "d1", barClass: "day-bar-42" },
  { id: "d2", barClass: "day-bar-68" },
  { id: "d3", barClass: "day-bar-55" },
  { id: "d4", barClass: "day-bar-84" },
  { id: "d5", barClass: "day-bar-74" },
  { id: "d6", barClass: "day-bar-92" },
  { id: "d7", barClass: "day-bar-61" },
] as const;

interface CapabilityItem {
  id: string;
  Icon: LucideIcon;
  tagKey:
    | "capabilities.terminalTag"
    | "capabilities.networkTag"
    | "capabilities.pluginsTag"
    | "capabilities.browserTag"
    | "capabilities.worktreeTag"
    | "capabilities.scheduleTag";
  titleKey:
    | "capabilities.terminalTitle"
    | "capabilities.networkTitle"
    | "capabilities.pluginsTitle"
    | "capabilities.browserTitle"
    | "capabilities.worktreeTitle"
    | "capabilities.scheduleTitle";
  bodyKey:
    | "capabilities.terminalBody"
    | "capabilities.networkBody"
    | "capabilities.pluginsBody"
    | "capabilities.browserBody"
    | "capabilities.worktreeBody"
    | "capabilities.scheduleBody";
}

const CAPABILITIES: readonly CapabilityItem[] = [
  {
    id: "terminal",
    Icon: Terminal,
    tagKey: "capabilities.terminalTag",
    titleKey: "capabilities.terminalTitle",
    bodyKey: "capabilities.terminalBody",
  },
  {
    id: "network",
    Icon: ShieldCheck,
    tagKey: "capabilities.networkTag",
    titleKey: "capabilities.networkTitle",
    bodyKey: "capabilities.networkBody",
  },
  {
    id: "plugins",
    Icon: Blocks,
    tagKey: "capabilities.pluginsTag",
    titleKey: "capabilities.pluginsTitle",
    bodyKey: "capabilities.pluginsBody",
  },
  {
    id: "browser",
    Icon: Globe,
    tagKey: "capabilities.browserTag",
    titleKey: "capabilities.browserTitle",
    bodyKey: "capabilities.browserBody",
  },
  {
    id: "worktree",
    Icon: GitBranch,
    tagKey: "capabilities.worktreeTag",
    titleKey: "capabilities.worktreeTitle",
    bodyKey: "capabilities.worktreeBody",
  },
  {
    id: "schedule",
    Icon: Clock,
    tagKey: "capabilities.scheduleTag",
    titleKey: "capabilities.scheduleTitle",
    bodyKey: "capabilities.scheduleBody",
  },
];

function VoiceSpotlightVisual({ language }: Localized) {
  const { t } = useSiteTranslation(language);
  return (
    <div className="spotlight-visual spotlight-visual-voice" dir="ltr">
      <div className="spotlight-card-head">
        <span className="spotlight-chip">
          <Mic size={13} aria-hidden="true" />
          <span>MacBook Pro · 3 tasks</span>
        </span>
        <span className="spotlight-live-badge">
          <i className="live-dot" aria-hidden="true" />
          <span>Realtime Voice</span>
        </span>
      </div>
      <div className="spotlight-waveform" aria-hidden="true">
        {VOICE_BARS.map(({ id, heightClass }) => (
          <span key={id} className={`spotlight-wave-bar ${heightClass}`} />
        ))}
      </div>
      <blockquote className="spotlight-quote">{t("spotlights.voiceQuote")}</blockquote>
      <div className="spotlight-pill-row">
        <span className="spotlight-status-pill is-done">{t("spotlights.voicePillDone")}</span>
        <span className="spotlight-status-pill is-warn">{t("spotlights.voicePillReview")}</span>
        <span className="spotlight-status-pill is-active">{t("spotlights.voicePillRunning")}</span>
      </div>
    </div>
  );
}

function StatusSpotlightVisual({ language }: Localized) {
  const { t } = useSiteTranslation(language);
  return (
    <div className="spotlight-visual spotlight-visual-status" dir="ltr">
      <div className="status-capsule-card">
        <div className="status-capsule-head">
          <span className="status-capsule-dot" aria-hidden="true" />
          <strong>{t("spotlights.statusCapsuleTitle")}</strong>
          <span>{t("spotlights.statusCapsuleMeta")}</span>
        </div>
        <div className="status-capsule-counts">
          <span className="count-pill is-running">2 running</span>
          <span className="count-pill is-review">1 review</span>
          <span className="count-pill is-done">3 done</span>
        </div>
      </div>
      <div className="status-widget-card">
        <div className="status-widget-head">
          <div>
            <strong>{t("spotlights.statusWidgetTitle")}</strong>
            <small>{t("spotlights.statusWidgetSub")}</small>
          </div>
          <span className="status-widget-total">18.4M</span>
        </div>
        <div className="status-meters">
          <div className="status-meter-row">
            <span>Claude · 5h</span>
            <div className="status-meter-track">
              <div className="status-meter-fill meter-fill-62" />
            </div>
            <b>62%</b>
          </div>
          <div className="status-meter-row">
            <span>Codex · 7d</span>
            <div className="status-meter-track">
              <div className="status-meter-fill meter-fill-34" />
            </div>
            <b>34%</b>
          </div>
        </div>
        <div className="status-day-bars" aria-hidden="true">
          {USAGE_DAYS.map((day) => (
            <span key={day.id} className={`status-day-bar ${day.barClass}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

function GoalsSpotlightVisual({ language }: Localized) {
  const { t } = useSiteTranslation(language);
  const stages = [
    { id: "s1", label: t("spotlights.goalsStage1"), state: "is-complete" },
    { id: "s2", label: t("spotlights.goalsStage2"), state: "is-complete" },
    { id: "s3", label: t("spotlights.goalsStage3"), state: "is-complete" },
    { id: "s4", label: t("spotlights.goalsStage4"), state: "is-current" },
  ] as const;

  return (
    <div className="spotlight-visual spotlight-visual-goals" dir="ltr">
      <div className="spotlight-card-head">
        <span className="spotlight-chip">
          <GitBranch size={13} aria-hidden="true" />
          <span>worktree · feat/auth-refresh</span>
        </span>
        <span className="spotlight-sha-badge">sha: 8f31c0a</span>
      </div>
      <ol className="goals-pipeline">
        {stages.map((stage) => (
          <li key={stage.id} className={`goals-stage ${stage.state}`}>
            <span className="goals-stage-dot" aria-hidden="true" />
            <span>{stage.label}</span>
          </li>
        ))}
      </ol>
      <div className="goals-evidence-bar">
        <span className="goals-check-ok">
          <Check size={14} aria-hidden="true" />
          <span>{t("spotlights.goalsCheckPassed")}</span>
        </span>
        <span className="goals-land-chip">{t("spotlights.goalsLandAction")}</span>
      </div>
    </div>
  );
}

export function HighlightsShowcase({ language }: Localized) {
  const { t } = useSiteTranslation(language);

  return (
    <section className="section container highlights-section">
      <SectionHeading eyebrow={t("spotlights.eyebrow")} title={t("spotlights.title")}>
        {t("spotlights.body")}
      </SectionHeading>
      <div className="spotlights-stack">
        <article className="spotlight-row">
          <div className="spotlight-copy">
            <span className="micro-label">
              <AudioLines size={14} aria-hidden="true" />
              <span>{t("spotlights.voiceTag")}</span>
            </span>
            <h3>{t("spotlights.voiceTitle")}</h3>
            <p>{t("spotlights.voiceBody")}</p>
            <ul className="spotlight-points">
              <li>
                <Check size={15} aria-hidden="true" />
                <span>{t("spotlights.voicePoint1")}</span>
              </li>
              <li>
                <Check size={15} aria-hidden="true" />
                <span>{t("spotlights.voicePoint2")}</span>
              </li>
            </ul>
          </div>
          <VoiceSpotlightVisual language={language} />
        </article>

        <article className="spotlight-row is-reversed">
          <StatusSpotlightVisual language={language} />
          <div className="spotlight-copy">
            <span className="micro-label">
              <Smartphone size={14} aria-hidden="true" />
              <span>{t("spotlights.statusTag")}</span>
            </span>
            <h3>{t("spotlights.statusTitle")}</h3>
            <p>{t("spotlights.statusBody")}</p>
            <ul className="spotlight-points">
              <li>
                <Check size={15} aria-hidden="true" />
                <span>{t("spotlights.statusPoint1")}</span>
              </li>
              <li>
                <Check size={15} aria-hidden="true" />
                <span>{t("spotlights.statusPoint2")}</span>
              </li>
            </ul>
          </div>
        </article>

        <article className="spotlight-row">
          <div className="spotlight-copy">
            <span className="micro-label">
              <Target size={14} aria-hidden="true" />
              <span>{t("spotlights.goalsTag")}</span>
            </span>
            <h3>{t("spotlights.goalsTitle")}</h3>
            <p>{t("spotlights.goalsBody")}</p>
            <ul className="spotlight-points">
              <li>
                <Check size={15} aria-hidden="true" />
                <span>{t("spotlights.goalsPoint1")}</span>
              </li>
              <li>
                <Check size={15} aria-hidden="true" />
                <span>{t("spotlights.goalsPoint2")}</span>
              </li>
            </ul>
          </div>
          <GoalsSpotlightVisual language={language} />
        </article>
      </div>
    </section>
  );
}

export function EngineeringCapabilities({ language }: Localized) {
  const { t } = useSiteTranslation(language);
  return (
    <section className="section container capabilities-section">
      <SectionHeading eyebrow={t("capabilities.eyebrow")} title={t("capabilities.title")} />
      <div className="capabilities-grid">
        {CAPABILITIES.map(({ id, Icon, tagKey, titleKey, bodyKey }) => (
          <article key={id} className="capability-card">
            <div className="capability-head">
              <span className="capability-icon">
                <Icon size={18} aria-hidden="true" />
              </span>
              <span className="cap-tag">{t(tagKey)}</span>
            </div>
            <h3>{t(titleKey)}</h3>
            <p>{t(bodyKey)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
