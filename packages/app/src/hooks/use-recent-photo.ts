import { useMemo } from "react";
import { type UseRecentPhotoResult } from "@/hooks/recent-photo";

const HIDDEN_ROW = { state: "hidden" } as const;

// Android uses the system Photo Picker; iOS alone offers a photo-library shortcut.
export function useRecentPhoto(): UseRecentPhotoResult {
  return useMemo(
    () => ({
      row: HIDDEN_ROW,
      takeRecentPhoto: async () => null,
    }),
    [],
  );
}
