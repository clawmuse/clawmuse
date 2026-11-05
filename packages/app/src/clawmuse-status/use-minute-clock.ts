import { useEffect, useState } from "react";
import { subscribeToRelativeTimeTick } from "@/utils/relative-time-ticker";

/**
 * Wall-clock now, refreshed on the shared minute tier. The elapsed-time marker
 * and the reset countdown move once a minute at most, so they ride the clock
 * the sidebar timestamps already run instead of starting another timer.
 */
export function useMinuteClock(enabled: boolean): number {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    setNow(Date.now());
    return subscribeToRelativeTimeTick("minute", () => setNow(Date.now()));
  }, [enabled]);

  return now;
}
