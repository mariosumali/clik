import Foundation
import AppKit

public struct RecordedMacroEvent: Codable, Hashable, Sendable {
    public enum EventKind: Codable, Hashable, Sendable {
        case click(point: ClickPoint)
        case move(point: ClickPoint)
        case scroll(deltaY: Double)
        case keyPress(key: String)
    }

    public var kind: EventKind
    public var timestamp: Date

    public init(kind: EventKind, timestamp: Date) {
        self.kind = kind
        self.timestamp = timestamp
    }
}

@MainActor
public final class MacroRecorder: ObservableObject {
    @Published public private(set) var isRecording = false
    @Published public private(set) var events: [RecordedMacroEvent] = []

    private var monitors: [Any] = []

    public init() {}

    public func startRecording() {
        guard !isRecording else { return }
        isRecording = true
        events.removeAll()

        let mouseMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] event in
            let point = ClickPoint(x: event.locationInWindow.x, y: event.locationInWindow.y)
            self?.events.append(RecordedMacroEvent(kind: .click(point: point), timestamp: Date()))
        }

        let moveMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.mouseMoved, .leftMouseDragged]) { [weak self] event in
            let point = ClickPoint(x: event.locationInWindow.x, y: event.locationInWindow.y)
            self?.events.append(RecordedMacroEvent(kind: .move(point: point), timestamp: Date()))
        }

        let scrollMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.scrollWheel]) { [weak self] event in
            self?.events.append(RecordedMacroEvent(kind: .scroll(deltaY: event.scrollingDeltaY), timestamp: Date()))
        }

        let keyMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.keyDown]) { [weak self] event in
            let key = event.charactersIgnoringModifiers ?? ""
            self?.events.append(RecordedMacroEvent(kind: .keyPress(key: key), timestamp: Date()))
        }

        [mouseMonitor, moveMonitor, scrollMonitor, keyMonitor].forEach { monitor in
            if let monitor {
                monitors.append(monitor)
            }
        }
    }

    public func stopRecording(name: String = "Recorded Macro") -> MacroGraph {
        defer {
            removeMonitors()
            isRecording = false
        }

        guard !events.isEmpty else {
            return MacroGraph.starter
        }

        let sorted = events.sorted(by: { $0.timestamp < $1.timestamp })
        var nodes: [MacroNode] = []
        var lastNodeID: UUID?

        for (index, event) in sorted.enumerated() {
            let nodeID = UUID()
            if let previous = lastNodeID, index > 0 {
                let delta = max(1, Int(event.timestamp.timeIntervalSince(sorted[index - 1].timestamp) * 1000))
                let waitID = UUID()
                nodes.append(
                    MacroNode(
                        id: waitID,
                        title: "Recorded Wait",
                        kind: .wait(milliseconds: delta, next: nodeID),
                        position: MacroNodePosition(x: 140 + Double(index * 220), y: 210)
                    )
                )
                appendNext(&nodes, for: previous, next: waitID)
            }

            let node = node(for: event, id: nodeID, index: index)
            nodes.append(node)
            if index == 0 {
                lastNodeID = nodeID
            } else {
                lastNodeID = nodeID
            }
        }

        return MacroGraph(
            name: name,
            entryNodeID: nodes.first?.id ?? UUID(),
            nodes: nodes
        )
    }

    private func node(for event: RecordedMacroEvent, id: UUID, index: Int) -> MacroNode {
        switch event.kind {
        case let .click(point):
            return MacroNode(
                id: id,
                title: "Recorded Click",
                kind: .click(button: .left, pointMode: .fixed(point), holdMilliseconds: 35, next: nil),
                position: MacroNodePosition(x: 140 + Double(index * 220), y: 120)
            )
        case let .move(point):
            return MacroNode(
                id: id,
                title: "Recorded Move",
                kind: .move(pointMode: .fixed(point), next: nil),
                position: MacroNodePosition(x: 140 + Double(index * 220), y: 120)
            )
        case let .scroll(delta):
            return MacroNode(
                id: id,
                title: "Recorded Scroll",
                kind: .scroll(lines: Int(delta.rounded()), next: nil),
                position: MacroNodePosition(x: 140 + Double(index * 220), y: 120)
            )
        case let .keyPress(key):
            return MacroNode(
                id: id,
                title: "Recorded Key",
                kind: .keyPress(key: key, modifiers: [], next: nil),
                position: MacroNodePosition(x: 140 + Double(index * 220), y: 120)
            )
        }
    }

    private func appendNext(_ nodes: inout [MacroNode], for id: UUID, next: UUID) {
        guard let index = nodes.firstIndex(where: { $0.id == id }) else { return }
        let node = nodes[index]
        let kind: MacroNodeKind

        switch node.kind {
        case let .click(button, pointMode, hold, _):
            kind = .click(button: button, pointMode: pointMode, holdMilliseconds: hold, next: next)
        case let .move(pointMode, _):
            kind = .move(pointMode: pointMode, next: next)
        case let .scroll(lines, _):
            kind = .scroll(lines: lines, next: next)
        case let .keyPress(key, modifiers, _):
            kind = .keyPress(key: key, modifiers: modifiers, next: next)
        case let .wait(milliseconds, _):
            kind = .wait(milliseconds: milliseconds, next: next)
        case let .setVariable(name, value, _):
            kind = .setVariable(name: name, value: value, next: next)
        case let .screenshot(name, _):
            kind = .screenshot(name: name, next: next)
        case let .subroutineCall(name, _):
            kind = .subroutineCall(name: name, next: next)
        case .branch, .loop:
            return
        }

        nodes[index] = MacroNode(id: node.id, title: node.title, kind: kind, position: node.position)
    }

    private func removeMonitors() {
        monitors.forEach { NSEvent.removeMonitor($0) }
        monitors.removeAll()
    }
}
