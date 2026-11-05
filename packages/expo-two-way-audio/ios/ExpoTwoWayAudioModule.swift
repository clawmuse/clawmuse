import ExpoModulesCore
import Speech

let ON_MIC_DATA_EVENT_NAME = "onMicrophoneData"
let ON_INPUT_VOLUME_LEVEL_EVENT_NAME = "onInputVolumeLevelData"
let ON_OUTPUT_VOLUME_LEVEL_EVENT_NAME = "onOutputVolumeLevelData"
let ON_RECORDING_CHANGE_EVENT_NAME = "onRecordingChange"
let ON_AUDIO_INTERRUPTION_EVENT_NAME = "onAudioInterruption"

public class ExpoTwoWayAudioModule: Module {
    private var audioEngine: AudioEngine?
    private var appleSpeechInput: AnyObject?
    public func definition() -> ModuleDefinition {
        Name("ExpoTwoWayAudio")

        OnDestroy { self.stopAppleSpeechInput() }

        OnCreate {
            let permissionsManager = self.appContext?.permissions
            EXPermissionsMethodsDelegate.register(
                [
                    MicrophonePermissionRequester()
                ],
                withPermissionsManager: permissionsManager
            )

        }

        AsyncFunction("initialize") { () -> Bool in
            do {
                if self.audioEngine != nil {
                    return true
                }
                self.audioEngine = try AudioEngine()
                self.setupMicrophoneCallback()
                self.setupInputAudioLevelCallback()
                self.setupOutputAudioLevelCallback()
                self.setupAudioInterruptionCallback()
                return true
            } catch {
                print("Failed to initialize AudioEngine: \(error)")
                return false
            }
        }

        // Safety net for the JS-driven release in `stopCapture`/`processQueue`: never leave
        // the non-mixing `.playAndRecord` session active while backgrounded, or iOS
        // re-asserts it on the next foreground and kills the user's music again.
        OnAppEntersBackground {
            guard self.audioEngine?.isRecording == false else { return }
            self.audioEngine?.releaseAudioSession()
        }

        Function("releaseAudioSession") {
            self.audioEngine?.releaseAudioSession()
        }

        Function("isRecording") { () -> Bool in
            guard let audioEngine = self.audioEngine else {
                print("AudioEngine not initialized")
                return false
            }
            return audioEngine.isRecording
        }

        Function("startDictation") { () -> Bool in
            let isRecording = self.audioEngine?.toggleRecording(true) ?? false
            self.sendEvent(ON_RECORDING_CHANGE_EVENT_NAME, ["data": isRecording])
            return isRecording
        }

        Function("toggleRecording") { (val: Bool) -> Bool in
            guard let audioEngine = self.audioEngine else {
                print("AudioEngine not initialized")
                return false
            }
            let isRecording = audioEngine.toggleRecording(val)
            self.sendEvent(
                ON_RECORDING_CHANGE_EVENT_NAME,
                [
                    "data": isRecording
                ])
            return isRecording
        }

        Function("getMicrophoneModeIOS") { () -> String in
            if #available(iOS 15.0, *) {
                let mode = AVCaptureDevice.preferredMicrophoneMode.rawValue
                var micMode = ""

                switch mode {
                case 1:
                    micMode = MicrophoneMode.wideSpectrum.rawValue
                case 2:
                    micMode = MicrophoneMode.voiceIsolation.rawValue
                default:
                    micMode = MicrophoneMode.standard.rawValue
                }
                return micMode
            }
            print("Please update your ios")

            return ""
        }

        Function("setMicrophoneModeIOS") {
            if #available(iOS 15, *) {
                DispatchQueue.main.async {
                    AVCaptureDevice.showSystemUserInterface(.microphoneModes)
                }
            } else {
                print("This code only runs on iOS 14 and lower")
            }
        }

        Function("tearDown") {
            self.stopAppleSpeechInput()
            self.audioEngine?.tearDown()
            self.audioEngine = nil
        }

        Function("restart") {
            self.audioEngine?.resumeRecordingAndPlayer()
            self.sendEvent(
                ON_RECORDING_CHANGE_EVENT_NAME,
                [
                    "data": audioEngine?.isRecording
                ])

        }

        Function("playPCMData") { (pcmData: Data) in
            self.audioEngine?.playPCMData(pcmData)
        }

        Function("bypassVoiceProcessing") { (bypass: Bool) in
            self.audioEngine?.bypassVoiceProcessing(bypass)
        }

        Function("isPlaying") { () -> Bool in
            return self.audioEngine?.isPlaying ?? false
        }

        Function("stopPlayback") {
            self.audioEngine?.stopPlayback()
        }

        Function("pausePlayback") {
            self.audioEngine?.pausePlayback()
        }

        Function("resumePlayback") {
            self.audioEngine?.resumePlayback()
        }

        AsyncFunction("getMicrophonePermissionsAsync") { (promise: Promise) in
            EXPermissionsMethodsDelegate.getPermissionWithPermissionsManager(
                self.appContext?.permissions,
                withRequester: MicrophonePermissionRequester.self,
                resolve: promise.legacyResolver,
                reject: promise.legacyRejecter
            )
        }

        AsyncFunction("requestMicrophonePermissionsAsync") { (promise: Promise) in
            EXPermissionsMethodsDelegate.askForPermission(
                withPermissionsManager: self.appContext?.permissions,
                withRequester: MicrophonePermissionRequester.self,
                resolve: promise.legacyResolver,
                reject: promise.legacyRejecter
            )
        }

        AsyncFunction("isAppleSpeechAvailable") { () -> Bool in
            if #available(iOS 26.0, *) { return SpeechTranscriber.isAvailable }
            return false
        }

        AsyncFunction("startAppleSpeech") { (sessionId: String, locale: String) async throws in
            guard #available(iOS 26.0, *) else {
                throw NSError(domain: "AppleSpeechInput", code: 1, userInfo: [NSLocalizedDescriptionKey: "Apple local transcription requires iOS 26 or later."])
            }
            let (previous, input) = await MainActor.run {
                let previous = self.appleSpeechInput as? AppleSpeechInput
                let input = AppleSpeechInput(sessionId: sessionId, locale: locale) { [weak self] event in
                    self?.sendEvent("onAppleSpeech", event)
                }
                self.appleSpeechInput = input
                return (previous, input)
            }
            await previous?.stop()
            do { try await input.start() }
            catch { await input.stop(); throw error }
        }

        Function("appendAppleSpeechAudio") { (sessionId: String, data: Data, endOfTurn: Bool) in
            DispatchQueue.main.async {
                if #available(iOS 26.0, *), let input = self.appleSpeechInput as? AppleSpeechInput,
                   input.sessionId == sessionId {
                    input.append(data, endOfTurn: endOfTurn)
                }
            }
        }

        AsyncFunction("suspendAppleSpeech") { (sessionId: String, suspended: Bool) async in
            if #available(iOS 26.0, *) {
                let input = await MainActor.run { self.appleSpeechInput as? AppleSpeechInput }
                if await input?.sessionId == sessionId { await input?.suspend(suspended) }
            }
        }

        AsyncFunction("stopAppleSpeech") { (sessionId: String) async in
            if #available(iOS 26.0, *) {
                let input = await MainActor.run { () -> AppleSpeechInput? in
                    guard let input = self.appleSpeechInput as? AppleSpeechInput, input.sessionId == sessionId else { return nil }
                    self.appleSpeechInput = nil
                    return input
                }
                await input?.stop()
            }
        }

        // Define the events that can be emitted
        Events([
            "onAppleSpeech",
            ON_MIC_DATA_EVENT_NAME,
            ON_INPUT_VOLUME_LEVEL_EVENT_NAME,
            ON_OUTPUT_VOLUME_LEVEL_EVENT_NAME,
            ON_RECORDING_CHANGE_EVENT_NAME,
            ON_AUDIO_INTERRUPTION_EVENT_NAME,
        ])
    }

    private func stopAppleSpeechInput() {
        DispatchQueue.main.async {
            if #available(iOS 26.0, *), let input = self.appleSpeechInput as? AppleSpeechInput {
                self.appleSpeechInput = nil
                Task { await input.stop() }
            }
        }
    }

    private func setupMicrophoneCallback() {
        audioEngine?.onMicDataCallback = { [weak self] data in
            self?.sendEvent(
                ON_MIC_DATA_EVENT_NAME,
                [
                    "data": data
                ])
        }
    }

    private func setupInputAudioLevelCallback() {
        audioEngine?.onInputVolumeCallback = { [weak self] level in
            self?.sendEvent(
                ON_INPUT_VOLUME_LEVEL_EVENT_NAME,
                [
                    "data": level
                ])
        }
    }

    private func setupOutputAudioLevelCallback() {
        audioEngine?.onOutputVolumeCallback = { [weak self] level in
            self?.sendEvent(
                ON_OUTPUT_VOLUME_LEVEL_EVENT_NAME,
                [
                    "data": level
                ])
        }
    }

    private func setupAudioInterruptionCallback() {
        audioEngine?.onAudioInterruptionCallback = { [weak self] data in
            self?.sendEvent(
                ON_AUDIO_INTERRUPTION_EVENT_NAME,
                [
                    "data": data
                ])
            self?.sendEvent(
                ON_RECORDING_CHANGE_EVENT_NAME,
                [
                    "data": self?.audioEngine?.isRecording
                ])
        }
    }

    enum MicrophoneMode: String, Enumerable {
        case standard
        case voiceIsolation
        case wideSpectrum
    }
}
