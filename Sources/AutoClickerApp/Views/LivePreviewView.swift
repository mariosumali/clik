import SwiftUI
import AutoClickerCore

struct LivePreviewView: View {
    @ObservedObject var runtimeStore: AppRuntimeStore
    let permissionManager: PermissionManager

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Live Preview")
                .font(.title3.weight(.semibold))

            ZStack {
                RoundedRectangle(cornerRadius: 6)
                    .fill(Color.black.opacity(0.15))

                VStack(spacing: 8) {
                    Image(systemName: "display.2")
                        .font(.largeTitle)
                    Text("Screen thumbnail placeholder")
                        .font(.caption)
                }
                .foregroundStyle(.secondary)
            }
            .frame(height: 200)

            GroupBox("Runtime") {
                LabeledContent("Engine", value: runtimeStore.engineState.rawValue.capitalized)
                LabeledContent("Clicks", value: "\(runtimeStore.clickCount)")
                LabeledContent("CPS", value: String(format: "%.2f", runtimeStore.clicksPerSecond))
            }

            GroupBox("Permissions") {
                ForEach(PermissionKind.allCases, id: \.self) { permission in
                    HStack {
                        Text(permission.rawValue)
                        Spacer()
                        Text(permissionManager.status(for: permission).rawValue.capitalized)
                    }
                }
            }

            Spacer()
        }
        .padding(20)
    }
}
