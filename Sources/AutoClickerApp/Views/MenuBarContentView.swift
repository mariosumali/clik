import SwiftUI
import AutoClickerCore

struct MenuBarContentView: View {
    @ObservedObject var runtimeStore: AppRuntimeStore
    @Binding var selectedTab: MainTab
    @Binding var isHUDVisible: Bool
    let startAction: () -> Void
    let pauseResumeAction: () -> Void
    let stopAction: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("State")
                Spacer()
                Text(runtimeStore.engineState.rawValue.capitalized)
                    .foregroundStyle(statusColor)
            }

            HStack {
                Text("Clicks")
                Spacer()
                Text("\(runtimeStore.clickCount)")
            }

            Divider()

            Button("Start", action: startAction)
            Button("Pause / Resume", action: pauseResumeAction)
            Button("Stop", action: stopAction)

            Divider()

            Picker("Panel", selection: $selectedTab) {
                ForEach(MainTab.allCases) { tab in
                    Text(tab.rawValue).tag(tab)
                }
            }
            .pickerStyle(.menu)

            Toggle("Show HUD", isOn: $isHUDVisible)
        }
        .padding()
        .frame(width: 280)
    }

    private var statusColor: Color {
        switch runtimeStore.engineState {
        case .idle, .stopped:
            return .gray
        case .armed, .running:
            return .green
        case .paused:
            return .orange
        }
    }
}
