import Testing
import Foundation
@testable import AutoClickerCore

@Test
func delayTriggerFiresAction() async throws {
    let engine = TriggerEngine()
    let triggerID = UUID()
    let group = TriggerGroup(
        id: UUID(),
        operator: .any,
        triggers: [
            .delay(id: triggerID, action: .start, seconds: 0.1)
        ],
        cooldownMilliseconds: 50
    )

    let fired = LockedCounter()
    await engine.start(triggerGroup: group) { action in
        if action == .start {
            await fired.increment()
        }
    }

    try await Task.sleep(nanoseconds: 500_000_000)
    await engine.stop()

    let count = await fired.value
    #expect(count >= 1)
}

actor LockedCounter {
    private(set) var value = 0
    func increment() { value += 1 }
}
