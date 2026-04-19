import SwiftUI
import AutoClickerCore

struct PanelContainerView: View {
    let tab: MainTab
    @ObservedObject var runtimeStore: AppRuntimeStore
    let armTriggersAction: () -> Void
    let disarmTriggersAction: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(tab.rawValue)
                .font(.largeTitle.weight(.semibold))

            switch tab {
            case .clickEngine:
                LabeledContent("Status", value: runtimeStore.engineState.rawValue.capitalized)
                LabeledContent("Click Count", value: "\(runtimeStore.clickCount)")
            case .macros:
                MacroWorkspaceView()
            case .targeting:
                TargetingPanelView()
            case .humanization:
                Text("Preset controls, jitter/timing sliders, deterministic seed.")
            case .triggers:
                TriggerConsoleView(armAction: armTriggersAction, disarmAction: disarmTriggersAction)
            case .profiles:
                ProfilesPanelView()
            }

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(24)
        .background(Color.black.opacity(0.04))
    }
}
