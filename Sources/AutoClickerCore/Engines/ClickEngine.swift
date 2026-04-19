import Foundation
import CoreGraphics

public typealias TargetResolver = @Sendable () async throws -> ClickPoint

public actor ClickEngine {
    public private(set) var clickCounter = 0
    public private(set) var lastErrorDescription: String?

    private let stateMachine: ClickEngineStateMachine
    private let injector: any ClickInjecting
    private var humanizationEngine: HumanizationEngine?
    private var runTask: Task<Void, Never>?
    private var previousPoint: ClickPoint?
    private var config: ClickEngineConfiguration?
    private var resolver: TargetResolver?

    public init(
        stateMachine: ClickEngineStateMachine = ClickEngineStateMachine(),
        injector: any ClickInjecting = ClickEventInjector()
    ) {
        self.stateMachine = stateMachine
        self.injector = injector
    }

    public func arm() async throws {
        _ = try await stateMachine.transition(.arm)
    }

    public func start(
        configuration: ClickEngineConfiguration,
        humanization: HumanizationConfiguration,
        targetResolver: @escaping TargetResolver
    ) async throws {
        self.config = configuration
        self.resolver = targetResolver
        self.humanizationEngine = HumanizationEngine(configuration: humanization)
        self.clickCounter = 0
        self.lastErrorDescription = nil
        self.previousPoint = nil

        _ = try await stateMachine.transition(.start)
        beginLoopIfNeeded()
    }

    public func pause() async throws {
        _ = try await stateMachine.transition(.pause)
    }

    public func resume() async throws {
        _ = try await stateMachine.transition(.resume)
    }

    public func stop() async throws {
        _ = try await stateMachine.transition(.stop)
        runTask?.cancel()
        runTask = nil
    }

    public func emergencyStop() async {
        _ = try? await stateMachine.transition(.emergencyStop)
        runTask?.cancel()
        runTask = nil
    }

    public func currentState() async -> EngineState {
        await stateMachine.state
    }

    private func beginLoopIfNeeded() {
        guard runTask == nil else { return }

        runTask = Task { [weak self] in
            await self?.runLoop()
        }
    }

    private func runLoop() async {
        while !Task.isCancelled {
            let state = await stateMachine.state
            guard state == .running else {
                try? await Task.sleep(nanoseconds: 80_000_000)
                continue
            }

            guard
                let config,
                let resolver,
                let humanizationEngine
            else {
                lastErrorDescription = "Click engine started without runtime configuration."
                await emergencyStop()
                break
            }

            do {
                let basePoint = try await resolvePoint(for: config.coordinateMode, fallback: resolver)
                let baseInterval = nextBaseInterval(for: config.intervalMode)
                let humanized = await humanizationEngine.humanize(
                    basePoint: basePoint,
                    baseHoldMilliseconds: config.holdMilliseconds,
                    baseIntervalMilliseconds: baseInterval,
                    previousPoint: previousPoint
                )

                let action = ClickAction(
                    clickType: config.clickType,
                    point: humanized.point,
                    holdMilliseconds: humanized.holdMilliseconds,
                    movementPath: humanized.movementPath
                )

                try injector.perform(action)
                clickCounter += 1
                previousPoint = humanized.point

                if let loopLimit = config.loopLimit, clickCounter >= loopLimit {
                    try await stop()
                    break
                }

                try await Task.sleep(nanoseconds: UInt64(max(1, humanized.intervalMilliseconds)) * 1_000_000)
            } catch {
                lastErrorDescription = error.localizedDescription
                await emergencyStop()
                break
            }
        }
    }

    private func resolvePoint(for mode: ClickEngineConfiguration.CoordinateMode, fallback: TargetResolver) async throws -> ClickPoint {
        switch mode {
        case let .fixed(point):
            return point
        case let .relativeToActiveWindow(offset):
            // Window-aware offsets become exact coordinates once frontmost window adapters are wired.
            return offset
        case .followCursor:
            if let location = CGEvent(source: nil)?.location {
                return ClickPoint(x: location.x, y: location.y)
            }
            return try await fallback()
        case let .randomInBoundingBox(rect):
            let x = Double.random(in: rect.x...(rect.x + rect.width))
            let y = Double.random(in: rect.y...(rect.y + rect.height))
            return ClickPoint(x: x, y: y)
        }
    }

    private func nextBaseInterval(for mode: ClickEngineConfiguration.IntervalMode) -> Int {
        switch mode {
        case let .fixed(milliseconds):
            return max(1, milliseconds)
        case let .randomRange(minMilliseconds, maxMilliseconds):
            return Int.random(in: max(1, minMilliseconds)...max(1, maxMilliseconds))
        case let .gaussian(meanMilliseconds, sigma):
            let u1 = max(Double.leastNonzeroMagnitude, Double.random(in: 0...1))
            let u2 = Double.random(in: 0...1)
            let z = sqrt(-2 * log(u1)) * cos(2 * .pi * u2)
            let sample = Double(meanMilliseconds) + z * sigma
            return max(1, Int(sample.rounded()))
        }
    }
}
