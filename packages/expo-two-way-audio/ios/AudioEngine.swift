import AVFoundation
import Foundation
import UIKit

class AudioEngine {
    private var avAudioEngine = AVAudioEngine()
    private var speechPlayer = AVAudioPlayerNode()
    private var engineConfigChangeObserver: Any?
    private var sessionInterruptionObserver: Any?
    private var mediaServicesResetObserver: Any?
    
    public private(set) var voiceIOFormat: AVAudioFormat
    public private(set) var isRecording = false
    public private(set) var isSessionActive = false
    private var recordingRequested = false
    private var isInterrupted = false
    private var appDidBecomeActiveObserver: Any?
    private var secondaryAudioHintObserver: Any?
    /// Pending automatic capture resume after an interruption; see `scheduleCaptureResume`.
    private var captureResumeWorkItem: DispatchWorkItem?
    private var captureResumeAttempt = 0
    private static let captureResumeDelays: [TimeInterval] = [0, 0.5, 1, 2, 4, 8]
    
    public var onMicDataCallback: ((Data) -> Void)?
    public var onInputVolumeCallback: ((Float) -> Void)?
    public var onOutputVolumeCallback: ((Float) -> Void)?
    public var onAudioInterruptionCallback: ((String) -> Void)?
    
    private var inputLevelTimer: Timer?
    private var outputLevelTimer: Timer?
    
    private var inputBuffer = [Float](repeating: 0, count: 2048)
    private var outputBuffer = [Float](repeating: 0, count: 2048)
    private var inputBufferIndex = 0
    private var outputBufferIndex = 0
    

    /// Buffers scheduled on `speechPlayer` that have not finished rendering yet.
    ///
    /// `AVAudioPlayerNode.isPlaying` cannot answer "is audio still in flight": it stays true from
    /// `play()` until an explicit `stop()`/`pause()`, and draining every scheduled buffer does not
    /// clear it. Using it as the release guard meant the session was never handed back after the
    /// first spoken response. Decremented from the scheduling completion handler, which runs on an
    /// AVAudioEngine-internal thread, so all access goes through `playbackCountLock`.
    private var pendingPlaybackBuffers = 0
    private let playbackCountLock = NSLock()

    private var hasPendingPlayback: Bool {
        playbackCountLock.lock()
        defer { playbackCountLock.unlock() }
        return pendingPlaybackBuffers > 0
    }
    
    enum AudioEngineError: Error {
        case audioFormatError
    }
    
    init() throws {
        avAudioEngine.attach(speechPlayer)
        
        guard let format = AVAudioFormat(standardFormatWithSampleRate: 16000, channels: 1) else {
            throw AudioEngineError.audioFormatError
        }
        voiceIOFormat = format
        print("Voice IO format: \(String(describing: voiceIOFormat))")
        
        engineConfigChangeObserver = NotificationCenter.default.addObserver(
            forName: .AVAudioEngineConfigurationChange,
            object: avAudioEngine,
            queue: .main) { [weak self] _ in
                self?.checkEngineIsRunning()
            }
        sessionInterruptionObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance(),
            queue: .main) { [weak self] notification in
                self?.handleAudioSessionInterruption(notification)
            }
        mediaServicesResetObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.mediaServicesWereResetNotification,
            object: AVAudioSession.sharedInstance(),
            queue: .main) { [weak self] _ in
                self?.handleMediaServicesWereReset()
            }
        appDidBecomeActiveObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification,
            object: nil,
            queue: .main) { [weak self] _ in
                self?.handleAppDidBecomeActive()
            }
        secondaryAudioHintObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.silenceSecondaryAudioHintNotification,
            object: AVAudioSession.sharedInstance(),
            queue: .main) { [weak self] notification in
                self?.handleSecondaryAudioHint(notification)
            }
        
        self.setupAudioSession()
        self.setup()
        self.start()
    }
    
    deinit {
        if let observer = engineConfigChangeObserver {
            NotificationCenter.default.removeObserver(observer)
        }
        if let observer = sessionInterruptionObserver {
            NotificationCenter.default.removeObserver(observer)
        }
        if let observer = mediaServicesResetObserver {
            NotificationCenter.default.removeObserver(observer)
        }
        if let observer = appDidBecomeActiveObserver {
            NotificationCenter.default.removeObserver(observer)
        }
        if let observer = secondaryAudioHintObserver {
            NotificationCenter.default.removeObserver(observer)
        }
        captureResumeWorkItem?.cancel()
    }
    
    func setupAudioSession() {
        let session = AVAudioSession.sharedInstance()

        do {
            try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetooth, .allowBluetoothA2DP])
        } catch {
            print("Could not set the audio category: \(error.localizedDescription)")
        }

        do {
            try session.setPreferredSampleRate(voiceIOFormat.sampleRate)
        } catch {
            print("Could not set the preferred sample rate: \(error.localizedDescription)")
        }

        do {
            // Request before activation; hardware/routes may choose a different duration.
            try session.setPreferredIOBufferDuration(0.01)
        } catch {
            print("Could not request low-latency audio IO: \(error.localizedDescription)")
        }

        do {
            try session.setActive(true)
            isSessionActive = true
            print("Voice IO buffer duration: \(session.ioBufferDuration)")
        } catch {
            print("Could not set the audio session as active")
        }
    }

    func activateAudioSessionIfNeeded() {
        guard !isSessionActive, !isInterrupted else { return }
        setupAudioSession()
        checkEngineIsRunning()
    }

    /// Hand the audio session back to the system.
    ///
    /// `.playAndRecord` + `.voiceChat` does not mix, so while it is active the user's
    /// background music stays dead — including across backgrounding, because iOS
    /// re-asserts whatever category the app last set when it returns to the foreground.
    /// Releasing when we are neither capturing nor playing is what lets their music come
    /// back; `.notifyOthersOnDeactivation` is what tells the other app to resume, and
    /// dropping to `.ambient` means any implicit reactivation mixes instead of interrupting.
    func releaseAudioSession() {
        // The native engine is a singleton shared by every JS-side engine wrapper, so it is the
        // only layer that knows whether *anything* is still using the session. Never release
        // while capture or playback is live — the JS callers each only see their own queue.
        guard isSessionActive, !isRecording, !hasPendingPlayback else { return }

        avAudioEngine.pause()

        let session = AVAudioSession.sharedInstance()
        do {
            try session.setActive(false, options: [.notifyOthersOnDeactivation])
        } catch {
            print("Could not deactivate the audio session: \(error.localizedDescription)")
        }
        do {
            try session.setCategory(.ambient, options: [.mixWithOthers])
        } catch {
            print("Could not reset the audio category: \(error.localizedDescription)")
        }

        isSessionActive = false
    }

    func setup() {
        let input = avAudioEngine.inputNode
        do {
            try input.setVoiceProcessingEnabled(true)
        } catch {
            print("Could not enable voice processing \(error)")
            return
        }
        
        avAudioEngine.inputNode.isVoiceProcessingInputMuted = !isRecording
        
        let output = avAudioEngine.outputNode
        let mainMixer = avAudioEngine.mainMixerNode
        
        avAudioEngine.connect(speechPlayer, to: mainMixer, format: voiceIOFormat)
        avAudioEngine.connect(mainMixer, to: output, format: voiceIOFormat)
        
        // 512 samples at 16 kHz is 32 ms, instead of batching 128 ms of microphone audio.
        input.installTap(onBus: 0, bufferSize: 512, format: voiceIOFormat) { [weak self] buffer, when in
            // VoiceProcessing performs echo cancellation. Dropping capture during playback
            // also drops the user's interruption and stops the server VAD's audio clock.
            if self?.isRecording == true {
                self?.processMicrophoneBuffer(buffer)
                self?.updateInputVolume()
            }
        }
        
        mainMixer.installTap(onBus: 0, bufferSize: 2048, format: voiceIOFormat) { [weak self] buffer, when in
            self?.processOutputBuffer(buffer)
            self?.updateOutputVolume()
        }
        
        avAudioEngine.prepare()
    }
    
    func processMicrophoneBuffer(_ buffer: AVAudioPCMBuffer) {
        guard let channelData = buffer.floatChannelData?[0] else {
            print("Error: Could not access channel data")
            return
        }
        
        let frameCount = Int(buffer.frameLength)
        var int16Samples = [Int16](repeating: 0, count: frameCount)
        
        // Convert float samples to Int16 and update input buffer for volume calculation
        for i in 0..<frameCount {
            let floatSample = max(-1.0, min(1.0, channelData[i]))
            int16Samples[i] = Int16(floatSample * Float(Int16.max))
            
            inputBuffer[inputBufferIndex] = floatSample
            inputBufferIndex = (inputBufferIndex + 1) % inputBuffer.count
        }
        
        // Create Data object from Int16 samples
        let data = Data(bytes: int16Samples, count: frameCount * MemoryLayout<Int16>.size)
        
        // Send the data to the callback
        onMicDataCallback?(data)
    }
    
    func processOutputBuffer(_ buffer: AVAudioPCMBuffer) {
        guard let channelData = buffer.floatChannelData?[0] else {
            print("Error: Could not access channel data")
            return
        }
        
        let frameCount = Int(buffer.frameLength)
        
        // Update output buffer for volume calculation
        for i in 0..<frameCount {
            let floatSample = max(-1.0, min(1.0, channelData[i]))
            outputBuffer[outputBufferIndex] = floatSample
            outputBufferIndex = (outputBufferIndex + 1) % outputBuffer.count
        }
    }
    
    func start() {
        do {
            try avAudioEngine.start()
        } catch {
            print("Could not start audio engine: \(error)")
        }
    }
    
    func playPCMData(_ pcmData: Data) {
        guard !isInterrupted else { return }
        activateAudioSessionIfNeeded()

        guard let buffer = createBuffer(from: pcmData) else {
            print("Failed to create audio buffer")
            return
        }
        playbackCountLock.lock()
        pendingPlaybackBuffers += 1
        playbackCountLock.unlock()
        speechPlayer.scheduleBuffer(buffer, completionCallbackType: .dataPlayedBack) { [weak self] _ in
            guard let self = self else { return }
            self.playbackCountLock.lock()
            if self.pendingPlaybackBuffers > 0 {
                self.pendingPlaybackBuffers -= 1
            }
            self.playbackCountLock.unlock()
        }

        if !speechPlayer.isPlaying {
            speechPlayer.play()
        }
    }

    
    private func createBuffer(from data: Data) -> AVAudioPCMBuffer? {
        let frameCount = UInt32(data.count) / 2 // 16-bit input = 2 bytes per frame
        
        let format = AVAudioFormat(commonFormat: .pcmFormatFloat32,
                                   sampleRate: 16000,
                                   channels: 1,
                                   interleaved: false)!
        
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else {
            return nil
        }
        
        buffer.frameLength = frameCount
        
        data.withUnsafeBytes { (rawBufferPointer: UnsafeRawBufferPointer) in
            if let sourcePtr = rawBufferPointer.baseAddress?.assumingMemoryBound(to: Int16.self),
               let destPtr = buffer.floatChannelData?[0] {
                for i in 0..<Int(frameCount) {
                    destPtr[i] = Float(sourcePtr[i]) / Float(Int16.max)
                }
            }
        }
        
        return buffer
    }
    
    func bypassVoiceProcessing(_ bypass: Bool) {
        let input = avAudioEngine.inputNode
        input.isVoiceProcessingBypassed = bypass
    }
    
    func toggleRecording(_ val: Bool) -> Bool {
        recordingRequested = val
        if !val { cancelCaptureResume() }
        if isInterrupted {
            isRecording = false
            return false
        }
        isRecording = val
        if !isRecording {
            avAudioEngine.inputNode.isVoiceProcessingInputMuted = true
            // Reset input buffer, so that volume levels report 0
            inputBuffer = [Float](repeating: 0, count: 2048)
            updateInputVolume()
        } else {
            activateAudioSessionIfNeeded()
            guard isSessionActive, avAudioEngine.isRunning else {
                isRecording = false
                recordingRequested = false
                onAudioInterruptionCallback?("blocked")
                return false
            }
            avAudioEngine.inputNode.isVoiceProcessingInputMuted = false
        }
        print("Recording \(isRecording ? "started" : "stopped")")
        
        return isRecording
    }
    
    func stopRecordingAndPlayer(){
        toggleRecording(false)
        speechPlayer.stop()
        resetPendingPlayback()
        updateOutputVolume()
        releaseAudioSession()
    }

    /// `stop()` discards whatever is still scheduled, so the pending count has to be cleared with
    /// it. Leaving it non-zero would block every later release.
    private func resetPendingPlayback() {
        playbackCountLock.lock()
        pendingPlaybackBuffers = 0
        playbackCountLock.unlock()
    }

    func resumeRecordingAndPlayer(){
        activateAudioSessionIfNeeded()
        self.checkEngineIsRunning()
        isRecording = toggleRecording(true)
        speechPlayer.play()
    }
    
    func tearDown() {
        stopRecordingAndPlayer()
        avAudioEngine.stop()
    }
    
    var isPlaying: Bool {
        return speechPlayer.isPlaying
    }

    func stopPlayback() {
        speechPlayer.stop()
        resetPendingPlayback()
        // Clear any scheduled buffers
        outputBuffer = [Float](repeating: 0, count: 2048)
        updateOutputVolume()
        print("Playback stopped")
    }

    func pausePlayback() {
        speechPlayer.pause()
        print("Playback paused")
    }

    func resumePlayback() {
        guard !isInterrupted else { return }
        if !speechPlayer.isPlaying {
            speechPlayer.play()
            print("Playback resumed")
        }
    }
    
    private func checkEngineIsRunning() {
        // Starting the engine implicitly reactivates the audio session. Never do that while the
        // session is released, or a stray configuration-change notification (which releasing
        // itself can trigger, since it changes the category) would silently grab the user's
        // audio back and undo the release.
        guard isSessionActive, !isInterrupted else { return }
        if !avAudioEngine.isRunning {
            start()
        }
    }
    
    private func handleAudioSessionInterruption(_ notification: Notification) {
        guard let userInfo = notification.userInfo,
              let typeValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: typeValue) else { return }

        switch type {
        case .began:
            cancelCaptureResume()
            isInterrupted = true
            isSessionActive = false
            isRecording = false
            avAudioEngine.pause()
            if recordingRequested { speechPlayer.pause() }
            else { stopPlayback() }
            onAudioInterruptionCallback?("capture_paused")
        case .ended:
            isInterrupted = false
            let optionsValue = userInfo[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
            let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)
            // Stopping voice during an interruption must not reopen the microphone later.
            guard recordingRequested else { return }
            if options.contains(.shouldResume)
                || !AVAudioSession.sharedInstance().secondaryAudioShouldBeSilencedHint {
                scheduleCaptureResume(reset: true)
            } else {
                // Another app is playing now. Do not take its audio away; the conversation stays
                // open (JS keeps showing capture_paused) and resumes when that audio stops or the
                // user comes back to ClawMuse.
                print("Interruption ended without shouldResume while other audio plays; waiting")
            }
        @unknown default:
            recordingRequested = false
            isRecording = false
            onAudioInterruptionCallback?("blocked")
        }
    }

    private func handleMediaServicesWereReset() {
        // Media-services reset invalidates the engine and all its nodes/taps.
        let resumeCapture = recordingRequested
        avAudioEngine.stop()
        if let observer = engineConfigChangeObserver {
            NotificationCenter.default.removeObserver(observer)
        }
        avAudioEngine = AVAudioEngine()
        speechPlayer = AVAudioPlayerNode()
        avAudioEngine.attach(speechPlayer)
        resetPendingPlayback()
        isSessionActive = false
        isRecording = false
        isInterrupted = false
        engineConfigChangeObserver = NotificationCenter.default.addObserver(
            forName: .AVAudioEngineConfigurationChange,
            object: avAudioEngine,
            queue: .main) { [weak self] _ in
                self?.checkEngineIsRunning()
            }
        if resumeCapture { setupAudioSession() }
        setup()
        if resumeCapture {
            start()
            scheduleCaptureResume(reset: true)
        }
    }

    // MARK: - Automatic capture resume
    //
    // Voice conversation means "keep listening until the user ends it", so an interruption
    // (call, Siri, alarm, another app taking audio, media-services reset) must not end it:
    // - `.ended` with `.shouldResume`, or no other app audio playing → resume right away;
    // - another app's audio is playing (`secondaryAudioShouldBeSilencedHint`) → do not steal it;
    //   resume when that audio stops (`silenceSecondaryAudioHintNotification` `.end`) or when the
    //   user returns to ClawMuse (`didBecomeActive`, which also covers a missing `.ended`);
    // - activation can fail transiently right after an interruption → retry with backoff, then
    //   stay paused until the next trigger instead of giving up.
    // Ending voice (`toggleRecording(false)`) clears `recordingRequested` and cancels all of it.

    private func cancelCaptureResume() {
        captureResumeWorkItem?.cancel()
        captureResumeWorkItem = nil
    }

    private func scheduleCaptureResume(reset: Bool) {
        guard recordingRequested, !isRecording else { return }
        if reset { captureResumeAttempt = 0 }
        cancelCaptureResume()
        let delays = AudioEngine.captureResumeDelays
        // Out of quick retries: stay paused until the next trigger.
        guard captureResumeAttempt < delays.count else { return }
        let item = DispatchWorkItem { [weak self] in
            self?.attemptCaptureResume()
        }
        captureResumeWorkItem = item
        DispatchQueue.main.asyncAfter(deadline: .now() + delays[captureResumeAttempt], execute: item)
    }

    private func attemptCaptureResume() {
        captureResumeWorkItem = nil
        guard recordingRequested, !isRecording, !isInterrupted else { return }
        captureResumeAttempt += 1
        if !isSessionActive { setupAudioSession() }
        if isSessionActive, !avAudioEngine.isRunning { start() }
        guard isSessionActive, avAudioEngine.isRunning else {
            print("Capture resume attempt \(captureResumeAttempt) failed; retrying")
            scheduleCaptureResume(reset: false)
            return
        }
        isRecording = true
        avAudioEngine.inputNode.isVoiceProcessingInputMuted = false
        if hasPendingPlayback { speechPlayer.play() }
        captureResumeAttempt = 0
        print("Recording resumed after interruption")
        onAudioInterruptionCallback?("capture_resumed")
    }

    private func handleAppDidBecomeActive() {
        // Returning to ClawMuse is an explicit intent to keep talking.
        guard recordingRequested, !isRecording else { return }
        isInterrupted = false
        scheduleCaptureResume(reset: true)
    }

    private func handleSecondaryAudioHint(_ notification: Notification) {
        guard let raw = notification.userInfo?[AVAudioSessionSilenceSecondaryAudioHintTypeKey] as? UInt,
              let type = AVAudioSession.SilenceSecondaryAudioHintType(rawValue: raw),
              type == .end else { return }
        guard recordingRequested, !isRecording, !isInterrupted else { return }
        scheduleCaptureResume(reset: true)
    }

    private func updateInputVolume() {
        let volume = calculateRMSLevel(from: inputBuffer)
        onInputVolumeCallback?(volume)
    }
    
    private func updateOutputVolume() {
        let volume = calculateRMSLevel(from: outputBuffer)
        onOutputVolumeCallback?(volume)
    }
    
    private func calculateRMSLevel(from buffer: [Float]) -> Float {
        let epsilon: Float = 1e-5 // To avoid log(0)
        let rmsValue = sqrt(buffer.reduce(0) { $0 + $1 * $1 } / Float(buffer.count))
        
        // Convert to decibels
        let dbValue = 20 * log10(max(rmsValue, epsilon))
        
        // Normalize decibel value to 0-1 range
        // Assuming minimum audible is -60dB and maximum is 0dB
        let minDb: Float = -80.0
        let normalizedValue = max(0.0, min(1.0, (dbValue - minDb) / abs(minDb)))
        
        // Optional: Apply exponential factor to push smaller values down
        let expFactor: Float = 2.0 // Adjust this value to change the curve
        let adjustedValue = pow(normalizedValue, expFactor)
        
        return adjustedValue
    }
}
