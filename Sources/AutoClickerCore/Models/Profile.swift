import Foundation

public struct Profile: Identifiable, Codable, Hashable, Sendable {
    public var id: UUID
    public var name: String
    public var accentHexColor: String
    public var clickEngine: ClickEngineConfiguration
    public var targeting: TargetingConfiguration
    public var humanization: HumanizationConfiguration
    public var triggerGroup: TriggerGroup
    public var macroGraphID: UUID?
    public var createdAt: Date
    public var updatedAt: Date

    public init(
        id: UUID = UUID(),
        name: String,
        accentHexColor: String = "#00FF88",
        clickEngine: ClickEngineConfiguration = .default,
        targeting: TargetingConfiguration = .default,
        humanization: HumanizationConfiguration = .default,
        triggerGroup: TriggerGroup = .default,
        macroGraphID: UUID? = nil,
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.name = name
        self.accentHexColor = accentHexColor
        self.clickEngine = clickEngine
        self.targeting = targeting
        self.humanization = humanization
        self.triggerGroup = triggerGroup
        self.macroGraphID = macroGraphID
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

public struct ClickEngineConfiguration: Codable, Hashable, Sendable {
    public enum ClickType: String, Codable, CaseIterable, Sendable {
        case left
        case right
        case middle
        case double
        case hold
        case drag
        case scroll
    }

    public enum IntervalMode: Codable, Hashable, Sendable {
        case fixed(milliseconds: Int)
        case randomRange(minMilliseconds: Int, maxMilliseconds: Int)
        case gaussian(meanMilliseconds: Int, sigma: Double)
    }

    public enum CoordinateMode: Codable, Hashable, Sendable {
        case fixed(point: ClickPoint)
        case relativeToActiveWindow(offset: ClickPoint)
        case followCursor
        case randomInBoundingBox(rect: ClickRect)
    }

    public var clickType: ClickType
    public var intervalMode: IntervalMode
    public var coordinateMode: CoordinateMode
    public var holdMilliseconds: Int
    public var loopLimit: Int?

    public init(
        clickType: ClickType,
        intervalMode: IntervalMode,
        coordinateMode: CoordinateMode,
        holdMilliseconds: Int,
        loopLimit: Int?
    ) {
        self.clickType = clickType
        self.intervalMode = intervalMode
        self.coordinateMode = coordinateMode
        self.holdMilliseconds = holdMilliseconds
        self.loopLimit = loopLimit
    }

    public static let `default` = ClickEngineConfiguration(
        clickType: .left,
        intervalMode: .fixed(milliseconds: 120),
        coordinateMode: .followCursor,
        holdMilliseconds: 50,
        loopLimit: nil
    )
}

public struct ClickPoint: Codable, Hashable, Sendable {
    public var x: Double
    public var y: Double

    public init(x: Double, y: Double) {
        self.x = x
        self.y = y
    }
}

public struct ClickRect: Codable, Hashable, Sendable {
    public var x: Double
    public var y: Double
    public var width: Double
    public var height: Double

    public init(x: Double, y: Double, width: Double, height: Double) {
        self.x = x
        self.y = y
        self.width = width
        self.height = height
    }
}
