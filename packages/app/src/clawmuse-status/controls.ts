/**
 * The actions the settings screen can trigger on the feature root. Registered
 * by the root while it is mounted; absent everywhere the root returns null.
 */
export interface ClawMuseStatusControls {
  /** Bind every eligible host and refresh the summary. */
  synchronize: () => Promise<void>;
  unbindHost: (serverId: string) => Promise<void>;
  /** Ends the current capsule and asks the service to plan a fresh start. */
  recreateLiveActivity: () => Promise<void>;
}

let controls: ClawMuseStatusControls | null = null;

export function registerClawMuseStatusControls(next: ClawMuseStatusControls): () => void {
  controls = next;
  return () => {
    if (controls === next) {
      controls = null;
    }
  };
}

export function getClawMuseStatusControls(): ClawMuseStatusControls | null {
  return controls;
}
