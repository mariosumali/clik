import Foundation
import Combine

public final class AppRuntimeStore: ObservableObject {
    @Published public private(set) var engineState: EngineState = .idle
    @Published public private(set) var clickCount: Int = 0
    @Published public private(set) var clicksPerSecond: Double = 0
    @Published public private(set) var runtimeSeconds: TimeInterval = 0
    @Published public var activeProfileID: UUID?

    private var runtimeStartDate: Date?

    public init() {}

    public func transition(to newState: EngineState) {
        engineState = newState
        if newState == .running && runtimeStartDate == nil {
            runtimeStartDate = Date()
        } else if newState != .running {
            runtimeStartDate = nil
            clicksPerSecond = 0
        }
    }

    public func incrementClickCount() {
        clickCount += 1
    }

    public func updateRuntime() {
        guard let runtimeStartDate else {
            runtimeSeconds = 0
            return
        }

        runtimeSeconds = Date().timeIntervalSince(runtimeStartDate)
        clicksPerSecond = runtimeSeconds > 0 ? Double(clickCount) / runtimeSeconds : 0
    }

    public func resetSession() {
        clickCount = 0
        clicksPerSecond = 0
        runtimeSeconds = 0
        runtimeStartDate = nil
        engineState = .idle
    }
}
