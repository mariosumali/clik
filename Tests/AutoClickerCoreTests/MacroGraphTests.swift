import Testing
import Foundation
@testable import AutoClickerCore

@Test
func starterGraphIsValid() {
    let graph = MacroGraph.starter
    #expect(graph.validate().isEmpty)
    #expect(!graph.linearProjection().isEmpty)
}

@Test
func missingEntryFailsValidation() {
    let nodeID = UUID()
    let graph = MacroGraph(
        name: "Broken",
        entryNodeID: UUID(),
        nodes: [
            MacroNode(
                id: nodeID,
                title: "Wait",
                kind: .wait(milliseconds: 50, next: nil),
                position: MacroNodePosition(x: 0, y: 0)
            )
        ]
    )

    #expect(graph.validate().contains(.missingEntry))
}

@Test
func orphanNodeFailsValidation() {
    let entry = UUID()
    let orphan = UUID()
    let graph = MacroGraph(
        name: "Orphan",
        entryNodeID: entry,
        nodes: [
            MacroNode(
                id: entry,
                title: "Click",
                kind: .click(button: .left, pointMode: .followRuntimeTarget, holdMilliseconds: 20, next: nil),
                position: MacroNodePosition(x: 0, y: 0)
            ),
            MacroNode(
                id: orphan,
                title: "Orphan",
                kind: .wait(milliseconds: 30, next: nil),
                position: MacroNodePosition(x: 100, y: 0)
            )
        ]
    )

    #expect(graph.validate().contains(.orphanNode(orphan)))
}
