import Foundation
import CoreGraphics

@MainActor
public final class RuntimeController: ObservableObject {
    public let runtimeStore: AppRuntimeStore
    private let clickEngine: ClickEngine
    private let triggerEngine: TriggerEngine
    private let diagnosticsLogger: DiagnosticsLogger
    private let sessionRecoveryStore: SessionRecoveryStore
    private let performanceMonitor: PerformanceBudgetMonitor
    private var pollTask: Task<Void, Never>?
    private var autosaveTask: Task<Void, Never>?
    private var activeProfile: Profile?

    public init(
        runtimeStore: AppRuntimeStore = AppRuntimeStore(),
        clickEngine: ClickEngine = ClickEngine(),
        triggerEngine: TriggerEngine = TriggerEngine(),
        diagnosticsLogger: DiagnosticsLogger = DiagnosticsLogger(),
        sessionRecoveryStore: SessionRecoveryStore = SessionRecoveryStore(),
        performanceMonitor: PerformanceBudgetMonitor = PerformanceBudgetMonitor()
    ) {
        self.runtimeStore = runtimeStore
        self.clickEngine = clickEngine
        self.triggerEngine = triggerEngine
        self.diagnosticsLogger = diagnosticsLogger
        self.sessionRecoveryStore = sessionRecoveryStore
        self.performanceMonitor = performanceMonitor
    }

    public func start(profile: Profile) {
        activeProfile = profile
        runtimeStore.transition(to: .running)
        Task { await diagnosticsLogger.log("Runtime start for profile: \(profile.name)", channel: .runtime) }

        Task {
            do {
                try await clickEngine.start(
                    configuration: profile.clickEngine,
                    humanization: profile.humanization,
                    targetResolver: {
                        if let location = CGEvent(source: nil)?.location {
                            return ClickPoint(x: location.x, y: location.y)
                        }
                        return ClickPoint(x: 0, y: 0)
                    }
                )
                beginPolling()
                beginAutosave()
            } catch {
                runtimeStore.transition(to: .stopped)
                await diagnosticsLogger.log("Runtime start failed: \(error.localizedDescription)", channel: .runtime)
            }
        }
    }

    public func pauseOrResume() {
        Task {
            let state = await clickEngine.currentState()
            switch state {
            case .running:
                try? await clickEngine.pause()
                runtimeStore.transition(to: .paused)
                await diagnosticsLogger.log("Runtime paused.", channel: .runtime)
            case .paused:
                try? await clickEngine.resume()
                runtimeStore.transition(to: .running)
                await diagnosticsLogger.log("Runtime resumed.", channel: .runtime)
            default:
                break
            }
        }
    }

    public func stop() {
        Task {
            try? await clickEngine.stop()
            runtimeStore.transition(to: .stopped)
            pollTask?.cancel()
            pollTask = nil
            autosaveTask?.cancel()
            autosaveTask = nil
            try? await sessionRecoveryStore.clear()
            await diagnosticsLogger.log("Runtime stopped.", channel: .runtime)
        }
    }

    public func emergencyStop() {
        Task {
            await clickEngine.emergencyStop()
            runtimeStore.transition(to: .stopped)
            pollTask?.cancel()
            pollTask = nil
            autosaveTask?.cancel()
            autosaveTask = nil
            try? await sessionRecoveryStore.clear()
            await diagnosticsLogger.log("Emergency stop triggered.", channel: .runtime)
        }
    }

    public func armTriggers(for profile: Profile) {
        activeProfile = profile
        runtimeStore.transition(to: .armed)

        Task {
            await triggerEngine.start(triggerGroup: profile.triggerGroup) { [weak self] action in
                guard let self else { return }
                await MainActor.run {
                    switch action {
                    case .start:
                        self.start(profile: profile)
                    case .stop:
                        self.stop()
                    case .pauseResume:
                        self.pauseOrResume()
                    case .emergencyStop:
                        self.emergencyStop()
                    }
                }
            }
            await diagnosticsLogger.log("Triggers armed for profile: \(profile.name)", channel: .trigger)
        }
    }

    public func disarmTriggers() {
        Task {
            await triggerEngine.stop()
            await MainActor.run {
                if self.runtimeStore.engineState == .armed {
                    self.runtimeStore.transition(to: .idle)
                }
            }
            await diagnosticsLogger.log("Triggers disarmed.", channel: .trigger)
        }
    }

    private func beginPolling() {
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            guard let self else { return }
            var tick = 0
            while !Task.isCancelled {
                self.runtimeStore.updateRuntime()
                let clicks = await self.clickEngine.clickCounter
                await MainActor.run {
                    while self.runtimeStore.clickCount < clicks {
                        self.runtimeStore.incrementClickCount()
                    }
                }
                if tick % 30 == 0 {
                    await self.performanceMonitor.evaluateMemoryFootprint()
                }
                tick += 1
                try? await Task.sleep(nanoseconds: 150_000_000)
            }
        }
    }

    private func beginAutosave() {
        autosaveTask?.cancel()
        autosaveTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                let snapshot = RuntimeSessionSnapshot(
                    state: self.runtimeStore.engineState,
                    clickCount: self.runtimeStore.clickCount,
                    runtimeSeconds: self.runtimeStore.runtimeSeconds,
                    activeProfileID: self.activeProfile?.id
                )
                try? await self.sessionRecoveryStore.save(snapshot)
                try? await Task.sleep(nanoseconds: 2_000_000_000)
            }
        }
    }
}
