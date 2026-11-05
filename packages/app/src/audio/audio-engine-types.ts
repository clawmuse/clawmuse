export interface AudioEngineCallbacks {
  onCaptureData(pcm: Uint8Array): void;
  onVolumeLevel(level: number): void;
  onInterruption?(): void;
  onCaptureAvailabilityChange?(available: boolean): void;
  onError?(error: Error): void;
}

export interface AudioPlaybackSource {
  arrayBuffer(): Promise<ArrayBuffer>;
  size: number;
  type: string;
}

export interface AudioEngine {
  initialize(): Promise<void>;
  destroy(): Promise<void>;

  startCapture(): Promise<void>;
  stopCapture(): Promise<void>;
  toggleMute(): boolean;
  isMuted(): boolean;

  play(audio: AudioPlaybackSource, signal?: AbortSignal): Promise<number>;
  /** Enqueue realtime PCM ahead of playback; resolves after this chunk finishes. */
  streamPcm(bytes: Uint8Array, sampleRate: number): Promise<void>;
  stop(): void;
  clearQueue(): void;
  isPlaying(): boolean;
}

export interface AudioEngineOptions {
  traceLabel?: string;
  captureMode?: "conversation" | "dictation";
}
