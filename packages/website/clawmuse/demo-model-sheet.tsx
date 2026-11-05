import { useCallback, useEffect, useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import { ArrowLeft, Brain, Check, ChevronRight, Search, Shield, X } from "lucide-react";
import { DemoProviderIcon } from "./demo-provider-icon";
import { demoModels, modelLabel, providerDefinition } from "./demo-models";
import appLabels from "./demo-app-labels.json";
import { isProvider, providers, type Provider } from "./demo-state";
import type { DemoSession } from "./demo-session";
import type { Language } from "./i18n/locales";

type SheetPage = "settings" | "models" | "thinking" | "mode";
interface Props {
  language: Language;
  demo: DemoSession;
}
function useModelSheet(demo: DemoSession) {
  const { configure } = demo;
  const [page, setPage] = useState<SheetPage>("settings");
  const [provider, setProvider] = useState<Provider | null>(null);
  const [query, setQuery] = useState("");
  const fixed = demo.messages.length > 0;
  const available = fixed ? [demo.provider] : providers;
  const definition = providerDefinition(demo.provider);
  const mode = definition?.modes.find(
    (item) => item.id === (demo.mode ?? definition.defaultModeId),
  );
  const changeQuery = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value),
    [],
  );
  const goBack = useCallback(() => {
    setQuery("");
    if (page === "models" && provider && !fixed) setProvider(null);
    else setPage("settings");
  }, [page, provider, fixed]);
  const openSetting = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const value = event.currentTarget.dataset.page;
      if (value === "models" || value === "thinking" || value === "mode") {
        setProvider(fixed ? demo.provider : null);
        setPage(value);
      }
    },
    [fixed, demo.provider],
  );
  const openProvider = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    const value = event.currentTarget.dataset.provider;
    if (isProvider(value)) setProvider(value);
  }, []);
  const select = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const {
        provider: selectedProvider,
        model,
        thinking,
        mode: selectedMode,
      } = event.currentTarget.dataset;
      if (isProvider(selectedProvider) && (model === "default" || model === "fast"))
        configure({ type: "modelSelect", provider: selectedProvider, model });
      if (thinking === "Low" || thinking === "Medium" || thinking === "High")
        configure({ type: "thinking", value: thinking });
      if (selectedMode) configure({ type: "mode", value: selectedMode });
      setPage("settings");
      setQuery("");
    },
    [configure],
  );
  return {
    page,
    provider,
    query,
    fixed,
    available,
    definition,
    mode,
    changeQuery,
    goBack,
    openSetting,
    openProvider,
    select,
  };
}
type Sheet = ReturnType<typeof useModelSheet>;
function sheetTitle(sheet: Sheet, labels: typeof appLabels.en) {
  if (sheet.page === "thinking") return labels.thinking;
  if (sheet.page === "mode") return labels.mode;
  if (sheet.page === "models" && sheet.provider) return sheet.provider;
  return labels.selectModel;
}
// DOM rendering of CompactModelSheet / AgentControlTrigger / ModelBrowser.
// The host owns the live catalogue; only the example model data is simulated.
export function DemoModelSheet({ language, demo }: Props) {
  const labels = appLabels[language];
  const sheet = useModelSheet(demo);
  const header = useRef<HTMLDivElement>(null);
  const interactive = demo.sheetInteractive;
  useEffect(() => {
    if (interactive) header.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [interactive, sheet.page]);
  const showSearch = sheet.page === "settings" || sheet.page === "models";
  const placeholder = sheet.fixed ? labels.searchModels : labels.searchAllModels;
  return (
    <>
      <div className="demo-sheet-header" ref={header}>
        {sheet.page !== "settings" && (
          <button type="button" onClick={sheet.goBack} aria-label={labels.back}>
            <ArrowLeft size={18} />
          </button>
        )}
        <h4>{sheetTitle(sheet, labels)}</h4>
        <button type="button" onClick={demo.closeSheet} aria-label={labels.close}>
          <X size={20} />
        </button>
      </div>
      {showSearch && (
        <label className="demo-model-search">
          <Search size={16} />
          <input
            aria-label={placeholder}
            placeholder={placeholder}
            value={sheet.query}
            onChange={sheet.changeQuery}
          />
        </label>
      )}
      <div className="demo-model-body">
        <SheetBody language={language} demo={demo} sheet={sheet} />
      </div>
    </>
  );
}
function SheetBody({ language, demo, sheet }: Props & { sheet: Sheet }) {
  const labels = appLabels[language];
  const searching = sheet.query.trim().length > 0;
  if (sheet.page === "settings" && !searching)
    return (
      <div className="demo-model-settings">
        <Setting
          kind="models"
          provider={demo.provider}
          label={labels.model}
          value={modelLabel(demo.provider, demo.model)}
          onClick={sheet.openSetting}
        />
        <div className="demo-model-settings-group">
          <Setting
            kind="thinking"
            label={labels.thinking}
            value={demo.thinking}
            onClick={sheet.openSetting}
          />
          {sheet.definition?.modes.length ? (
            <Setting
              kind="mode"
              label={labels.mode}
              value={sheet.mode?.label ?? sheet.definition.modes[0].label}
              onClick={sheet.openSetting}
            />
          ) : null}
        </div>
      </div>
    );
  if (sheet.page === "thinking")
    return (
      <div className="demo-model-options">
        {(["Low", "Medium", "High"] as const).map((value) => (
          <button
            key={value}
            type="button"
            data-thinking={value}
            aria-pressed={demo.thinking === value}
            onClick={sheet.select}
          >
            <Brain size={16} />
            <span>{value}</span>
            {demo.thinking === value && <Check size={16} />}
          </button>
        ))}
      </div>
    );
  if (sheet.page === "mode")
    return (
      <div className="demo-model-options">
        {sheet.definition?.modes.map((value) => (
          <button
            key={value.id}
            type="button"
            data-mode={value.id}
            aria-pressed={sheet.mode?.id === value.id}
            onClick={sheet.select}
          >
            <Shield size={16} />
            <span>
              {value.label}
              <small>{value.description}</small>
            </span>
            {sheet.mode?.id === value.id && <Check size={16} />}
          </button>
        ))}
      </div>
    );
  return <ModelRows language={language} demo={demo} sheet={sheet} />;
}
function ModelRows({ language, demo, sheet }: Props & { sheet: Sheet }) {
  const searching = sheet.query.trim().length > 0;
  if (sheet.page === "models" && !sheet.provider && !searching)
    return (
      <div className="demo-model-options">
        {sheet.available.map((item) => (
          <button type="button" key={item} data-provider={item} onClick={sheet.openProvider}>
            <DemoProviderIcon provider={item} size={16} />
            <span>{item}</span>
            <ChevronRight size={16} />
          </button>
        ))}
      </div>
    );
  const rows = sheet.available
    .flatMap((item) =>
      demoModels[item].map((label, index) => ({
        provider: item,
        label,
        model: index === 0 ? "default" : "fast",
      })),
    )
    .filter(
      (item) =>
        (!sheet.provider || sheet.page === "settings" || item.provider === sheet.provider) &&
        `${item.provider} ${item.label}`.toLowerCase().includes(sheet.query.trim().toLowerCase()),
    );
  return (
    <div className="demo-model-options">
      {rows.map((item) => (
        <button
          key={`${item.provider}-${item.model}`}
          type="button"
          data-provider={item.provider}
          data-model={item.model}
          aria-pressed={demo.provider === item.provider && demo.model === item.model}
          onClick={sheet.select}
        >
          <DemoProviderIcon provider={item.provider} size={16} />
          <span>{item.label}</span>
          {demo.provider === item.provider && demo.model === item.model && <Check size={16} />}
        </button>
      ))}
      {!rows.length && <p className="demo-model-empty">{appLabels[language].noMatches}</p>}
    </div>
  );
}
function Setting({
  kind,
  provider,
  label,
  value,
  onClick,
}: {
  kind: SheetPage;
  provider?: Provider;
  label: string;
  value: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const Icon = kind === "thinking" ? Brain : Shield;
  return (
    <button type="button" className="demo-model-setting" data-page={kind} onClick={onClick}>
      <span className="demo-setting-glyph">
        {provider ? <DemoProviderIcon provider={provider} size={16} /> : <Icon size={16} />}
      </span>
      <span className="demo-setting-label">{label}</span>
      <span className="demo-setting-value">{value}</span>
    </button>
  );
}
