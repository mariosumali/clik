import Foundation
import AppKit
import CoreGraphics

public struct TriggerEvaluationContext: Sendable {
    public var targetingEngine: TargetingEngine
    public var targetingConfigForEventChecks: @Sendable (Trigger) -> TargetingConfiguration
    public var now: @Sendable () -> Date

    public init(
        targetingEngine: TargetingEngine = TargetingEngine(),
        targetingConfigForEventChecks: @escaping @Sendable (Trigger) -> TargetingConfiguration = { _ in .default },
        now: @escaping @Sendable () -> Date = { Date() }
    ) {
        self.targetingEngine = targetingEngine
        self.targetingConfigForEventChecks = targetingConfigForEventChecks
        self.now = now
    }
}

public actor TriggerEngine {
    private var runTask: Task<Void, Never>?
    private var chainTasks: [Task<Void, Never>] = []
    private var triggerLastFiredAt: [UUID: Date] = [:]
    private var groupLastFiredAt: [UUID: Date] = [:]
    private var triggerArmedAt: [UUID: Date] = [:]
    private var lastClipboardChangeCount: Int = NSPasteboard.general.changeCount

    public init() {}

    public func start(
        triggerGroup: TriggerGroup,
        context: TriggerEvaluationContext = TriggerEvaluationContext(),
        actionHandler: @escaping @Sendable (TriggerGroup.TriggerAction) async -> Void
    ) {
        stop()

        runTask = Task { [weak self] in
            guard let self else { return }
            await self.evaluationLoop(group: triggerGroup, context: context, actionHandler: actionHandler)
        }
    }

    public func stop() {
        runTask?.cancel()
        runTask = nil
        chainTasks.forEach { $0.cancel() }
        chainTasks.removeAll()
    }

    private func evaluationLoop(
        group: TriggerGroup,
        context: TriggerEvaluationContext,
        actionHandler: @escaping @Sendable (TriggerGroup.TriggerAction) async -> Void
    ) async {
        while !Task.isCancelled {
            do {
                if let fired = try await evaluate(group: group, context: context) {
                    await queueChain(for: fired, actionHandler: actionHandler)
                }
                try await Task.sleep(nanoseconds: 200_000_000)
            } catch {
                try? await Task.sleep(nanoseconds: 500_000_000)
            }
        }
    }

    private func evaluate(group: TriggerGroup, context: TriggerEvaluationContext) async throws -> [Trigger]? {
        let now = context.now()

        if let groupLastFired = groupLastFiredAt[group.id] {
            let delta = now.timeIntervalSince(groupLastFired)
            if delta < Double(group.cooldownMilliseconds) / 1000 {
                return nil
            }
        }

        var fired: [Trigger] = []
        for trigger in group.triggers {
            let isTriggered = try await evaluate(trigger: trigger, context: context, now: now)
            if isTriggered {
                fired.append(trigger)
                if group.operator == .any { break }
            } else if group.operator == .all {
                fired.removeAll()
                break
            }
        }

        guard !fired.isEmpty else { return nil }
        groupLastFiredAt[group.id] = now
        return fired
    }

    private func evaluate(trigger: Trigger, context: TriggerEvaluationContext, now: Date) async throws -> Bool {
        guard let id = trigger.id else { return false }

        if let lastFired = triggerLastFiredAt[id] {
            let cooldown = 0.15
            if now.timeIntervalSince(lastFired) < cooldown {
                return false
            }
        }

        let didFire: Bool
        switch trigger {
        case let .hotkey(_, _, key, modifiers):
            didFire = HotkeyStatePoller.isPressed(key: key, modifiers: modifiers)
        case let .delay(triggerID, _, seconds):
            let armedAt = triggerArmedAt[triggerID] ?? now
            triggerArmedAt[triggerID] = armedAt
            didFire = now.timeIntervalSince(armedAt) >= seconds
        case let .schedule(_, _, cron):
            didFire = CronMatcher.matches(now: now, cron: cron)
        case .imageAppears:
            let config = context.targetingConfigForEventChecks(trigger)
            didFire = (try? await context.targetingEngine.resolve(config: config)) != nil
        case .colorDetected:
            let config = context.targetingConfigForEventChecks(trigger)
            didFire = (try? await context.targetingEngine.resolve(config: config)) != nil
        case let .frontmostApp(_, _, bundleID):
            didFire = NSWorkspace.shared.frontmostApplication?.bundleIdentifier == bundleID
        case let .clipboardChanged(_, _, contains):
            let pasteboard = NSPasteboard.general
            let changed = pasteboard.changeCount != lastClipboardChangeCount
            lastClipboardChangeCount = pasteboard.changeCount
            let content = pasteboard.string(forType: .string) ?? ""
            didFire = changed && content.localizedCaseInsensitiveContains(contains)
        case .audioDetected:
            // CoreAudio threshold monitoring is pluggable; default runtime keeps this disabled until adapter is wired.
            didFire = false
        }

        if didFire {
            triggerLastFiredAt[id] = now
        }
        return didFire
    }

    private func queueChain(
        for firedTriggers: [Trigger],
        actionHandler: @escaping @Sendable (TriggerGroup.TriggerAction) async -> Void
    ) async {
        let task = Task {
            for trigger in firedTriggers {
                guard !Task.isCancelled else { break }
                if trigger.action == .emergencyStop {
                    chainTasks.forEach { $0.cancel() }
                }
                await actionHandler(trigger.action)
                try? await Task.sleep(nanoseconds: 120_000_000)
            }
        }

        chainTasks.append(task)
        chainTasks.removeAll { $0.isCancelled }
    }
}

private enum HotkeyStatePoller {
    static func isPressed(key: String, modifiers: [String]) -> Bool {
        guard let keyCode = keyCode(for: key) else { return false }
        let keyDown = CGEventSource.keyState(.combinedSessionState, key: keyCode)
        if !keyDown { return false }

        let flags = NSEvent.modifierFlags
        return modifiers.allSatisfy { modifier in
            switch modifier.lowercased() {
            case "shift":
                return flags.contains(.shift)
            case "cmd", "command":
                return flags.contains(.command)
            case "ctrl", "control":
                return flags.contains(.control)
            case "alt", "option":
                return flags.contains(.option)
            default:
                return true
            }
        }
    }

    static func keyCode(for key: String) -> CGKeyCode? {
        switch key.lowercased() {
        case "f1": return 122
        case "f2": return 120
        case "f3": return 99
        case "f4": return 118
        case "f5": return 96
        case "f6": return 97
        case "f7": return 98
        case "f8": return 100
        case "f9": return 101
        case "f10": return 109
        case "f11": return 103
        case "f12": return 111
        default:
            return nil
        }
    }
}

private enum CronMatcher {
    static func matches(now: Date, cron: String) -> Bool {
        let parts = cron.split(separator: " ")
        guard parts.count == 5 else { return false }
        let calendar = Calendar.current
        let values = calendar.dateComponents([.minute, .hour, .day, .month, .weekday], from: now)

        let minute = values.minute ?? -1
        let hour = values.hour ?? -1
        let day = values.day ?? -1
        let month = values.month ?? -1
        let weekday = ((values.weekday ?? 1) + 5) % 7 // 0-based Monday first

        return fieldMatches(parts[0], value: minute)
            && fieldMatches(parts[1], value: hour)
            && fieldMatches(parts[2], value: day)
            && fieldMatches(parts[3], value: month)
            && fieldMatches(parts[4], value: weekday)
    }

    private static func fieldMatches(_ field: Substring, value: Int) -> Bool {
        if field == "*" { return true }
        if let int = Int(field) { return int == value }

        if field.contains(",") {
            return field.split(separator: ",").contains { Int($0) == value }
        }

        if field.contains("/") {
            let parts = field.split(separator: "/")
            guard parts.count == 2, parts[0] == "*", let stride = Int(parts[1]), stride > 0 else {
                return false
            }
            return value % stride == 0
        }

        return false
    }
}

private extension Trigger {
    var id: UUID? {
        switch self {
        case let .hotkey(id, _, _, _),
            let .delay(id, _, _),
            let .schedule(id, _, _),
            let .imageAppears(id, _, _, _),
            let .colorDetected(id, _, _, _),
            let .frontmostApp(id, _, _),
            let .clipboardChanged(id, _, _),
            let .audioDetected(id, _, _):
            return id
        }
    }
}
