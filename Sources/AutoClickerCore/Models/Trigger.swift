import Foundation

public struct TriggerGroup: Codable, Hashable, Sendable {
    public enum GroupOperator: String, Codable, Sendable {
        case any
        case all
    }

    public enum TriggerAction: String, Codable, Sendable {
        case start
        case stop
        case pauseResume
        case emergencyStop
    }

    public var id: UUID
    public var `operator`: GroupOperator
    public var triggers: [Trigger]
    public var cooldownMilliseconds: Int

    public init(id: UUID = UUID(), operator: GroupOperator, triggers: [Trigger], cooldownMilliseconds: Int) {
        self.id = id
        self.operator = `operator`
        self.triggers = triggers
        self.cooldownMilliseconds = cooldownMilliseconds
    }

    public static let `default` = TriggerGroup(
        operator: .any,
        triggers: [
            .hotkey(
                id: UUID(),
                action: .start,
                key: "f8",
                modifiers: []
            )
        ],
        cooldownMilliseconds: 150
    )
}

public enum Trigger: Codable, Hashable, Sendable {
    case hotkey(id: UUID, action: TriggerGroup.TriggerAction, key: String, modifiers: [String])
    case delay(id: UUID, action: TriggerGroup.TriggerAction, seconds: Double)
    case schedule(id: UUID, action: TriggerGroup.TriggerAction, cron: String)
    case imageAppears(id: UUID, action: TriggerGroup.TriggerAction, templateID: UUID, confidence: Double)
    case colorDetected(id: UUID, action: TriggerGroup.TriggerAction, hex: String, tolerance: Double)
    case frontmostApp(id: UUID, action: TriggerGroup.TriggerAction, bundleID: String)
    case clipboardChanged(id: UUID, action: TriggerGroup.TriggerAction, contains: String)
    case audioDetected(id: UUID, action: TriggerGroup.TriggerAction, threshold: Double)

    public var action: TriggerGroup.TriggerAction {
        switch self {
        case let .hotkey(_, action, _, _),
            let .delay(_, action, _),
            let .schedule(_, action, _),
            let .imageAppears(_, action, _, _),
            let .colorDetected(_, action, _, _),
            let .frontmostApp(_, action, _),
            let .clipboardChanged(_, action, _),
            let .audioDetected(_, action, _):
            return action
        }
    }
}
