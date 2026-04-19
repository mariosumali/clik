import Foundation

public enum EngineState: String, Codable, CaseIterable, Sendable {
    case idle
    case armed
    case running
    case paused
    case stopped
}
