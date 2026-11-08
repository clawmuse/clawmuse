import {
  ArrowDown,
  ArrowUp,
  AudioLines,
  Check,
  ChevronRight,
  FileCode2,
  Gauge,
  Languages,
  Lightbulb,
  Mic,
  Plus,
  RotateCw,
  Smartphone,
  Sparkles,
  X,
} from "lucide-react";
import { ClaudeIcon, CodexIcon } from "./demo-provider-icon";
import { officialPluginIds, pluginsCopy, type OfficialPluginId } from "./plugins-content";
import release from "./public/registry/index.json";
import { CodeBlock, FAQ, PageLink, SectionHeading, type Localized } from "./ui";

const icons = {
  "device-preview": Smartphone,
  "conversation-translation": Languages,
  "capacity-retry": RotateCw,
  "usage-display": Gauge,
  "prompt-prediction": Lightbulb,
};

export function OfficialPlugins({ language }: Localized) {
  const copy = pluginsCopy(language);
  const chinese = language === "zh-CN";
  return (
    <div className="official-plugins-page">
      <section className="container plugin-hero">
        <div className="plugin-hero-copy">
          <span className="eyebrow">{copy.eyebrow}</span>
          <h1>{copy.headline}</h1>
          <p>{copy.intro}</p>
          <div className="hero-actions">
            <PageLink page="/download" language={language} className="button primary">
              {copy.download}
            </PageLink>
            <a href="#official-plugins" className="button ghost">
              {copy.explore}
              <ArrowDown size={16} />
            </a>
          </div>
        </div>
        <PluginHeroIndex language={language} chinese={chinese} />
      </section>
      <div className="container plugin-stories" id="official-plugins">
        {officialPluginIds.map((id, index) => (
          <PluginStoryCard key={id} id={id} index={index} language={language} />
        ))}
      </div>
      <section className="container section plugin-setup" id="get-started">
        <SectionHeading eyebrow={copy.eyebrow} title={copy.setupTitle}>
          {copy.setupIntro}
        </SectionHeading>
        <ol>
          {copy.steps.map(([title, body], index) => (
            <li key={title}>
              <span>0{index + 1}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </li>
          ))}
        </ol>
        <PageLink page="/download" language={language} className="button primary">
          {copy.download}
        </PageLink>
      </section>
      <section className="container section plugin-faq">
        <h2>{copy.faqTitle}</h2>
        <FAQ items={copy.faq} />
      </section>
    </div>
  );
}

function indexBadgeLabel(
  id: OfficialPluginId,
  enabledByDefault: boolean,
  defaultOn: string,
  chinese: boolean,
) {
  if (id === "device-preview") return chinese ? "独立安装" : "Standalone";
  if (enabledByDefault) return defaultOn;
  return chinese ? "按需开启" : "Opt-in";
}

function PluginHeroIndex({ language, chinese }: Localized & { chinese: boolean }) {
  const copy = pluginsCopy(language);
  return (
    <nav className="plugin-hero-index" aria-label={copy.explore}>
      {officialPluginIds.map((id, index) => {
        const Icon = icons[id];
        const story = copy.plugins[id];
        const badge = indexBadgeLabel(id, story.enabledByDefault, copy.defaultOn, chinese);
        return (
          <a href={`#${id}`} key={id}>
            <span className="plugin-card-number">0{index + 1}</span>
            <Icon size={22} aria-hidden="true" />
            <span>
              <strong>
                {story.name}
                <em className={story.enabledByDefault ? "is-on" : ""}>{badge}</em>
              </strong>
              <small>{story.tagline}</small>
            </span>
            <ArrowDown size={16} aria-hidden="true" />
          </a>
        );
      })}
    </nav>
  );
}

function PluginStoryCard({
  id,
  index,
  language,
}: Localized & { id: OfficialPluginId; index: number }) {
  const copy = pluginsCopy(language);
  const story = copy.plugins[id];
  const Icon = icons[id];
  return (
    <section className="plugin-story" id={id} aria-labelledby={`${id}-title`}>
      <div className="plugin-story-copy">
        <div className="plugin-story-meta">
          <span>0{index + 1}</span>
          <Icon size={21} aria-hidden="true" />
          <h2 id={`${id}-title`}>{story.name}</h2>
          <span className={`plugin-default ${story.enabledByDefault ? "is-on" : ""}`}>
            {story.enabledByDefault ? copy.defaultOn : copy.defaultOff}
          </span>
        </div>
        <h3>{story.tagline}</h3>
        <p>{story.description}</p>
        {story.benefits.length > 0 && (
          <ul>
            {story.benefits.map((benefit) => (
              <li key={benefit}>
                <Check size={15} aria-hidden="true" />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="plugin-requirement">{story.requirement}</p>
        {id === "device-preview" && <DevicePreviewInstall language={language} />}
      </div>
      <PluginIllustration id={id} language={language} />
    </section>
  );
}

function PluginIllustration({ id, language }: Localized & { id: OfficialPluginId }) {
  const copy = pluginsCopy(language);
  const chinese = language === "zh-CN";
  const surfaceLocation = {
    "device-preview": chinese
      ? "工作区右侧面板 · 设备预览"
      : "Workspace right panel · Device preview",
    "conversation-translation": chinese
      ? "会话时间线 · 双语对照"
      : "Conversation timeline · Bilingual view",
    "capacity-retry": chinese ? "会话时间线 + 插件设置" : "Conversation timeline + Plugin settings",
    "usage-display": chinese ? "会话输入区底部" : "Below composer",
    "prompt-prediction": chinese ? "会话输入框顶部" : "Inside composer frame",
  }[id];

  return (
    <figure className={`plugin-illustration plugin-illustration--${id}`}>
      <figcaption>
        <span className="plugin-window-title">
          <span className="plugin-window-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <strong>{copy.plugins[id].name}</strong>
        </span>
        <span className="plugin-window-badge">{surfaceLocation}</span>
      </figcaption>
      {id === "device-preview" && <DevicePreviewDemo chinese={chinese} />}
      {id === "conversation-translation" && (
        <TranslationDemo language={language} chinese={chinese} />
      )}
      {id === "capacity-retry" && <CapacityRetryDemo language={language} chinese={chinese} />}
      {id === "usage-display" && <UsageDisplayDemo language={language} chinese={chinese} />}
      {id === "prompt-prediction" && <PromptPredictionDemo language={language} chinese={chinese} />}
    </figure>
  );
}

function DevicePreviewDemo({ chinese }: { chinese: boolean }) {
  return (
    <div className="plugin-demo-body plugin-app-surface plugin-device-preview-ui">
      <div className="dp-panel-head">
        <strong>{chinese ? "设备预览 · MacBook Pro" : "Device preview · MacBook Pro"}</strong>
        <p>
          {chinese
            ? "模拟器始终运行在此主机；手机只接收截图。约每秒 1 张。"
            : "Simulator runs on this host; your phone receives live frames (~1 fps)."}
        </p>
      </div>
      <div className="dp-button-row" role="group" aria-label="Platform">
        <span className="dp-btn is-active">Android</span>
        <span className="dp-btn">iOS</span>
        <span className="dp-btn">{chinese ? "刷新设备" : "Refresh devices"}</span>
        <span className="dp-btn">{chinese ? "停止预览" : "Stop preview"}</span>
      </div>
      <div className="dp-button-row" role="group" aria-label="Hardware buttons">
        <span className="dp-btn">{chinese ? "返回" : "Back"}</span>
        <span className="dp-btn">Home</span>
        <span className="dp-btn">{chinese ? "最近任务" : "Recents"}</span>
        <span className="dp-btn">{chinese ? "旋转" : "Rotate"}</span>
        <span className="dp-btn">{chinese ? "深色" : "Dark"}</span>
        <span className="dp-btn">{chinese ? "浅色" : "Light"}</span>
      </div>
      <div className="dp-status-line">
        <span className="dp-live-dot" aria-hidden="true" />
        <span>{chinese ? "已连接 · Pixel 8 API 35" : "Connected · Pixel 8 API 35"}</span>
        <small>1080 × 2400</small>
      </div>
      <SimulatorViewport chinese={chinese} />
      <p className="dp-footnote">
        {chinese
          ? "Android：单指点击和滑动；停止预览不会关闭模拟器。"
          : "Android: single-finger tap and swipe. Stopping preview leaves the simulator running."}
      </p>
    </div>
  );
}

function SimulatorViewport({ chinese }: { chinese: boolean }) {
  return (
    <div className="dp-viewer-stage">
      <div className="dp-simulator-frame" dir="ltr">
        <div className="dp-sim-statusbar">
          <span>9:41</span>
          <span className="dp-sim-camera" />
          <span>5G · 100%</span>
        </div>
        <div className="dp-sim-app">
          <div className="dp-sim-nav">
            <span className="dp-sim-chip">localhost:5173</span>
            <span className="dp-sim-badge">Live</span>
          </div>
          <div className="dp-sim-card">
            <small>src/screens/login.tsx</small>
            <strong>{chinese ? "欢迎回到 ClawMuse" : "Welcome back to ClawMuse"}</strong>
            <div className="dp-sim-field">name@domain.com</div>
            <div className="dp-sim-cta">
              <span>{chinese ? "继续登录" : "Continue"}</span>
              <span className="dp-touch-point" aria-hidden="true" />
            </div>
          </div>
        </div>
        <div className="dp-sim-homebar">
          <span />
        </div>
      </div>
    </div>
  );
}

function TranslationDemo({ language, chinese }: Localized & { chinese: boolean }) {
  const demo = pluginsCopy(language).demo;
  return (
    <div className="plugin-demo-body plugin-app-surface plugin-translation-demo">
      <div className="app-chat-turn">
        <div className="app-user-bubble">{demo.input}</div>
        <div className="app-translation-card">
          <div className="app-translation-row">
            <span className="app-translation-label">{chinese ? "原文" : "Original"}</span>
            <span className="app-translation-pill">{chinese ? "发送的英文" : "Sent English"}</span>
          </div>
          <p className="app-translation-english" lang="en">
            {demo.english}
          </p>
        </div>
      </div>
      <div className="plugin-demo-reply">
        <div className="app-assistant-head">
          <ClaudeIcon size={14} />
          <strong>Claude Code</strong>
          <span>Sonnet 4.6</span>
        </div>
        <p className="app-assistant-text">{demo.reply}</p>
        <div className="app-file-pill" dir="ltr">
          <FileCode2 size={14} />
          <code>src/screens/login.tsx</code>
          <b>
            +18 <em>−4</em>
          </b>
        </div>
        <details>
          <summary>
            <span className="app-translation-label">{chinese ? "原文" : "Original"}</span>
            <span className="app-translation-pill">{demo.original}</span>
          </summary>
          <p lang="en">The layout is updated, with the existing colors preserved.</p>
        </details>
      </div>
      <div className="app-settings-strip">
        <span>{chinese ? "翻译工具与模型" : "Translation provider & model"}</span>
        <div className="app-settings-pills" dir="ltr">
          <span className="is-selected">
            <ClaudeIcon size={12} /> Claude Code
          </span>
          <span className="is-selected">claude-haiku-4-5</span>
          <span className="is-verified">
            <Check size={12} /> {chinese ? "测试通过" : "Verified"}
          </span>
        </div>
      </div>
    </div>
  );
}

function CapacityRetryDemo({ language, chinese }: Localized & { chinese: boolean }) {
  const copy = pluginsCopy(language);
  return (
    <div className="plugin-demo-body plugin-app-surface plugin-retry-demo">
      <div className="app-timeline-events">
        <div className="app-error-banner" dir="ltr">
          <span className="app-error-dot" />
          <code>Selected model is at capacity. Please try again.</code>
        </div>
        <div className="app-daemon-notice">
          <RotateCw size={14} />
          <span>
            {chinese
              ? "模型满载，30 秒后自动重试（1/3）。"
              : "Model at capacity. Retrying in 30s (1/3)."}
          </span>
        </div>
        <div className="app-user-bubble is-compact">
          {chinese ? "请继续完成上一条任务。" : "Please continue the previous task."}
        </div>
        <div className="app-daemon-notice is-done">
          <Check size={14} />
          <span>
            {chinese
              ? "容量重试已结束（已重试 1 次），请查看本轮结果。"
              : "Capacity retry finished (retried once). Check the latest turn."}
          </span>
        </div>
      </div>
      <div className="app-settings-card">
        <div className="app-settings-card-head">
          <strong>{copy.plugins["capacity-retry"].name}</strong>
          <span>{chinese ? "主机插件设置" : "Host plugin settings"}</span>
        </div>
        <div className="app-settings-row">
          <div>
            <strong>{chinese ? "最多重试次数" : "Max retries"}</strong>
            <small>
              {chinese
                ? "每次满载报错最多自动继续的次数（1–10）"
                : "Maximum automatic continuations per error (1–10)"}
            </small>
          </div>
          <span className="app-settings-input" dir="ltr">
            3
          </span>
        </div>
        <div className="app-settings-row">
          <div>
            <strong>{chinese ? "重试间隔（秒）" : "Retry delay (seconds)"}</strong>
            <small>
              {chinese
                ? "每次自动继续前等待的秒数（5–300）"
                : "Seconds to wait before continuing (5–300)"}
            </small>
          </div>
          <span className="app-settings-input" dir="ltr">
            30
          </span>
        </div>
        <div className="app-settings-row">
          <div>
            <strong>{chinese ? "应用设置" : "Apply settings"}</strong>
            <small>{chinese ? "已保存当前设置" : "Current settings saved"}</small>
          </div>
          <span className="app-settings-btn">{chinese ? "保存" : "Save"}</span>
        </div>
      </div>
    </div>
  );
}

function UsageDisplayDemo({ language, chinese }: Localized & { chinese: boolean }) {
  const demo = pluginsCopy(language).demo;
  return (
    <div className="plugin-demo-body plugin-app-surface plugin-usage-demo">
      <div className="app-quota-card">
        <div className="app-quota-head">
          <span>
            <ClaudeIcon size={14} /> Claude Code · Claude Max
          </span>
          <small>{chinese ? "已连接" : "Connected"}</small>
        </div>
        <div className="app-quota-window">
          <div>
            <span>{chinese ? "5 小时窗口" : "5-hour window"}</span>
            <strong>
              {chinese ? "剩余 68% · 2小时14分后重置" : "68% left · resets in 2h 14m"}
            </strong>
          </div>
          <div className="plugin-meter is-68" role="img" aria-label={`${demo.quota}: 68%`}>
            <span />
          </div>
        </div>
        <div className="app-quota-window">
          <div>
            <span>{chinese ? "7 天窗口" : "7-day window"}</span>
            <strong>{chinese ? "剩余 42% · 4天后重置" : "42% left · resets in 4d"}</strong>
          </div>
          <div className="plugin-meter is-42">
            <span />
          </div>
        </div>
      </div>
      <div className="app-composer-dock">
        <div className="app-composer-frame">
          <div className="app-composer-placeholder">{chinese ? "消息" : "Message"}</div>
          <ComposerToolbar provider="claude" mode="voice" />
        </div>
        <div className="app-usage-strip" data-testid="agent-usage-strip">
          <span>{chinese ? "5小时 剩余 68% · 2小时14分后重置" : "5h 68% left · 2h 14m"}</span>
          <span>{chinese ? "7天 剩余 42% · 4天后重置" : "7d 42% left · 4d"}</span>
          <strong>{chinese ? "本次任务 $0.12" : "Task $0.12"}</strong>
        </div>
      </div>
    </div>
  );
}

function PromptPredictionDemo({ language, chinese }: Localized & { chinese: boolean }) {
  const demo = pluginsCopy(language).demo;
  return (
    <div className="plugin-demo-body plugin-app-surface plugin-prediction-demo">
      <div className="app-completed-turn">
        <div className="app-assistant-head">
          <CodexIcon size={14} />
          <strong>Codex</strong>
          <span>gpt-5.3-codex · High</span>
        </div>
        <p className="app-assistant-text">
          {chinese
            ? "已完成登录页布局调整，保留了现有深海薄荷配色。"
            : "Updated the login layout and preserved the existing mint palette."}
        </p>
        <div className="app-file-pill" dir="ltr">
          <FileCode2 size={14} />
          <code>src/screens/login.tsx</code>
          <b>
            +24 <em>−6</em>
          </b>
          <ChevronRight size={14} />
        </div>
      </div>
      <div className="app-composer-dock">
        <div className="app-composer-frame has-suggestion">
          <div className="app-prompt-suggestion">
            <div className="app-suggestion-action">
              <Sparkles size={14} />
              <span className="app-suggestion-text">
                {demo.draft}
                <kbd>⇥</kbd>
              </span>
            </div>
            <span
              className="app-suggestion-dismiss"
              aria-label={chinese ? "移除建议" : "Dismiss suggestion"}
            >
              <X size={14} />
            </span>
          </div>
          <div className="app-composer-placeholder">{chinese ? "消息" : "Message"}</div>
          <ComposerToolbar provider="codex" mode="send" />
        </div>
        <div className="app-prediction-hint">
          <span>{demo.suggestion}</span>
          <span>{demo.confirm}</span>
        </div>
      </div>
    </div>
  );
}

function ComposerToolbar({
  provider,
  mode,
}: {
  provider: "claude" | "codex";
  mode: "voice" | "send";
}) {
  return (
    <div className="app-composer-toolbar" dir="ltr">
      <div className="app-composer-left">
        <span className="app-icon-circle">
          <Plus size={16} strokeWidth={2.2} />
        </span>
        <span className="app-model-pill">
          {provider === "claude" ? <ClaudeIcon size={14} /> : <CodexIcon size={14} />}
          <span>{provider === "claude" ? "Sonnet 4.6" : "gpt-5.3-codex"}</span>
          <em>High</em>
        </span>
      </div>
      <div className="app-composer-right">
        <span className="app-context-ring" aria-hidden="true" />
        <span className="app-icon-circle">
          <Mic size={16} strokeWidth={2.2} />
        </span>
        <span className="app-send-circle">
          {mode === "voice" ? (
            <AudioLines size={15} strokeWidth={2.3} />
          ) : (
            <ArrowUp size={15} strokeWidth={2.4} />
          )}
        </span>
      </div>
    </div>
  );
}

function DevicePreviewInstall({ language }: Localized) {
  const entry = release.plugins.find((item) => item.id === "clawmuse/device-preview");
  if (!entry) throw new Error("Missing pinned device-preview release");
  const artifact = entry.artifact;
  const source = `git:${artifact.remote}:${artifact.pluginPath}`;
  const chinese = language === "zh-CN";
  return (
    <details className="plugin-install">
      <summary>
        <span className="plugin-install-tag">CLI</span>
        <span>
          {chinese
            ? "命令行独立安装与固定版本更新（无需重装 App）"
            : "Standalone CLI install & pinned updates (without reinstalling the app)"}
        </span>
        <ChevronRight size={15} aria-hidden="true" />
      </summary>
      <div className="plugin-install-body">
        <CodeBlock
          language={language}
          caption={chinese ? "安装目录中的固定版本" : "Install the pinned version"}
          code={`paseo plugin install ${source} --ref ${artifact.commit} --id clawmuse-device-preview`}
        />
        <CodeBlock
          language={language}
          caption={chinese ? "独立更新插件" : "Update the plugin independently"}
          code={`paseo plugin update clawmuse-device-preview --ref ${artifact.commit}`}
        />
        <p>
          {chinese
            ? "安装后，从 Command Center 打开「设备预览」，或在「设置 → 主机 → 插件 → 从来源安装」中配置。"
            : "After installation, open Device preview from Command Center, or configure it under Settings → Hosts → Plugins → Install from source."}
        </p>
        <a
          className="text-link"
          href="https://github.com/endvin/clawmuse-plugins/tree/main/device-preview"
          target="_blank"
          rel="noreferrer"
        >
          {chinese ? "查看公开源码与说明" : "View source and documentation"}
        </a>
      </div>
    </details>
  );
}
