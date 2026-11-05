import { brand } from "../../../brand.generated.js";
import type { SessionInboundMessage, SessionOutboundMessage } from "../../messages.js";
import type { OwnedOperation, SessionDelivery } from "../owned-subscriptions/index.js";
import { VoiceSession, type VoiceSessionOptions } from "./voice-session.js";

import { VoiceAssistant } from "./voice-assistant.js";

type VoiceMessage = Extract<
  SessionInboundMessage,
  {
    type:
      | "voice_audio_chunk"
      | "abort_request"
      | "audio_played"
      | "set_voice_mode"
      | "voice.input.submit_transcript.request"
      | "dictation_stream_start"
      | "dictation_stream_chunk"
      | "dictation_stream_finish"
      | "dictation_stream_cancel";
  }
>;

interface ActiveVoiceSource {
  voice: VoiceSession;
  assistant: VoiceAssistant | null;
  owner: OwnedOperation;
  pending: Set<Promise<void>>;
  closing: boolean;
  controlTail: Promise<void>;
}

/** Audio conversations belong to their requesting socket, including bootstrap and finalization. */
export class VoiceSessions {
  private readonly sources = new Map<object, ActiveVoiceSource>();

  constructor(
    private readonly options: VoiceSessionOptions,
    private readonly delivery: SessionDelivery,
    private readonly demandChanged: () => void,
  ) {}

  get hasDemand(): boolean {
    return [...this.sources.values()].some((source) => !source.closing);
  }

  closeAssistants(): void {
    for (const active of this.sources.values()) {
      if (active.assistant) {
        active.assistant.close();
        active.owner.emit({
          type: "voice_input_state",
          payload: {
            isSpeaking: false,
            assistantState: "connection_failed",
            assistantMessage: "Voice ended because host permissions changed.",
          },
        });
        active.assistant = null;
      }
      this.releaseIdle(active);
    }
  }

  isActiveForAgent(agentId: string): boolean {
    return [...this.sources.values()].some(
      (source) => !source.closing && source.voice.isActiveForAgent(agentId),
    );
  }

  handleMessage(message: VoiceMessage): Promise<void> {
    const source = this.delivery.currentSource;
    if (!source) throw new Error("Voice request has no source");
    const existing = this.sources.get(source);
    if (existing?.closing) return existing.owner.release().then(() => this.handleMessage(message));
    const active = existing ?? this.startSource(source);
    const dispatch = () => (active.closing ? undefined : this.dispatch(active, message));
    const pending = (
      message.type === "set_voice_mode" ? active.controlTail : Promise.resolve()
    ).then(dispatch);
    if (message.type === "set_voice_mode") active.controlTail = pending.catch(() => undefined);
    active.pending.add(pending);
    const finished = () => {
      active.pending.delete(pending);
      this.releaseIdle(active);
      return undefined;
    };
    void pending.then(finished, finished);
    return pending;
  }

  private startSource(source: object): ActiveVoiceSource {
    const owner = this.delivery.operation(isVoiceOutput, async () => {
      active.closing = true;
      this.demandChanged();
      // Cancel input immediately; restore agent configuration after bootstrap has settled.
      try {
        active.assistant?.close();
        active.voice.cancel();
      } finally {
        await Promise.allSettled(active.pending);
        await active.voice.cleanup();
      }
      if (this.sources.get(source) === active) this.sources.delete(source);
    });
    const active: ActiveVoiceSource = {
      owner,
      assistant: null,
      pending: new Set(),
      closing: false,
      controlTail: Promise.resolve(),
      voice: new VoiceSession({
        ...this.options,
        host: { ...this.options.host, emit: (message) => owner.emit(message) },
        onIdle: () => this.releaseIdle(active),
      }),
    };
    this.sources.set(source, active);
    this.demandChanged();
    return active;
  }

  private releaseIdle(source: ActiveVoiceSource): void {
    if (source.closing || source.pending.size > 0 || source.voice.hasDemand || source.assistant)
      return;
    void source.owner
      .release()
      .catch((error) =>
        this.options.logger.error({ err: error }, "Failed to release voice source"),
      );
  }

  private async setAssistantMode(
    active: ActiveVoiceSource,
    message: Extract<VoiceMessage, { type: "set_voice_mode" }>,
  ): Promise<void> {
    const voice = active.voice;
    try {
      active.assistant?.close();
      active.assistant = null;
      if (message.enabled) {
        if (!this.options.assistant) throw new Error("Voice assistant unavailable on this host");
        if (voice.hasDemand)
          throw new Error("Close the current voice input before opening the assistant");
        if (message.agentId) await this.options.host.loadAgent(message.agentId);
        if (active.closing) throw new Error("Voice source closed");
        const assistant = new VoiceAssistant({
          config: message.officialVoiceCredential
            ? {
                ...this.options.assistant.config(),
                apiKey: message.officialVoiceCredential,
                baseUrl:
                  brand.hubOrigin.replace(/^http/, "ws") + "/api/auth/clawmuse/official/realtime",
                model: "stepaudio-3-realtime-preview",
              }
            : this.options.assistant.config(),
          anchorAgentId: message.agentId,
          host: this.options.assistant.host,
          logger: this.options.logger,
          emit: (output) => active.owner.emit(output),
          onFailure: () => {
            if (active.assistant === assistant) active.assistant = null;
            this.releaseIdle(active);
          },
        });
        active.assistant = assistant;
        await assistant.start();
      }
      if (message.requestId)
        active.owner.emit({
          type: "set_voice_mode_response",
          payload: {
            requestId: message.requestId,
            enabled: message.enabled,
            agentId: message.enabled ? (message.agentId ?? null) : null,
            accepted: true,
            error: null,
          },
        });
    } catch (error) {
      active.assistant?.close();
      active.assistant = null;
      if (message.requestId)
        active.owner.emit({
          type: "set_voice_mode_response",
          payload: {
            requestId: message.requestId,
            enabled: false,
            agentId: null,
            accepted: false,
            error: error instanceof Error ? error.message : "Voice assistant failed",
          },
        });
    }
  }

  private async dispatch(active: ActiveVoiceSource, message: VoiceMessage): Promise<void> {
    const voice = active.voice;
    if (message.type === "set_voice_mode" && (message.assistant || active.assistant)) {
      await this.setAssistantMode(active, message);
      return;
    }
    if (active.assistant) {
      if (message.type === "voice_audio_chunk") {
        active.assistant.appendAudio(message.audio, message.format);
        return;
      }
      if (message.type === "abort_request") {
        active.assistant.interrupt();
        return;
      }
      if (message.type === "audio_played") {
        active.assistant.audioPlayed(message.id);
        return;
      }
    }
    switch (message.type) {
      case "voice_audio_chunk":
        return voice.handleAudioChunk(message);
      case "abort_request":
        return voice.handleAbort();
      case "audio_played":
        return voice.handleAudioPlayed(message.id);
      case "set_voice_mode":
        return voice.handleSetVoiceMode(
          message.enabled,
          message.agentId,
          message.requestId,
          message.inputSource,
          message.inputSessionId,
          message.officialVoiceCredential,
        );
      case "voice.input.submit_transcript.request":
        return voice.handleClientTranscript(message);
      case "dictation_stream_start":
        return voice.handleDictationStreamStart(message);
      case "dictation_stream_chunk":
        return voice.handleDictationChunk({
          dictationId: message.dictationId,
          seq: message.seq,
          audioBase64: message.audio,
          format: message.format,
        });
      case "dictation_stream_finish":
        return voice.handleDictationFinish(message.dictationId, message.finalSeq);
      case "dictation_stream_cancel":
        return voice.handleDictationCancel(message.dictationId);
    }
  }
}

function isVoiceOutput(message: SessionOutboundMessage): boolean {
  switch (message.type) {
    case "audio_output":
    case "transcription_result":
    case "voice_input_state":
    case "set_voice_mode_response":
    case "voice.input.submit_transcript.response":
    case "dictation_stream_ack":
    case "dictation_stream_partial":
    case "dictation_stream_final":
    case "dictation_stream_error":
    case "dictation_stream_finish_accepted":
    case "activity_log":
      return true;
    default:
      return false;
  }
}
