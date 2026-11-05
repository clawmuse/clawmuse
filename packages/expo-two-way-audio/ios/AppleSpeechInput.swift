import AVFoundation
import Speech

/// Receives the existing voice-processed mono 16 kHz stream; never opens another microphone.
@available(iOS 26.0, *)
@MainActor
final class AppleSpeechInput {
    let sessionId: String
    private let emit: ([String: Any]) -> Void
    private var locale: Locale
    private var analyzer: SpeechAnalyzer?
    private var input: AsyncStream<AnalyzerInput>.Continuation?
    private var converter: AVAudioConverter?
    private var format: AVAudioFormat?
    private var resultsTask: Task<Void, Never>?
    private var detectionTask: Task<Void, Never>?
    private var stopped = false
    private var suspended = false
    private var finishing = false
    private var generation = 0
    private var finalizedText = ""
    private var partialText = ""
    private var firstBufferAt: TimeInterval?
    private var firstPartialMs: Double?
    private let pcmFormat = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16000, channels: 1, interleaved: false)!

    init(sessionId: String, locale: String, emit: @escaping ([String: Any]) -> Void) {
        self.sessionId = sessionId
        self.locale = locale.isEmpty ? Locale.current : Locale(identifier: locale)
        self.emit = emit
    }

    private func event(_ type: String, _ values: [String: Any] = [:]) {
        guard !stopped else { return }
        emit(values.merging(["type": type, "sessionId": sessionId]) { _, new in new })
    }

    func start() async throws {
        guard !stopped else { throw CancellationError() }
        guard SpeechTranscriber.isAvailable,
              let supported = await SpeechTranscriber.supportedLocale(equivalentTo: locale) else {
            throw failure("Apple local transcription is unavailable for this device or language.")
        }
        guard !stopped else { throw CancellationError() }
        locale = supported
        let transcriber = SpeechTranscriber(locale: locale, preset: .progressiveTranscription)
        let detector = SpeechDetector()
        // Keep only this feature's most recently used locale; never release other features' assets.
        let key = "ClawMuseAppleSpeechReservedLocale"
        if let previous = UserDefaults.standard.string(forKey: key), previous != locale.identifier {
            await AssetInventory.release(reservedLocale: Locale(identifier: previous))
        }
        try await AssetInventory.reserve(locale: locale)
        UserDefaults.standard.set(locale.identifier, forKey: key)
        guard !stopped else { throw CancellationError() }
        if let installation = try await AssetInventory.assetInstallationRequest(supporting: [transcriber, detector]) {
            event("preparing")
            try await installation.downloadAndInstall()
        }
        guard !stopped else { throw CancellationError() }
        try await openUtterance()
    }

    private func openUtterance() async throws {
        guard !stopped, !suspended else { throw CancellationError() }
        generation += 1
        let token = generation
        finalizedText = ""
        partialText = ""
        firstBufferAt = nil
        firstPartialMs = nil
        let transcriber = SpeechTranscriber(locale: locale, preset: .progressiveTranscription)
        // The default initializer does not report VAD results. Explicitly request them
        // so environmental noise does not keep the app's turn boundary open indefinitely.
        let detector = SpeechDetector(detectionOptions: .init(sensitivityLevel: .medium), reportResults: true)
        let modules: [any SpeechModule] = [transcriber, detector]
        guard let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: modules),
              let converter = AVAudioConverter(from: pcmFormat, to: format) else {
            throw failure("No compatible Apple speech audio format.")
        }
        guard !stopped, token == generation else { throw CancellationError() }
        self.format = format
        self.converter = converter
        let (stream, continuation) = AsyncStream.makeStream(of: AnalyzerInput.self, bufferingPolicy: .bufferingOldest(64))
        input = continuation
        let analyzer = SpeechAnalyzer(modules: modules, options: .init(priority: .userInitiated, modelRetention: .lingering))
        self.analyzer = analyzer
        detectionTask = Task { [weak self] in
            var previous: Bool?
            do {
                for try await result in detector.results {
                    guard let self, !self.stopped, token == self.generation else { return }
                    if previous != result.speechDetected {
                        previous = result.speechDetected
                        let time = result.speechDetected ? CMTimeRangeGetEnd(result.range) : result.range.start
                        let milliseconds = CMTimeGetSeconds(time) * 1000
                        var values: [String: Any] = ["speechDetected": result.speechDetected]
                        if milliseconds.isFinite, milliseconds >= 0 { values["audioTimeMs"] = milliseconds }
                        self.event("activity", values)
                    }
                }
            } catch { self?.fail(error, token: token) }
        }
        resultsTask = Task { [weak self] in
            do {
                for try await result in transcriber.results {
                    guard let self, !self.stopped, token == self.generation else { return }
                    let text = String(result.text.characters)
                    if result.isFinal {
                        self.finalizedText += text
                        self.partialText = ""
                    } else { self.partialText = text }
                    if self.firstPartialMs == nil, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                       let firstBufferAt = self.firstBufferAt {
                        let speechStart = firstBufferAt + CMTimeGetSeconds(result.range.start)
                        self.firstPartialMs = max(0, (ProcessInfo.processInfo.systemUptime - speechStart) * 1000)
                    }
                    self.event("partial", ["text": self.finalizedText + self.partialText])
                }
            } catch { self?.fail(error, token: token) }
        }
        try await analyzer.prepareToAnalyze(in: format)
        guard !stopped, token == generation else { await analyzer.cancelAndFinishNow(); throw CancellationError() }
        try await analyzer.start(inputSequence: stream)
        guard !stopped, token == generation else { await analyzer.cancelAndFinishNow(); throw CancellationError() }
        finishing = false
        event("ready")
    }

    /// Main-queue dispatch preserves the order of PCM and its end-of-turn marker.
    func append(_ data: Data, endOfTurn: Bool) {
        guard !stopped, !suspended, !finishing, !data.isEmpty else { return }
        guard data.count % 2 == 0, let converter, let format,
              let source = AVAudioPCMBuffer(pcmFormat: pcmFormat, frameCapacity: AVAudioFrameCount(data.count / 2)),
              let samples = source.int16ChannelData?[0] else { return }
        if firstBufferAt == nil { firstBufferAt = ProcessInfo.processInfo.systemUptime - Double(data.count) / 32000 }
        source.frameLength = source.frameCapacity
        data.copyBytes(to: UnsafeMutableRawBufferPointer(start: samples, count: data.count))
        let capacity = AVAudioFrameCount(ceil(Double(source.frameLength) * format.sampleRate / 16000)) + 32
        guard let output = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: capacity) else { return }
        var provided = false
        var conversionError: NSError?
        converter.convert(to: output, error: &conversionError) { _, status in
            if provided { status.pointee = .noDataNow; return nil }
            provided = true
            status.pointee = .haveData
            return source
        }
        if let conversionError { fail(conversionError, token: generation); return }
        if output.frameLength > 0, let result = input?.yield(AnalyzerInput(buffer: output, bufferStartTime: nil)) {
            if case .dropped = result { fail(failure("Apple transcription audio queue is full."), token: generation); return }
        }
        if endOfTurn {
            finishing = true
            let token = generation
            Task { await finishUtterance(token: token) }
        }
    }

    private func finishUtterance(token: Int) async {
        guard !stopped, !suspended, token == generation, let analyzer else { return }
        let startedAt = ProcessInfo.processInfo.systemUptime
        let resultsTask = self.resultsTask
        let detectionTask = self.detectionTask
        event("transcribing")
        input?.finish()
        do {
            try await analyzer.finalizeAndFinishThroughEndOfInput()
            // Finalization publishes results. Drain them before committing the text.
            await resultsTask?.value
            await detectionTask?.value
            guard !stopped, token == generation else { return }
            let text = finalizedText.trimmingCharacters(in: .whitespacesAndNewlines)
            if !text.isEmpty {
                var values: [String: Any] = ["text": text, "finalizationMs": (ProcessInfo.processInfo.systemUptime - startedAt) * 1000]
                if let firstPartialMs { values["firstPartialMs"] = firstPartialMs }
                event("final", values)
            } else { event("idle") }
        } catch { fail(error, token: token); return }
        // Reply generation can start while the next utterance preheats.
        await resumeUtterance()
    }

    private func resumeUtterance() async {
        guard !stopped, !suspended else { return }
        // openUtterance increments before its first suspension point.
        let token = generation + 1
        do { try await openUtterance() }
        catch { fail(error, token: token) }
    }

    func suspend(_ value: Bool) async {
        guard !stopped, value != suspended else { return }
        suspended = value
        if value {
            generation += 1
            input?.finish()
            resultsTask?.cancel()
            detectionTask?.cancel()
            await analyzer?.cancelAndFinishNow()
        } else {
            await resumeUtterance()
        }
    }

    func stop() async {
        stopped = true
        generation += 1
        resultsTask?.cancel()
        detectionTask?.cancel()
        input?.finish()
        await analyzer?.cancelAndFinishNow()
        analyzer = nil
        input = nil
        converter = nil
    }

    private func failure(_ message: String) -> NSError {
        NSError(domain: "AppleSpeechInput", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }

    private func fail(_ error: Error, token: Int) {
        guard !stopped, token == generation, !(error is CancellationError) else { return }
        event("error", ["message": error.localizedDescription])
        // Invalidate synchronously so no more audio can enter before the cleanup task runs.
        stopped = true
        generation += 1
        Task { await stop() }
    }
}
