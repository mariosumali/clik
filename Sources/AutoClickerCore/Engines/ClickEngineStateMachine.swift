import Foundation

public enum EngineCommand: Sendable {
    case arm
    case start
    case pause
    case resume
    case stop
    case emergencyStop
}

public enum EngineStateMachineError: Error, LocalizedError, Sendable {
    case illegalTransition(from: EngineState, command: EngineCommand)

    public var errorDescription: String? {
        switch self {
        case let .illegalTransition(from, command):
            return "Illegal transition: \(from.rawValue) + \(command)"
        }
    }
}

public actor ClickEngineStateMachine {
    public private(set) var state: EngineState = .idle

    public init() {}

    @discardableResult
    public func transition(_ command: EngineCommand) throws -> EngineState {
        let nextState: EngineState

        switch (state, command) {
        case (.idle, .arm):
            nextState = .armed
        case (.idle, .start):
            nextState = .running
        case (.armed, .start):
            nextState = .running
        case (.running, .pause):
            nextState = .paused
        case (.paused, .resume):
            nextState = .running
        case (.running, .stop), (.paused, .stop), (.armed, .stop):
            nextState = .stopped
        case (.stopped, .arm):
            nextState = .armed
        case (.stopped, .start):
            nextState = .running
        case (_, .emergencyStop):
            nextState = .stopped
        default:
            throw EngineStateMachineError.illegalTransition(from: state, command: command)
        }

        state = nextState
        return nextState
    }
}
