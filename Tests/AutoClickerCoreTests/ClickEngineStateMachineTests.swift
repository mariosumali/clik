import Testing
import Foundation
@testable import AutoClickerCore

@Test
func legalStateMachineTransitions() async throws {
    let machine = ClickEngineStateMachine()
    #expect(await machine.state == .idle)

    _ = try await machine.transition(.arm)
    #expect(await machine.state == .armed)

    _ = try await machine.transition(.start)
    #expect(await machine.state == .running)

    _ = try await machine.transition(.pause)
    #expect(await machine.state == .paused)

    _ = try await machine.transition(.resume)
    #expect(await machine.state == .running)

    _ = try await machine.transition(.stop)
    #expect(await machine.state == .stopped)
}

@Test
func illegalTransitionThrows() async {
    let machine = ClickEngineStateMachine()
    do {
        _ = try await machine.transition(.pause)
        #expect(Bool(false), "Expected illegal transition.")
    } catch {
        #expect(error is EngineStateMachineError)
    }
}

@Test
func emergencyStopAlwaysWorks() async throws {
    let machine = ClickEngineStateMachine()
    _ = try await machine.transition(.start)
    _ = try await machine.transition(.emergencyStop)
    #expect(await machine.state == .stopped)
}
