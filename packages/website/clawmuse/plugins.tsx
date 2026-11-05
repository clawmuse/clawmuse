import {
  ArrowDown,
  ArrowRight,
  Check,
  Gauge,
  Languages,
  Lightbulb,
  RotateCw,
  Smartphone,
} from "lucide-react";
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
          <div className="plugin-included">
            <Check size={15} />
            {copy.included}
          </div>
        </div>
        <nav className="plugin-hero-index" aria-label={copy.explore}>
          {officialPluginIds.map((id, index) => {
            const Icon = icons[id];
            return (
              <a href={`#${id}`} key={id}>
                <span className="plugin-card-number">0{index + 1}</span>
                <Icon size={22} aria-hidden="true" />
                <span>
                  <strong>{copy.plugins[id].name}</strong>
                  <small>{copy.plugins[id].tagline}</small>
                </span>
                <ArrowDown size={16} aria-hidden="true" />
              </a>
            );
          })}
        </nav>
      </section>
      <div className="container plugin-stories" id="official-plugins">
        {officialPluginIds.map((id, index) => {
          const story = copy.plugins[id];
          const Icon = icons[id];
          return (
            <section className="plugin-story" id={id} key={id} aria-labelledby={`${id}-title`}>
              <div className="plugin-story-copy">
                <div className="plugin-story-meta">
                  <span>0{index + 1}</span>
                  <Icon size={21} aria-hidden="true" />
                  <h2 id={`${id}-title`}>{story.name}</h2>
                </div>
                <span className="plugin-default">
                  {story.enabledByDefault ? copy.defaultOn : copy.defaultOff}
                </span>
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
              </div>
              {id === "device-preview" ? (
                <DevicePreviewInstall language={language} />
              ) : (
                <PluginIllustration id={id} language={language} />
              )}
            </section>
          );
        })}
      </div>
      <section className="container section plugin-setup" id="get-started">
        <SectionHeading eyebrow={copy.included} title={copy.setupTitle}>
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

function PluginIllustration({ id, language }: Localized & { id: OfficialPluginId }) {
  const copy = pluginsCopy(language);
  const demo = copy.demo;
  return (
    <figure className={`plugin-illustration plugin-illustration--${id}`}>
      <figcaption>
        <span className="plugin-window-dots" aria-hidden="true">
          ● ● ●
        </span>
        {copy.plugins[id].name}
      </figcaption>
      {id === "conversation-translation" && (
        <div className="plugin-demo-body plugin-translation-demo">
          <span className="plugin-demo-label">{demo.yourInput}</span>
          <p>{demo.input}</p>
          <ArrowDown size={19} aria-hidden="true" />
          <span className="plugin-demo-label">{demo.sent}</span>
          <p lang="en">{demo.english}</p>
          <div className="plugin-demo-reply">
            <strong>ClawMuse</strong>
            <p>{demo.reply}</p>
            <details>
              <summary>{demo.original}</summary>
              <p lang="en">The layout is updated, with the existing colors preserved.</p>
            </details>
          </div>
        </div>
      )}
      {id === "capacity-retry" && (
        <div className="plugin-demo-body plugin-retry-demo">
          <div className="plugin-capacity-error">
            <RotateCw size={22} />
            <strong>{demo.retryStatus}</strong>
          </div>
          <p lang="en">Selected model is at capacity.</p>
          <ol>
            <li>
              <span>1</span>
              {demo.retryNext}
            </li>
            <li>
              <span>2</span>
              {demo.retryDone}
            </li>
          </ol>
          <div className="plugin-demo-continuation">
            <ArrowRight size={16} />
            <span>
              {language === "zh-CN"
                ? "请继续完成上一条任务。"
                : "Please continue the previous task."}
            </span>
          </div>
        </div>
      )}
      {id === "usage-display" && (
        <div className="plugin-demo-body plugin-usage-demo">
          <Gauge size={30} aria-hidden="true" />
          <p>{demo.quota}</p>
          <strong className="plugin-demo-balance">
            68<span>%</span>
          </strong>
          <div className="plugin-meter" role="img" aria-label={`${demo.quota}: 68%`}>
            <span />
          </div>
          <p className="plugin-demo-label">{demo.reset}</p>
          <div className="plugin-demo-cost">
            <span>{demo.cost}</span>
            <strong>$0.12</strong>
          </div>
        </div>
      )}
      {id === "prompt-prediction" && (
        <div className="plugin-demo-body plugin-prediction-demo">
          <div className="plugin-demo-completed">
            <Check size={18} />
            <span>{demo.completed}</span>
          </div>
          <div className="plugin-demo-draft">
            <span className="plugin-demo-label">
              <Lightbulb size={16} />
              {demo.suggestion}
            </span>
            <p>{demo.draft}</p>
          </div>
          <div className="plugin-demo-confirm">
            <span>{demo.confirm}</span>
            <ArrowRight size={19} />
          </div>
        </div>
      )}
    </figure>
  );
}

function DevicePreviewInstall({ language }: Localized) {
  const entry = release.plugins.find((item) => item.id === "clawmuse/device-preview");
  if (!entry) throw new Error("Missing pinned device-preview release");
  const artifact = entry.artifact;
  const source = `git:${artifact.remote}:${artifact.pluginPath}`;
  const chinese = language === "zh-CN";
  return (
    <div className="plugin-install">
      <h3>{chinese ? "无需更新 App，独立安装" : "Install without updating the app"}</h3>
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
      <figure>
        <img
          src="/registry/media/device-preview.png"
          alt={chinese ? "设备预览面板" : "Device preview panel"}
          loading="lazy"
          width="800"
          height="800"
        />
      </figure>
    </div>
  );
}
