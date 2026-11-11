import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type MouseEvent,
  type KeyboardEvent,
} from "react";
import { getTranslator } from "./i18n/i18n";
import type { Language } from "./i18n/locales";
import {
  createTour,
  initialState,
  isProvider,
  isScene,
  reduceDemo,
  type DemoInteraction,
  type DemoState,
} from "./demo-state";

export function useDemoSession(language: Language, preview = false) {
  const [state, dispatch] = useReducer(reduceDemo, initialState);
  const stageRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const tour = useMemo(
    () => (preview ? createTour(language).slice(0, 6) : createTour(language)),
    [language, preview],
  );
  const t = getTranslator(language);
  const prompt = t("tour.voicePrompt");
  const pending = state.messages.some((message) => !message.complete);
  const active =
    visible &&
    state.playback !== "paused" &&
    ((state.playback === "playing" && state.device !== "linux") ||
      pending ||
      state.dictation === "playing" ||
      state.goal === "running");
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      dispatch({ type: "pausePlayback" });
  }, []);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const device = stage.querySelector(".device-viewport") ?? stage;
    let inView = false;
    const update = () => setVisible(inView && !document.hidden);
    const observer = new IntersectionObserver(
      ([entry]) => {
        inView = entry.intersectionRatio >= 0.2;
        update();
      },
      { threshold: 0.2 },
    );
    observer.observe(device);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, [state.device]);
  useEffect(() => {
    if (!active) return;
    // Browsing never cancels simulated work. Editing owns the task while replies,
    // dictation and Goals keep using the same visibility-aware clock.
    const timer = window.setInterval(() => dispatch({ type: "tick", tour, prompt }), 100);
    return () => window.clearInterval(timer);
  }, [active, tour, prompt]);

  const interact = useCallback((action: DemoInteraction) => {
    dispatch({ type: "interact", action });
  }, []);
  const inspectSheet = useCallback(() => dispatch({ type: "inspectSheet" }), []);
  const navigateScene = useCallback(
    (scene: DemoState["scene"]) => dispatch({ type: "selectScene", scene, tour }),
    [tour],
  );
  const selectScene = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const scene = event.currentTarget.dataset.scene;
      if (isScene(scene)) navigateScene(scene);
    },
    [navigateScene],
  );
  const selectDevice = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    const device = event.currentTarget.dataset.device;
    if (device === "phone" || device === "desktop" || device === "linux")
      dispatch({ type: "selectDevice", device });
  }, []);
  const toggleDictation = useCallback(() => interact({ type: "dictationToggle" }), [interact]);
  const finishDictation = useCallback(() => interact({ type: "dictationFinish" }), [interact]);
  const changeDraft = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) =>
      interact({ type: "draft", text: event.target.value }),
    [interact],
  );
  const toggleVoice = useCallback(() => interact({ type: "voiceToggle" }), [interact]);
  const closeChat = useCallback(() => interact({ type: "closeChat" }), [interact]);
  const archiveWorkspace = useCallback(() => interact({ type: "archiveWorkspace" }), [interact]);
  const closeVoice = useCallback(() => interact({ type: "voiceClose" }), [interact]);
  const muteVoice = useCallback(() => interact({ type: "voiceMute" }), [interact]);
  const toggleActivity = useCallback(() => interact({ type: "activityToggle" }), [interact]);
  const toggleSidebar = useCallback(() => interact({ type: "sidebarToggle" }), [interact]);
  const openFiles = useCallback(() => navigateScene("files"), [navigateScene]);
  const openChat = useCallback(() => navigateScene("chat"), [navigateScene]);
  const openStatus = useCallback(() => navigateScene("status"), [navigateScene]);
  const sendSample = useCallback(() => {
    const translate = getTranslator(language);
    interact({ type: "draft", text: translate("tour.voicePrompt") });
    interact({ type: "send", reply: translate("tour.reply") });
  }, [interact, language]);
  const startQuickDictation = useCallback(() => {
    navigateScene("voice");
    interact({ type: "dictationToggle" });
  }, [interact, navigateScene]);
  const openDesktop = useCallback(() => dispatch({ type: "selectDevice", device: "desktop" }), []);
  const openModels = useCallback(() => interact({ type: "sheet", sheet: "models" }), [interact]);
  const openTabs = useCallback(() => interact({ type: "sheet", sheet: "tabs" }), [interact]);
  const closeSheet = useCallback(() => interact({ type: "sheet", sheet: null }), [interact]);
  const closeOnEscape = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        interact({ type: "sheet", sheet: null });
      }
    },
    [interact],
  );
  const selectFile = useCallback(
    (event: MouseEvent<HTMLButtonElement>) =>
      interact({ type: "file", index: Number(event.currentTarget.dataset.file) }),
    [interact],
  );
  const selectHost = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const name = event.currentTarget.dataset.host;
      if (name === "MacBook Pro" || name === "Linux Server") interact({ type: "host", name });
    },
    [interact],
  );
  const selectProvider = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const provider = event.currentTarget.dataset.provider;
      if (isProvider(provider)) interact({ type: "provider", provider });
    },
    [interact],
  );
  const changeGoalProvider = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const provider = event.target.value;
      if (isProvider(provider)) interact({ type: "goalProvider", provider });
    },
    [interact],
  );
  const changeGoalHost = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => interact({ type: "host", name: event.target.value }),
    [interact],
  );
  const changeGoalBudget = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) =>
      interact({ type: "goalBudget", value: event.target.value }),
    [interact],
  );
  const approveGoal = useCallback(() => interact({ type: "goalApprove" }), [interact]);
  const reset = useCallback(() => dispatch({ type: "reset" }), []);
  const replay = useCallback(() => dispatch({ type: "replay" }), []);
  const togglePlayback = useCallback(() => dispatch({ type: "playbackToggle" }), []);
  const send = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      interact({ type: "send", reply: getTranslator(language)("tour.reply") });
    },
    [language, interact],
  );
  const stop = useCallback(() => interact({ type: "stop" }), [interact]);
  const approvePermission = useCallback(() => interact({ type: "permissionApprove" }), [interact]);
  const denyPermission = useCallback(() => interact({ type: "permissionDeny" }), [interact]);
  const requestPermission = useCallback(() => interact({ type: "permissionRequest" }), [interact]);
  const toggleAttachment = useCallback(() => interact({ type: "attachmentToggle" }), [interact]);
  const toggleModel = useCallback(() => interact({ type: "modelToggle" }), [interact]);
  const changeCommand = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      interact({ type: "command", text: event.target.value }),
    [interact],
  );
  const runCommand = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      interact({ type: "runCommand", help: getTranslator(language)("tour.terminalHelp") });
    },
    [interact, language],
  );
  const runChecks = useCallback(
    () => interact({ type: "runCommand", command: "npm run check", help: "" }),
    [interact],
  );
  const selectPreviewLocale = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const locale = event.currentTarget.dataset.locale;
      if (locale === "en" || locale === "zh") interact({ type: "previewLocale", locale });
    },
    [interact],
  );
  const navigatePreview = useCallback(() => interact({ type: "previewNavigate" }), [interact]);
  const reloadPreview = useCallback(() => interact({ type: "previewReload" }), [interact]);
  const toggleStatus = useCallback(() => interact({ type: "statusToggle" }), [interact]);
  return {
    ...state,
    configure: interact,
    pending,
    stageRef,
    visible,
    currentStep: tour[state.step],
    stepCount: tour.length,
    selectScene,
    selectDevice,
    toggleDictation,
    finishDictation,
    changeDraft,
    toggleVoice,
    closeVoice,
    closeChat,
    archiveWorkspace,
    muteVoice,
    closeOnEscape,
    toggleActivity,
    toggleSidebar,
    openFiles,
    openChat,
    openStatus,
    sendSample,
    startQuickDictation,
    openDesktop,
    openModels,
    openTabs,
    closeSheet,
    selectFile,
    selectHost,
    selectProvider,
    changeGoalProvider,
    changeGoalHost,
    changeGoalBudget,
    approveGoal,
    reset,
    replay,
    togglePlayback,
    inspectSheet,
    send,
    stop,
    approvePermission,
    denyPermission,
    requestPermission,
    toggleAttachment,
    toggleModel,
    changeCommand,
    runCommand,
    runChecks,
    selectPreviewLocale,
    navigatePreview,
    reloadPreview,
    toggleStatus,
  };
}
export type DemoSession = ReturnType<typeof useDemoSession>;
