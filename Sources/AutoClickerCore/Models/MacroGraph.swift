import Foundation

public struct MacroGraph: Identifiable, Codable, Hashable, Sendable {
    public var schemaVersion: Int
    public var id: UUID
    public var name: String
    public var entryNodeID: UUID
    public var nodes: [MacroNode]
    public var updatedAt: Date

    public init(
        schemaVersion: Int = 1,
        id: UUID = UUID(),
        name: String,
        entryNodeID: UUID,
        nodes: [MacroNode],
        updatedAt: Date = Date()
    ) {
        self.schemaVersion = schemaVersion
        self.id = id
        self.name = name
        self.entryNodeID = entryNodeID
        self.nodes = nodes
        self.updatedAt = updatedAt
    }

    public static var starter: MacroGraph {
        let clickID = UUID()
        let waitID = UUID()
        return MacroGraph(
            name: "Starter Macro",
            entryNodeID: clickID,
            nodes: [
                MacroNode(
                    id: clickID,
                    title: "Left Click",
                    kind: .click(
                        button: .left,
                        pointMode: .followRuntimeTarget,
                        holdMilliseconds: 50,
                        next: waitID
                    ),
                    position: MacroNodePosition(x: 120, y: 120)
                ),
                MacroNode(
                    id: waitID,
                    title: "Wait 250ms",
                    kind: .wait(milliseconds: 250, next: clickID),
                    position: MacroNodePosition(x: 340, y: 120)
                )
            ]
        )
    }
}

public struct MacroNode: Identifiable, Codable, Hashable, Sendable {
    public var id: UUID
    public var title: String
    public var kind: MacroNodeKind
    public var position: MacroNodePosition

    public init(id: UUID, title: String, kind: MacroNodeKind, position: MacroNodePosition) {
        self.id = id
        self.title = title
        self.kind = kind
        self.position = position
    }
}

public struct MacroNodePosition: Codable, Hashable, Sendable {
    public var x: Double
    public var y: Double

    public init(x: Double, y: Double) {
        self.x = x
        self.y = y
    }
}

public enum MacroNodeKind: Codable, Hashable, Sendable {
    case click(button: MacroMouseButton, pointMode: MacroPointMode, holdMilliseconds: Int, next: UUID?)
    case move(pointMode: MacroPointMode, next: UUID?)
    case scroll(lines: Int, next: UUID?)
    case keyPress(key: String, modifiers: [String], next: UUID?)
    case wait(milliseconds: Int, next: UUID?)
    case branch(condition: MacroCondition, trueNext: UUID?, falseNext: UUID?)
    case loop(variable: String, count: Int, bodyEntry: UUID?, next: UUID?)
    case setVariable(name: String, value: MacroValue, next: UUID?)
    case screenshot(name: String, next: UUID?)
    case subroutineCall(name: String, next: UUID?)

    public var nextNodeCandidates: [UUID] {
        switch self {
        case let .click(_, _, _, next),
            let .move(_, next),
            let .scroll(_, next),
            let .keyPress(_, _, next),
            let .wait(_, next),
            let .setVariable(_, _, next),
            let .screenshot(_, next),
            let .subroutineCall(_, next):
            return [next].compactMap { $0 }
        case let .branch(_, trueNext, falseNext):
            return [trueNext, falseNext].compactMap { $0 }
        case let .loop(_, _, bodyEntry, next):
            return [bodyEntry, next].compactMap { $0 }
        }
    }
}

public enum MacroMouseButton: String, Codable, Sendable {
    case left
    case right
    case middle
}

public enum MacroPointMode: Codable, Hashable, Sendable {
    case fixed(ClickPoint)
    case followRuntimeTarget
    case followCursor
}

public enum MacroCondition: Codable, Hashable, Sendable {
    case colorMatch(hex: String, tolerance: Double)
    case imageMatch(templateID: UUID, confidence: Double)
    case variableCompare(name: String, comparison: Comparison, value: MacroValue)
    case clickCountAtLeast(Int)
}

public enum Comparison: String, Codable, CaseIterable, Sendable {
    case equal
    case notEqual
    case greaterThan
    case greaterThanOrEqual
    case lessThan
    case lessThanOrEqual
}

public enum MacroValue: Codable, Hashable, Sendable {
    case int(Int)
    case float(Double)
    case bool(Bool)
    case string(String)
}

public struct MacroLinearStep: Identifiable, Hashable, Sendable {
    public var id: UUID
    public var title: String
    public var depth: Int
    public var kindDescription: String

    public init(id: UUID, title: String, depth: Int, kindDescription: String) {
        self.id = id
        self.title = title
        self.depth = depth
        self.kindDescription = kindDescription
    }
}

public enum MacroValidationIssue: Error, Hashable, Sendable {
    case missingEntry
    case missingNodeReference(UUID)
    case orphanNode(UUID)
}

public extension MacroGraph {
    func validate() -> [MacroValidationIssue] {
        let nodeMap = Dictionary(uniqueKeysWithValues: nodes.map { ($0.id, $0) })
        guard nodeMap[entryNodeID] != nil else { return [.missingEntry] }

        var issues: [MacroValidationIssue] = []
        var visited = Set<UUID>()

        func walk(_ id: UUID) {
            guard !visited.contains(id), let node = nodeMap[id] else { return }
            visited.insert(id)
            for next in node.kind.nextNodeCandidates {
                guard nodeMap[next] != nil else {
                    issues.append(.missingNodeReference(next))
                    continue
                }
                walk(next)
            }
        }

        walk(entryNodeID)

        for node in nodes where !visited.contains(node.id) {
            issues.append(.orphanNode(node.id))
        }
        return issues
    }

    func linearProjection(limit: Int = 200) -> [MacroLinearStep] {
        let nodeMap = Dictionary(uniqueKeysWithValues: nodes.map { ($0.id, $0) })
        var queue: [(UUID, Int)] = [(entryNodeID, 0)]
        var visited = Set<UUID>()
        var steps: [MacroLinearStep] = []

        while !queue.isEmpty && steps.count < limit {
            let (id, depth) = queue.removeFirst()
            guard let node = nodeMap[id], !visited.contains(id) else { continue }
            visited.insert(id)

            steps.append(
                MacroLinearStep(
                    id: node.id,
                    title: node.title,
                    depth: depth,
                    kindDescription: node.kind.summary
                )
            )

            for next in node.kind.nextNodeCandidates {
                queue.append((next, depth + 1))
            }
        }

        return steps
    }
}

private extension MacroNodeKind {
    var summary: String {
        switch self {
        case .click:
            return "Click"
        case .move:
            return "Move"
        case .scroll:
            return "Scroll"
        case .keyPress:
            return "Key Press"
        case .wait:
            return "Wait"
        case .branch:
            return "Branch"
        case .loop:
            return "Loop"
        case .setVariable:
            return "Set Variable"
        case .screenshot:
            return "Screenshot"
        case .subroutineCall:
            return "Subroutine Call"
        }
    }
}
