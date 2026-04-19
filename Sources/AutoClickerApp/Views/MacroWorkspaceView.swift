import SwiftUI
import AutoClickerCore

struct MacroWorkspaceView: View {
    enum EditorMode: String, CaseIterable, Identifiable {
        case linear = "Linear"
        case nodeGraph = "Node Graph"
        var id: String { rawValue }
    }

    @State private var graph: MacroGraph = .starter
    @State private var mode: EditorMode = .linear
    @State private var speedMultiplier = 1.0
    @StateObject private var recorder = MacroRecorder()

    private let macroRuntime = MacroRuntime()

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("Macro Editor")
                    .font(.title2.bold())

                Spacer()

                Picker("Editor", selection: $mode) {
                    ForEach(EditorMode.allCases) { mode in
                        Text(mode.rawValue).tag(mode)
                    }
                }
                .pickerStyle(.segmented)
                .frame(width: 220)
            }

            HStack(spacing: 10) {
                Button(recorder.isRecording ? "Stop Recording" : "Record") {
                    if recorder.isRecording {
                        graph = recorder.stopRecording()
                    } else {
                        recorder.startRecording()
                    }
                }

                Button("Play Macro") {
                    playMacro()
                }

                Button("Stop Playback") {
                    Task { await macroRuntime.stop() }
                }

                Stepper("Speed x\(String(format: "%.1f", speedMultiplier))", value: $speedMultiplier, in: 0.1...20, step: 0.1)
                    .frame(width: 220)

                Spacer()

                Button("Add Click Step", action: addClickStep)
                Button("Add Wait Step", action: addWaitStep)
            }

            if mode == .linear {
                MacroLinearEditorView(graph: $graph)
            } else {
                MacroNodeGraphEditorView(graph: $graph)
            }
        }
        .padding(20)
    }

    private func playMacro() {
        Task {
            await macroRuntime.start(
                graph: graph,
                speedMultiplier: speedMultiplier,
                loopBehavior: .finite(1),
                context: MacroRuntimeContext(
                    clickCounter: { 0 },
                    resolveRuntimeTarget: { ClickPoint(x: 0, y: 0) }
                )
            )
        }
    }

    private func addClickStep() {
        let newID = UUID()
        let newNode = MacroNode(
            id: newID,
            title: "Manual Click",
            kind: .click(
                button: .left,
                pointMode: .followRuntimeTarget,
                holdMilliseconds: 40,
                next: nil
            ),
            position: MacroNodePosition(x: 100, y: 320 + Double(graph.nodes.count * 24))
        )

        if let lastID = graph.nodes.last?.id {
            graph.nodes = graph.nodes.map { node in
                guard node.id == lastID else { return node }
                return node.with(next: newID)
            }
        }

        graph.nodes.append(newNode)
    }

    private func addWaitStep() {
        let newID = UUID()
        let newNode = MacroNode(
            id: newID,
            title: "Manual Wait",
            kind: .wait(milliseconds: 250, next: nil),
            position: MacroNodePosition(x: 360, y: 320 + Double(graph.nodes.count * 24))
        )

        if let lastID = graph.nodes.last?.id {
            graph.nodes = graph.nodes.map { node in
                guard node.id == lastID else { return node }
                return node.with(next: newID)
            }
        }

        graph.nodes.append(newNode)
    }
}

private struct MacroLinearEditorView: View {
    @Binding var graph: MacroGraph

    var body: some View {
        Table(graph.linearProjection()) {
            TableColumn("#") { step in
                Text("\(step.depth)")
                    .monospacedDigit()
            }
            TableColumn("Title") { step in
                Text(step.title)
            }
            TableColumn("Type") { step in
                Text(step.kindDescription)
                    .foregroundStyle(.secondary)
            }
        }
        .tableStyle(.inset(alternatesRowBackgrounds: true))
    }
}

private struct MacroNodeGraphEditorView: View {
    @Binding var graph: MacroGraph

    var body: some View {
        ScrollView([.horizontal, .vertical]) {
            ZStack(alignment: .topLeading) {
                Canvas { context, _ in
                    let map = Dictionary(uniqueKeysWithValues: graph.nodes.map { ($0.id, $0) })

                    for node in graph.nodes {
                        for next in node.kind.nextNodeCandidates {
                            guard let target = map[next] else { continue }
                            var path = Path()
                            path.move(to: CGPoint(x: node.position.x + 180, y: node.position.y + 30))
                            path.addLine(to: CGPoint(x: target.position.x, y: target.position.y + 30))
                            context.stroke(path, with: .color(.mint.opacity(0.8)), lineWidth: 1.5)
                        }
                    }
                }
                .frame(width: 1800, height: 1000)

                ForEach(graph.nodes) { node in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(node.title)
                            .font(.headline)
                        Text(node.kind.shortName)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(10)
                    .frame(width: 180, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: 8).fill(Color.black.opacity(0.05)))
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.black.opacity(0.15), lineWidth: 1))
                    .position(x: node.position.x + 90, y: node.position.y + 30)
                }
            }
            .frame(width: 1800, height: 1000, alignment: .topLeading)
        }
        .background(Color.black.opacity(0.02))
    }
}

private extension MacroNode {
    func with(next: UUID?) -> MacroNode {
        let updatedKind: MacroNodeKind
        switch kind {
        case let .click(button, mode, hold, _):
            updatedKind = .click(button: button, pointMode: mode, holdMilliseconds: hold, next: next)
        case let .move(mode, _):
            updatedKind = .move(pointMode: mode, next: next)
        case let .scroll(lines, _):
            updatedKind = .scroll(lines: lines, next: next)
        case let .keyPress(key, modifiers, _):
            updatedKind = .keyPress(key: key, modifiers: modifiers, next: next)
        case let .wait(milliseconds, _):
            updatedKind = .wait(milliseconds: milliseconds, next: next)
        case let .setVariable(name, value, _):
            updatedKind = .setVariable(name: name, value: value, next: next)
        case let .screenshot(name, _):
            updatedKind = .screenshot(name: name, next: next)
        case let .subroutineCall(name, _):
            updatedKind = .subroutineCall(name: name, next: next)
        case .branch, .loop:
            updatedKind = kind
        }

        return MacroNode(id: id, title: title, kind: updatedKind, position: position)
    }
}

private extension MacroNodeKind {
    var shortName: String {
        switch self {
        case .click:
            return "CLICK"
        case .move:
            return "MOVE"
        case .scroll:
            return "SCROLL"
        case .keyPress:
            return "KEY"
        case .wait:
            return "WAIT"
        case .branch:
            return "BRANCH"
        case .loop:
            return "LOOP"
        case .setVariable:
            return "SET VAR"
        case .screenshot:
            return "SCREENSHOT"
        case .subroutineCall:
            return "SUBROUTINE"
        }
    }
}
