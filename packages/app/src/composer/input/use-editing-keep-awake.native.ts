import { useCallback, useEffect, useId, useRef } from "react";
import { AppState } from "react-native";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useRetainedPanelActive } from "@/components/retained-panel";
import { useComposerKeyboardScope } from "@/composer/keyboard-scope";
import { useAppActivelyVisible } from "@/hooks/use-app-visible";
import { EditingKeepAwake } from "./editing-keep-awake";

interface InputKeepAwakeOptions {
  active: boolean;
  scope: "composer" | "input";
  idleTimeoutMs?: number | null;
}

function useInputKeepAwake({ active, scope, idleTimeoutMs }: InputKeepAwakeOptions): {
  recordActivity(): void;
  finish(): void;
} {
  const ownerId = useId();
  const generation = useRef(0);
  const controller = useRef<EditingKeepAwake | null>(null);
  const { isActiveComposer } = useComposerKeyboardScope();
  const panelActive = useRetainedPanelActive();
  const appActive = useAppActivelyVisible();
  const eligible = active && (scope === "input" || isActiveComposer) && panelActive && appActive;

  useEffect(() => {
    // Each effect lifetime owns a tag: a late cleanup cannot release another editor or voice.
    const mode = idleTimeoutMs === null ? "dictation" : "editing";
    const tag = `paseo-composer-${mode}:${ownerId}:${++generation.current}`;
    const current = new EditingKeepAwake(
      {
        activate: () => activateKeepAwakeAsync(tag),
        deactivate: () => deactivateKeepAwake(tag),
        subscribeToForeground: (listener) => {
          const subscription = AppState.addEventListener("change", (state) => {
            if (state === "active") listener();
          });
          return () => subscription.remove();
        },
        onError: (error) => console.warn("[Composer] Failed to update input keep-awake", error),
      },
      idleTimeoutMs,
    );
    controller.current = current;
    return () => {
      controller.current = null;
      void current.dispose();
    };
  }, [ownerId, idleTimeoutMs]);

  useEffect(() => {
    void controller.current?.setEligible(eligible);
  }, [eligible]);

  const recordActivity = useCallback(() => {
    void controller.current?.recordActivity();
  }, []);
  const finish = useCallback(() => {
    void controller.current?.finish();
  }, []);
  return { recordActivity, finish };
}

export function useEditingKeepAwake(focused: boolean, scope: "composer" | "input" = "composer") {
  return useInputKeepAwake({ active: focused, scope });
}

export function useDictationKeepAwake(active: boolean): void {
  // Recording can blur the editor, and silence or slow ASR can leave text unchanged.
  useInputKeepAwake({ active, scope: "composer", idleTimeoutMs: null });
}
