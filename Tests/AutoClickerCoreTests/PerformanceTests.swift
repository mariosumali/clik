import Testing
import Foundation
@testable import AutoClickerCore

@Test
func linearProjectionRunsUnderBudget() {
    let ids = (0..<2000).map { _ in UUID() }
    let nodes = (0..<2000).map { index -> MacroNode in
        let id = ids[index]
        let next = index < 1999 ? ids[index + 1] : nil
        return MacroNode(
            id: id,
            title: "Node \(index)",
            kind: .wait(milliseconds: 1, next: next),
            position: MacroNodePosition(x: Double(index), y: 0)
        )
    }

    let graph = MacroGraph(
        name: "Perf",
        entryNodeID: nodes.first?.id ?? UUID(),
        nodes: nodes
    )

    let start = Date()
    _ = graph.linearProjection(limit: 500)
    let elapsed = Date().timeIntervalSince(start)
    #expect(elapsed < 0.15)
}
