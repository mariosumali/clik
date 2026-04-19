import SwiftUI

struct TriggerConsoleView: View {
    let armAction: () -> Void
    let disarmAction: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Trigger Runtime")
                .font(.title2.bold())

            Text("Deterministic evaluation order, cooldowns, and chain dispatch are active in the core trigger engine.")
                .foregroundStyle(.secondary)

            HStack {
                Button("Arm Triggers", action: armAction)
                Button("Disarm Triggers", action: disarmAction)
            }

            GroupBox("Supported Triggers") {
                VStack(alignment: .leading, spacing: 6) {
                    Text("- Global hotkeys")
                    Text("- Delay and cron schedule")
                    Text("- Image and color appearance checks")
                    Text("- Frontmost app changes")
                    Text("- Clipboard content changes")
                    Text("- Audio trigger adapter slot (pluggable)")
                }
                .font(.body.monospaced())
            }
        }
    }
}
