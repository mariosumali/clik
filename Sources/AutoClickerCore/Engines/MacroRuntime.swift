import Foundation
import CoreGraphics

public enum MacroLoopBehavior: Sendable {
    case finite(Int)
    case infinite
    case untilCondition(@Sendable () async -> Bool)
}

public protocol MacroActionExecuting: Sendable {
    func execute(_ node: MacroNode, context: MacroRuntimeContext) async throws
}

public struct MacroRuntimeContext: Sendable {
    public var clickCounter: @Sendable () async -> Int
    public var resolveRuntimeTarget: @Sendable () async -> ClickPoint

    public init(
        clickCounter: @escaping @Sendable () async -> Int,
        resolveRuntimeTarget: @escaping @Sendable () async -> ClickPoint
    ) {
        self.clickCounter = clickCounter
        self.resolveRuntimeTarget = resolveRuntimeTarget
    }
}

public final class DefaultMacroActionExecutor: @unchecked Sendable, MacroActionExecuting {
    private let injector: any ClickInjecting

    public init(injector: any ClickInjecting = ClickEventInjector()) {
        self.injector = injector
    }

    public func execute(_ node: MacroNode, context: MacroRuntimeContext) async throws {
        switch node.kind {
        case let .click(button, pointMode, holdMilliseconds, _):
            let point = await resolvePoint(mode: pointMode, context: context)
            try injector.perform(
                ClickAction(
                    clickType: button.clickType,
                    point: point,
                    holdMilliseconds: holdMilliseconds,
                    movementPath: [point]
                )
            )
        case let .move(pointMode, _):
            let point = await resolvePoint(mode: pointMode, context: context)
            try injector.perform(
                ClickAction(
                    clickType: .left,
                    point: point,
                    holdMilliseconds: 1,
                    movementPath: [point]
                )
            )
        case let .scroll(lines, _):
            let direction: Int32 = lines >= 0 ? Int32(lines) : Int32(lines)
            guard let event = CGEvent(scrollWheelEvent2Source: nil, units: .line, wheelCount: 1, wheel1: direction, wheel2: 0, wheel3: 0) else {
                return
            }
            event.post(tap: .cghidEventTap)
        case let .keyPress(key, modifiers, _):
            try postKeyPress(key: key, modifiers: modifiers)
        case let .wait(milliseconds, _):
            try await Task.sleep(nanoseconds: UInt64(max(1, milliseconds)) * 1_000_000)
        case .branch, .loop, .setVariable, .screenshot, .subroutineCall:
            break
        }
    }

    private func resolvePoint(mode: MacroPointMode, context: MacroRuntimeContext) async -> ClickPoint {
        switch mode {
        case let .fixed(point):
            return point
        case .followRuntimeTarget:
            return await context.resolveRuntimeTarget()
        case .followCursor:
            if let point = CGEvent(source: nil)?.location {
                return ClickPoint(x: point.x, y: point.y)
            }
            return await context.resolveRuntimeTarget()
        }
    }

    private func postKeyPress(key: String, modifiers: [String]) throws {
        guard let keyCode = keyCodeMap[key.lowercased()] else { return }
        guard let down = CGEvent(keyboardEventSource: nil, virtualKey: keyCode, keyDown: true),
              let up = CGEvent(keyboardEventSource: nil, virtualKey: keyCode, keyDown: false) else {
            throw CocoaError(.coderInvalidValue)
        }

        let flags = modifiers.reduce(CGEventFlags()) { partial, modifier in
            partial.union(flag(for: modifier))
        }
        down.flags = flags
        up.flags = flags
        down.post(tap: .cghidEventTap)
        up.post(tap: .cghidEventTap)
    }

    private func flag(for modifier: String) -> CGEventFlags {
        switch modifier.lowercased() {
        case "cmd", "command":
            return .maskCommand
        case "shift":
            return .maskShift
        case "alt", "option":
            return .maskAlternate
        case "ctrl", "control":
            return .maskControl
        default:
            return []
        }
    }

    private let keyCodeMap: [String: CGKeyCode] = [
        "a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5, "z": 6, "x": 7, "c": 8, "v": 9,
        "b": 11, "q": 12, "w": 13, "e": 14, "r": 15, "y": 16, "t": 17, "1": 18, "2": 19,
        "3": 20, "4": 21, "6": 22, "5": 23, "=": 24, "9": 25, "7": 26, "-": 27, "8": 28,
        "0": 29, "]": 30, "o": 31, "u": 32, "[": 33, "i": 34, "p": 35, "l": 37, "j": 38,
        "'": 39, "k": 40, ";": 41, "\\": 42, ",": 43, "/": 44, "n": 45, "m": 46, ".": 47,
        "tab": 48, "space": 49, "return": 36, "esc": 53
    ]
}

public actor MacroRuntime {
    public private(set) var isRunning = false
    public private(set) var currentNodeID: UUID?

    private var runTask: Task<Void, Never>?
    private let actionExecutor: any MacroActionExecuting
    private var variables: [String: MacroValue] = [:]

    public init(actionExecutor: any MacroActionExecuting = DefaultMacroActionExecutor()) {
        self.actionExecutor = actionExecutor
    }

    public func start(
        graph: MacroGraph,
        speedMultiplier: Double = 1.0,
        loopBehavior: MacroLoopBehavior = .finite(1),
        context: MacroRuntimeContext
    ) {
        guard !isRunning else { return }
        isRunning = true

        runTask = Task { [weak self] in
            guard let self else { return }
            await self.execute(graph: graph, speedMultiplier: speedMultiplier, loopBehavior: loopBehavior, context: context)
        }
    }

    public func stop() {
        runTask?.cancel()
        runTask = nil
        isRunning = false
        currentNodeID = nil
    }

    private func execute(
        graph: MacroGraph,
        speedMultiplier: Double,
        loopBehavior: MacroLoopBehavior,
        context: MacroRuntimeContext
    ) async {
        let nodeMap = Dictionary(uniqueKeysWithValues: graph.nodes.map { ($0.id, $0) })
        let loops = loopBehavior.loopLimit
        var iteration = 0

        while !Task.isCancelled {
            if let loops, iteration >= loops { break }
            if case let .untilCondition(condition) = loopBehavior, await condition() { break }

            var cursor: UUID? = graph.entryNodeID
            var localVisited = Set<UUID>()

            while let id = cursor, !Task.isCancelled {
                guard let node = nodeMap[id] else { break }
                currentNodeID = id
                localVisited.insert(id)

                do {
                    try await actionExecutor.execute(node, context: context)
                    cursor = try await nextNodeID(from: node, context: context)
                } catch {
                    stop()
                    return
                }

                if localVisited.count > nodeMap.count * 4 {
                    break
                }

                if speedMultiplier > 0, speedMultiplier != 1 {
                    let sleep = UInt64(max(1, Int(10.0 / speedMultiplier)))
                    try? await Task.sleep(nanoseconds: sleep * 1_000_000)
                }
            }

            iteration += 1
            if case .infinite = loopBehavior {
                continue
            }
        }

        stop()
    }

    private func nextNodeID(from node: MacroNode, context: MacroRuntimeContext) async throws -> UUID? {
        switch node.kind {
        case let .click(_, _, _, next),
            let .move(_, next),
            let .scroll(_, next),
            let .keyPress(_, _, next),
            let .wait(_, next),
            let .setVariable(_, _, next),
            let .screenshot(_, next),
            let .subroutineCall(_, next):
            return next
        case let .branch(condition, trueNext, falseNext):
            return try await evaluate(condition: condition, context: context) ? trueNext : falseNext
        case let .loop(variable, count, bodyEntry, next):
            let current = (variables[variable] ?? .int(0)).intValue ?? 0
            if current < count {
                variables[variable] = .int(current + 1)
                return bodyEntry
            } else {
                variables[variable] = .int(0)
                return next
            }
        }
    }

    private func evaluate(condition: MacroCondition, context: MacroRuntimeContext) async throws -> Bool {
        switch condition {
        case let .clickCountAtLeast(target):
            return await context.clickCounter() >= target
        case let .variableCompare(name, comparison, value):
            guard let current = variables[name] else { return false }
            return compare(lhs: current, rhs: value, operation: comparison)
        case .colorMatch, .imageMatch:
            return false
        }
    }

    private func compare(lhs: MacroValue, rhs: MacroValue, operation: Comparison) -> Bool {
        if let left = lhs.doubleValue, let right = rhs.doubleValue {
            switch operation {
            case .equal: return left == right
            case .notEqual: return left != right
            case .greaterThan: return left > right
            case .greaterThanOrEqual: return left >= right
            case .lessThan: return left < right
            case .lessThanOrEqual: return left <= right
            }
        }

        if case let .string(left) = lhs, case let .string(right) = rhs {
            switch operation {
            case .equal: return left == right
            case .notEqual: return left != right
            default: return false
            }
        }

        if case let .bool(left) = lhs, case let .bool(right) = rhs {
            switch operation {
            case .equal: return left == right
            case .notEqual: return left != right
            default: return false
            }
        }

        return false
    }
}

private extension MacroLoopBehavior {
    var loopLimit: Int? {
        switch self {
        case let .finite(count):
            return max(0, count)
        case .infinite, .untilCondition:
            return nil
        }
    }
}

private extension MacroMouseButton {
    var clickType: ClickEngineConfiguration.ClickType {
        switch self {
        case .left:
            return .left
        case .right:
            return .right
        case .middle:
            return .middle
        }
    }
}

private extension MacroValue {
    var intValue: Int? {
        switch self {
        case let .int(value):
            return value
        case let .float(value):
            return Int(value)
        case let .bool(value):
            return value ? 1 : 0
        case .string:
            return nil
        }
    }

    var doubleValue: Double? {
        switch self {
        case let .int(value):
            return Double(value)
        case let .float(value):
            return value
        case let .bool(value):
            return value ? 1 : 0
        case .string:
            return nil
        }
    }
}
