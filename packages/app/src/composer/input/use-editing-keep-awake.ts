const controls = {
  recordActivity: () => {},
  finish: () => {},
};

export function useEditingKeepAwake(
  _focused: boolean,
  _scope: "composer" | "input" = "composer",
): typeof controls {
  return controls;
}

export function useDictationKeepAwake(_active: boolean): void {}
