import SwiftUI
import AutoClickerCore

struct SettingsView: View {
    let permissionManager: PermissionManager
    @State private var accentHex = "#00FF88"

    var body: some View {
        Form {
            Section("Permissions Dashboard") {
                ForEach(PermissionKind.allCases, id: \.self) { permission in
                    HStack {
                        Text(permission.rawValue)
                        Spacer()

                        Text(permissionManager.status(for: permission).rawValue.capitalized)
                            .foregroundStyle(permissionManager.status(for: permission) == .granted ? .green : .red)

                        Button("Open System Settings") {
                            permissionManager.openSystemSettings(for: permission)
                        }
                    }
                }
            }

            Section("Hotkeys") {
                LabeledContent("Start", value: "F8")
                LabeledContent("Pause/Resume", value: "F9")
                LabeledContent("Emergency Stop", value: "F12")
            }

            Section("Appearance") {
                TextField("Accent Hex Color", text: $accentHex)
            }
        }
    }
}
