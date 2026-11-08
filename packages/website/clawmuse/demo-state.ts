import { getTranslator, type TranslationKey } from "./i18n/i18n";
import type { Language } from "./i18n/locales";

export const scenes = [
  "chat",
  "voice",
  "files",
  "terminal",
  "browser",
  "hosts",
  "goals",
  "status",
] as const;
export type Scene = (typeof scenes)[number];
export type Device = "phone" | "desktop" | "linux";
export type Dictation = "idle" | "playing" | "paused";
export const providers = [
  "Claude Code",
  "Codex",
  "GitHub Copilot",
  "OpenCode",
  "Pi",
  "Antigravity",
  "Muse Code",
] as const;
export type Provider = (typeof providers)[number];
export interface DemoMessage {
  id: number;
  prompt: string;
  reply: string;
  provider: Provider;
  revealed: number;
  complete: boolean;
}
export interface DemoState {
  device: Device;
  preferredDevice: "phone" | "desktop";
  scene: Scene;
  draft: string;
  chatClosed: false | "closed" | "archived";
  dictation: Dictation;
  dictationIndex: number;
  dictationPrefix: string;
  voiceMode: boolean;
  voiceMuted: boolean;
  messages: DemoMessage[];
  host: string;
  fileIndex: number;
  goal: "suggested" | "running" | "review";
  goalElapsed: number;
  goalBudget: string;
  goalProvider: Provider;
  provider: Provider;
  model: "default" | "fast";
  thinking: "Low" | "Medium" | "High";
  mode: string | null;
  activityOpen: boolean;
  sidebarOpen: boolean;
  sheet: "models" | "tabs" | null;
  sheetInteractive: boolean;
  permission: "pending" | "approved" | "denied" | null;
  attachment: boolean;
  command: string;
  terminalLines: string[];
  previewLocale: "en" | "zh";
  previewPage: "home" | "about";
  previewReload: number;
  statusView: "activity" | "widget";
  playback: "playing" | "paused" | "manual" | "complete";
  step: number;
  elapsed: number;
  interactionRemaining: number;
}
export const initialState: DemoState = {
  device: "phone",
  preferredDevice: "phone",
  scene: "chat",
  draft: "",
  chatClosed: false,
  dictation: "idle",
  dictationIndex: 0,
  dictationPrefix: "",
  voiceMode: false,
  voiceMuted: false,
  messages: [],
  host: "MacBook Pro",
  fileIndex: 0,
  goal: "suggested",
  goalElapsed: 0,
  goalBudget: "3",
  goalProvider: "Codex",
  provider: "Claude Code",
  model: "default",
  thinking: "High",
  mode: null,
  activityOpen: false,
  sidebarOpen: false,
  sheet: null,
  sheetInteractive: false,
  permission: null,
  attachment: false,
  command: "",
  terminalLines: ["clawmuse.com · main", "$ pwd", "/Users/mo/Projects/clawmuse.com"],
  previewLocale: "en",
  previewPage: "home",
  previewReload: 0,
  statusView: "activity",
  playback: "playing",
  step: 0,
  elapsed: 0,
  interactionRemaining: 0,
};
export type DemoInteraction =
  | { type: "device"; device: Device }
  | { type: "scene"; scene: Scene }
  | { type: "draft" | "command"; text: string }
  | { type: "dictationTick"; prompt: string }
  | { type: "send"; reply: string }
  | { type: "file"; index: number }
  | { type: "host"; name: string }
  | { type: "provider" | "goalProvider"; provider: Provider }
  | { type: "modelSelect"; provider: Provider; model: DemoState["model"] }
  | { type: "thinking"; value: DemoState["thinking"] }
  | { type: "mode"; value: string }
  | { type: "goalBudget"; value: string }
  | { type: "sheet"; sheet: DemoState["sheet"] }
  | { type: "previewLocale"; locale: "en" | "zh" }
  | { type: "runCommand"; command?: string; help: string }
  | {
      type:
        | "dictationToggle"
        | "dictationStart"
        | "dictationFinish"
        | "voiceToggle"
        | "closeChat"
        | "archiveWorkspace"
        | "voiceClose"
        | "voiceMute"
        | "activityToggle"
        | "sidebarToggle"
        | "goalApprove"
        | "goalReview"
        | "stream"
        | "stop"
        | "permissionRequest"
        | "permissionApprove"
        | "permissionDeny"
        | "attachmentToggle"
        | "modelToggle"
        | "previewNavigate"
        | "previewReload"
        | "statusToggle";
    };
export type DemoAction =
  | DemoInteraction
  | { type: "tick"; tour: TourStep[]; prompt: string }
  | { type: "selectScene"; scene: Scene; tour: TourStep[] }
  | { type: "selectDevice"; device: Device }
  | { type: "interact"; action: DemoInteraction }
  | { type: "replay" | "playbackToggle" | "pausePlayback" | "reset" | "inspectSheet" };
export interface TourStep {
  scene: Scene;
  title: TranslationKey;
  duration: number;
  actions: DemoInteraction[];
  typing?: string;
  target?: string;
}

export function createTour(language: Language): TourStep[] {
  const t = getTranslator(language);
  return [
    { scene: "chat", title: "tour.cueWorkspace", duration: 2400, actions: [], target: "workspace" },
    {
      scene: "chat",
      title: "tour.cueModel",
      duration: 2800,
      actions: [{ type: "sheet", sheet: "models" }],
      target: "models",
    },
    {
      scene: "chat",
      title: "tour.cuePrompt",
      duration: 4200,
      actions: [{ type: "sheet", sheet: null }],
      typing: t("demo.task"),
      target: "composer",
    },
    {
      scene: "chat",
      title: "tour.cueStream",
      duration: 5200,
      actions: [{ type: "send", reply: t("demo.assistant") }],
      target: "conversation",
    },
    {
      scene: "chat",
      title: "tour.cuePermission",
      duration: 3600,
      actions: [{ type: "activityToggle" }, { type: "permissionRequest" }],
      target: "permission",
    },
    {
      scene: "chat",
      title: "tour.cueChanges",
      duration: 2200,
      actions: [{ type: "permissionApprove" }],
      target: "changes",
    },
    {
      scene: "files",
      title: "tour.filesBody",
      duration: 3600,
      actions: [{ type: "scene", scene: "files" }],
      target: "diff",
    },
    {
      scene: "files",
      title: "tour.filesBody",
      duration: 2800,
      actions: [{ type: "file", index: 2 }],
      target: "diff",
    },
    {
      scene: "terminal",
      title: "tour.terminalBody",
      duration: 4200,
      actions: [
        { type: "scene", scene: "terminal" },
        { type: "runCommand", command: "npm run check", help: "" },
      ],
      target: "terminal",
    },
    {
      scene: "browser",
      title: "tour.browserBody",
      duration: 4400,
      actions: [
        { type: "device", device: "desktop" },
        { type: "scene", scene: "browser" },
      ],
      target: "browser",
    },
    {
      scene: "browser",
      title: "tour.cuePreview",
      duration: 2800,
      actions: [{ type: "previewLocale", locale: "zh" }],
      target: "browser",
    },
    {
      scene: "voice",
      title: "tour.cueDictation",
      duration: 2600,
      actions: [
        { type: "device", device: "phone" },
        { type: "scene", scene: "voice" },
        { type: "dictationStart" },
      ],
      target: "composer",
    },
    {
      scene: "voice",
      title: "tour.cuePause",
      duration: 1600,
      actions: [{ type: "dictationToggle" }],
      target: "composer",
    },
    {
      scene: "voice",
      title: "tour.cueResume",
      duration: 3000,
      actions: [{ type: "dictationToggle" }],
      target: "composer",
    },
    {
      scene: "voice",
      title: "tour.cueVoice",
      duration: 4800,
      actions: [
        { type: "dictationFinish" },
        { type: "draft", text: t("tour.voicePrompt") },
        { type: "send", reply: t("tour.reply") },
        { type: "voiceToggle" },
      ],
      target: "composer",
    },
    {
      scene: "hosts",
      title: "tour.hostsBody",
      duration: 4200,
      actions: [
        { type: "voiceClose" },
        { type: "scene", scene: "hosts" },
        { type: "host", name: "Linux Server" },
      ],
      target: "hosts",
    },
    {
      scene: "goals",
      title: "tour.goalsBody",
      duration: 3200,
      actions: [{ type: "scene", scene: "goals" }],
      target: "goals",
    },
    {
      scene: "goals",
      title: "tour.cueGoal",
      duration: 4200,
      actions: [{ type: "goalApprove" }],
      target: "goals",
    },
    {
      scene: "status",
      title: "tour.statusBody",
      duration: 3800,
      actions: [{ type: "scene", scene: "status" }],
      target: "status",
    },
    {
      scene: "status",
      title: "tour.statusBody",
      duration: 3200,
      actions: [{ type: "statusToggle" }],
      target: "status",
    },
    {
      scene: "chat",
      title: "tour.cueFinish",
      duration: 3800,
      actions: [{ type: "scene", scene: "chat" }],
      target: "composer",
    },
  ];
}

function reduceNavigation(state: DemoState, action: DemoAction): DemoState | undefined {
  switch (action.type) {
    case "device":
      return {
        ...state,
        device: action.device,
        sheet: null,
        sheetInteractive: false,
        sidebarOpen: false,
      };
    case "scene":
      return {
        ...state,
        scene: action.scene,
        chatClosed:
          state.chatClosed === "closed" && (action.scene === "chat" || action.scene === "voice")
            ? false
            : state.chatClosed,
        sheet: null,
        sheetInteractive: false,
        sidebarOpen: false,
      };
    case "sheet":
      return { ...state, sheet: action.sheet, sheetInteractive: false };
    case "sidebarToggle":
      return { ...state, sidebarOpen: !state.sidebarOpen, sheet: null };
    case "file":
      return { ...state, fileIndex: action.index };
    case "host":
      return { ...state, host: action.name };
    case "activityToggle":
      return { ...state, activityOpen: !state.activityOpen };
    default:
      return undefined;
  }
}
function reduceModel(state: DemoState, action: DemoAction): DemoState | undefined {
  switch (action.type) {
    case "provider":
      return state.messages.length
        ? state
        : { ...state, provider: action.provider, sheet: null, model: "default", mode: null };
    case "modelSelect":
      if (state.messages.length && action.provider !== state.provider) return state;
      return {
        ...state,
        provider: action.provider,
        model: action.model,
        mode: action.provider === state.provider ? state.mode : null,
      };
    case "thinking":
      return { ...state, thinking: action.value };
    case "mode":
      return { ...state, mode: action.value };
    case "modelToggle":
      return { ...state, model: state.model === "default" ? "fast" : "default" };
    default:
      return undefined;
  }
}
function reduceConversation(state: DemoState, action: DemoAction): DemoState | undefined {
  switch (action.type) {
    case "closeChat":
    case "archiveWorkspace":
      return {
        ...state,
        chatClosed: action.type === "closeChat" ? "closed" : "archived",
        draft: "",
        dictation: "idle",
        voiceMode: false,
        messages:
          action.type === "archiveWorkspace" ? state.messages.map(stopMessage) : state.messages,
        sheet: null,
      };
    case "draft":
      return { ...state, draft: action.text };
    case "attachmentToggle":
      return { ...state, attachment: !state.attachment };
    case "send": {
      if (
        (!state.draft.trim() && !state.attachment) ||
        state.messages.some((message) => !message.complete) ||
        state.dictation !== "idle"
      )
        return state;
      const message: DemoMessage = {
        id: (state.messages.at(-1)?.id ?? 0) + 1,
        prompt: state.draft.trim() || "layout.png",
        reply: action.reply,
        provider: state.provider,
        revealed: 0,
        complete: false,
      };
      return {
        ...state,
        messages: [...state.messages, message],
        draft: "",
        scene: "chat",
        attachment: false,
      };
    }
    case "stream":
      return { ...state, messages: state.messages.map(revealMessage) };
    case "stop":
      return { ...state, messages: state.messages.map(stopMessage) };
    case "permissionRequest":
      return { ...state, permission: "pending" };
    case "permissionApprove":
      return { ...state, permission: "approved" };
    case "permissionDeny":
      return { ...state, permission: "denied" };
    default:
      return undefined;
  }
}
function revealMessage(message: DemoMessage): DemoMessage {
  if (message.complete) return message;
  const revealed = Math.min(message.reply.length, message.revealed + 3);
  return { ...message, revealed, complete: revealed === message.reply.length };
}
function stopMessage(message: DemoMessage): DemoMessage {
  return message.complete
    ? message
    : { ...message, reply: message.reply.slice(0, message.revealed), complete: true };
}
function reduceVoice(state: DemoState, action: DemoAction): DemoState | undefined {
  switch (action.type) {
    case "dictationStart":
      return state.dictation === "playing"
        ? state
        : reduceVoice(state, { type: "dictationToggle" });
    case "dictationToggle": {
      if (state.dictation === "playing") return { ...state, dictation: "paused" };
      if (state.dictation === "paused") return { ...state, dictation: "playing", scene: "voice" };
      const prefix = state.draft.trimEnd();
      return {
        ...state,
        dictation: "playing",
        scene: "voice",
        dictationIndex: 0,
        dictationPrefix: prefix ? `${prefix}\n` : "",
      };
    }
    case "dictationTick": {
      if (state.dictation !== "playing") return state;
      const index = Math.min(state.dictationIndex + 1, action.prompt.length);
      return {
        ...state,
        draft: state.dictationPrefix + action.prompt.slice(0, index),
        dictationIndex: index,
        dictation: index === action.prompt.length ? "idle" : "playing",
      };
    }
    case "dictationFinish":
      return { ...state, dictation: "idle" };
    case "voiceToggle":
      return { ...state, voiceMode: !state.voiceMode, scene: "voice" };
    case "voiceClose":
      return { ...state, voiceMode: false };
    case "voiceMute":
      return { ...state, voiceMuted: !state.voiceMuted };
    default:
      return undefined;
  }
}
function runCommand(state: DemoState, command: string, help: string): DemoState {
  const clean = command.trim();
  if (!clean) return state;
  if (clean === "clear") return { ...state, command: "", terminalLines: [] };
  const outputs: Record<string, string[]> = {
    pwd: ["/Users/mo/Projects/clawmuse.com"],
    "git status": [
      "On branch main",
      "Changes not staged for commit:",
      "  modified: src/i18n.ts",
      "  modified: src/LanguageSwitch.tsx",
      "  modified: src/styles.css",
    ],
    "npm run check": [
      "> tsc --noEmit && vitest run",
      "✓ i18n.test.ts (8 tests)",
      "✓ LanguageSwitch.test.tsx (4 tests)",
      "Test Files  2 passed (2)",
      "Tests       12 passed (12)",
    ],
    "npm run dev": ["VITE ready", "➜ Local: http://localhost:5173/"],
  };
  return {
    ...state,
    command: "",
    terminalLines: [...state.terminalLines.slice(-60), `$ ${clean}`, ...(outputs[clean] ?? [help])],
  };
}
function reducePanels(state: DemoState, action: DemoAction): DemoState | undefined {
  switch (action.type) {
    case "command":
      return { ...state, command: action.text };
    case "runCommand":
      return runCommand(state, action.command ?? state.command, action.help);
    case "previewLocale":
      return { ...state, previewLocale: action.locale };
    case "previewNavigate":
      return { ...state, previewPage: state.previewPage === "home" ? "about" : "home" };
    case "previewReload":
      return { ...state, previewReload: state.previewReload + 1 };
    case "statusToggle":
      return { ...state, statusView: state.statusView === "activity" ? "widget" : "activity" };
    case "goalApprove":
      return state.goal === "suggested" ? { ...state, goal: "running", goalElapsed: 0 } : state;
    case "goalReview":
      return state.goal === "running" ? { ...state, goal: "review" } : state;
    case "goalBudget":
      return { ...state, goalBudget: action.value };
    case "goalProvider":
      return { ...state, goalProvider: action.provider };
    default:
      return undefined;
  }
}
function applyActions(state: DemoState, step: TourStep): DemoState {
  return step.actions.reduce((current, action) => {
    // Keep an explicitly selected desktop view when the script returns from the browser.
    if (action.type === "device" && action.device === "phone") {
      return reduceInteraction(current, { ...action, device: current.preferredDevice });
    }
    if (action.type === "permissionApprove" && current.permission === "denied") return current;
    return reduceInteraction(current, action);
  }, state);
}
function selectScene(state: DemoState, scene: Scene, tour: TourStep[]): DemoState {
  const navigated = reduceInteraction(state, { type: "scene", scene });
  const alreadyPlaying =
    state.playback === "playing" && scene === state.scene && tour[state.step].scene === scene;
  if (alreadyPlaying) return navigated;
  const canPlay = state.playback === "playing" || state.playback === "complete";
  if (!canPlay) return navigated;
  const step = tour.findIndex((item) => item.scene === scene);
  if (step < 0) return navigated;
  // Jump to the selected chapter without resetting messages, settings or ongoing work.
  const selected = applyActions(navigated, tour[step]);
  return { ...selected, playback: "playing", step, elapsed: 0, interactionRemaining: 0 };
}
function interact(state: DemoState, action: DemoInteraction): DemoState {
  const editsTask = [
    "draft",
    "command",
    "send",
    "dictationToggle",
    "dictationFinish",
    "stop",
    "closeChat",
    "archiveWorkspace",
  ].includes(action.type);
  const ownsTask = editsTask || state.playback === "paused" || state.playback === "complete";
  const playback = ownsTask ? "manual" : state.playback;
  const dictation = action.type === "draft" ? "idle" : state.dictation;
  const current = { ...state, playback, dictation, interactionRemaining: 3000 };
  const updated = reduceInteraction(current, action);
  if (action.type === "sheet" && action.sheet !== null)
    return { ...updated, sheetInteractive: true };
  return updated;
}
function advanceTour(state: DemoState, tour: TourStep[]): DemoState {
  // Editing owns the task; a queued tour tick must not overwrite the visitor’s input.
  if (state.playback !== "playing" || state.device === "linux") return state;
  if (state.sheet !== null && state.sheetInteractive) return state;
  if (state.interactionRemaining > 0)
    return { ...state, interactionRemaining: state.interactionRemaining - 100 };
  const current = tour[state.step];
  const next = tour[state.step + 1];
  const elapsed = state.elapsed + 100;
  if (elapsed < current.duration) {
    const draft = current.typing?.slice(
      0,
      Math.ceil((elapsed / current.duration) * current.typing.length),
    );
    return { ...state, elapsed, ...(draft === undefined ? {} : { draft }) };
  }
  if (!next) return { ...state, playback: "complete", elapsed: current.duration };
  const finished = current.typing === undefined ? state : { ...state, draft: current.typing };
  return { ...applyActions(finished, next), step: state.step + 1, elapsed: 0 };
}
function reduceInteraction(state: DemoState, action: DemoAction): DemoState {
  return (
    reduceNavigation(state, action) ??
    reduceModel(state, action) ??
    reduceConversation(state, action) ??
    reduceVoice(state, action) ??
    reducePanels(state, action) ??
    state
  );
}
export function reduceDemo(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case "reset":
      return {
        ...initialState,
        device: state.device,
        preferredDevice: state.preferredDevice,
        playback: "manual",
      };
    case "replay":
      return { ...initialState };
    case "selectScene":
      return selectScene(state, action.scene, action.tour);
    case "selectDevice":
      return {
        ...reduceInteraction(state, { type: "device", device: action.device }),
        preferredDevice: action.device === "linux" ? state.preferredDevice : action.device,
      };
    case "interact":
      return interact(state, action.action);
    case "inspectSheet":
      return { ...state, sheetInteractive: state.sheet !== null, interactionRemaining: 3000 };
    case "playbackToggle": {
      if (state.playback === "manual" || state.playback === "complete") return { ...initialState };
      return { ...state, playback: state.playback === "playing" ? "paused" : "playing" };
    }
    case "pausePlayback":
      return state.playback === "playing" ? { ...state, playback: "paused" } : state;
    case "tick": {
      if (state.playback === "paused") return state;
      const pending = state.messages.some((message) => !message.complete);
      const messages = pending ? state.messages.map(revealMessage) : state.messages;
      let updated = { ...state, messages };
      updated = reduceVoice(updated, { type: "dictationTick", prompt: action.prompt }) ?? updated;
      if (updated.goal === "running") {
        updated = { ...updated, goalElapsed: updated.goalElapsed + 100 };
        if (updated.goalElapsed >= 1500) updated = { ...updated, goal: "review" };
      }
      return advanceTour(updated, action.tour);
    }
    default:
      return reduceInteraction(state, action);
  }
}
export function isScene(value: string | undefined): value is Scene {
  return scenes.some((scene) => scene === value);
}
export function isProvider(value: string | undefined): value is Provider {
  return providers.some((provider) => provider === value);
}
