import { REALTIME_VOICE_VAD_CONFIG } from "./realtime-voice-config";

const SAMPLE_RATE = 16000;
// Detector confidence must not shorten the user's pause between parts of a thought.
const SILENCE_SAMPLES = (SAMPLE_RATE * REALTIME_VOICE_VAD_CONFIG.silenceDurationMs) / 1000;
const TEXT_SETTLE_SAMPLES = SAMPLE_RATE * 0.25;
const MAX_TURN_SAMPLES = SAMPLE_RATE * 60;

/**
 * Prefer Apple's reported VAD activity; use acoustic quiet until the detector reports.
 * Both paths require actual text before closing a turn. Neither identifies the speaker.
 * These thresholds still need device/noise trials.
 */
export function createLocalTurnBoundary() {
  let hasText = false;
  let elapsed = 0;
  let lastActivity = 0;
  let turnStart = 0;
  let lastText = 0;
  let noiseFloor = 0.002;
  let text = "";
  let speechDetected: boolean | null = null;
  let hasActivity = false;
  let detectorTime = -1;
  let endpointMs = 0;
  return {
    reset() {
      hasText = false;
      elapsed = 0;
      lastActivity = 0;
      turnStart = 0;
      lastText = 0;
      text = "";
      speechDetected = null;
      hasActivity = false;
      detectorTime = -1;
      endpointMs = 0;
    },
    activity(detected: boolean, audioTimeMs?: number) {
      const reported = audioTimeMs === undefined ? elapsed : (audioTimeMs * SAMPLE_RATE) / 1000;
      if (!Number.isFinite(reported) || reported < 0 || reported < detectorTime) return;
      detectorTime = reported;
      if (detected || speechDetected === true) lastActivity = Math.min(elapsed, reported);
      if (detected) hasActivity = true;
      speechDetected = detected;
    },
    transcript(next: string) {
      if (!next.trim() || next === text) return;
      text = next;
      if (!hasText) {
        // Preserve silence already observed while the recognizer was producing its first text.
        if (!hasActivity) lastActivity = elapsed;
        turnStart = elapsed;
      }
      hasText = true;
      lastText = elapsed;
    },
    append(pcm: Uint8Array): boolean {
      const samples = Math.floor(pcm.byteLength / 2);
      if (samples === 0) return false;
      const view = new DataView(pcm.buffer, pcm.byteOffset, samples * 2);
      let energy = 0;
      for (let index = 0; index < samples; index++) {
        const value = view.getInt16(index * 2, true) / 32768;
        energy += value * value;
      }
      const rms = Math.sqrt(energy / samples);
      const threshold = Math.max(0.008, noiseFloor * 3);
      elapsed += samples;
      if (speechDetected === true || (speechDetected === null && rms >= threshold)) {
        lastActivity = elapsed;
        hasActivity = true;
      }
      if (!hasText && rms < threshold) noiseFloor += (rms - noiseFloor) * 0.05;
      if (!hasText) return false;
      const quiet = elapsed - lastActivity >= SILENCE_SAMPLES;
      const settled = elapsed - lastText >= TEXT_SETTLE_SAMPLES;
      const finished = (quiet && settled) || elapsed - turnStart >= MAX_TURN_SAMPLES;
      if (finished) endpointMs = Math.max(0, ((elapsed - lastActivity) * 1000) / SAMPLE_RATE);
      return finished;
    },
    getEndpointMs() {
      return endpointMs;
    },
  };
}
