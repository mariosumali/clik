import SwiftUI
import AutoClickerCore

struct MainWindowView: View {
    @ObservedObject var runtimeStore: AppRuntimeStore
    @Binding var selectedTab: MainTab
    let permissionManager: PermissionManager
    let startAction: () -> Void
    let pauseResumeAction: () -> Void
    let stopAction: () -> Void
    let armTriggersAction: () -> Void
    let disarmTriggersAction: () -> Void

    @State private var profiles: [Profile] = [Profile(name: "Default")]
    @State private var selectedProfileID: UUID?

    var body: some View {
        NavigationSplitView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Profiles")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)

                    ForEach(profiles) { profile in
                        Button {
                            selectedProfileID = profile.id
                        } label: {
                            HStack {
                                Image(systemName: profile.id == selectedProfileID ? "checkmark.circle.fill" : "circle")
                                Text(profile.name)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 6)
                            .padding(.horizontal, 8)
                            .background(profile.id == selectedProfileID ? Color.accentColor.opacity(0.2) : Color.clear)
                            .cornerRadius(6)
                        }
                        .buttonStyle(.plain)
                    }
                }

                Divider()

                VStack(alignment: .leading, spacing: 8) {
                    Text("Panels")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)

                    ForEach(MainTab.allCases) { tab in
                        Button {
                            selectedTab = tab
                        } label: {
                            Text(tab.rawValue)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.vertical, 6)
                                .padding(.horizontal, 8)
                                .background(tab == selectedTab ? Color.accentColor.opacity(0.2) : Color.clear)
                                .cornerRadius(6)
                        }
                        .buttonStyle(.plain)
                    }
                }

                Spacer()
            }
            .padding(12)
            .navigationTitle("autoclicker")
            .onAppear {
                selectedProfileID = profiles.first?.id
            }
        } content: {
            PanelContainerView(
                tab: selectedTab,
                runtimeStore: runtimeStore,
                armTriggersAction: armTriggersAction,
                disarmTriggersAction: disarmTriggersAction
            )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .toolbar {
                    ToolbarItemGroup(placement: .automatic) {
                        Button("Start", action: startAction)
                        Button("Pause/Resume", action: pauseResumeAction)
                        Button("Stop", action: stopAction)
                    }
                }
        } detail: {
            LivePreviewView(runtimeStore: runtimeStore, permissionManager: permissionManager)
                .frame(minWidth: 300)
        }
        .onReceive(Timer.publish(every: 0.5, on: .main, in: .common).autoconnect()) { _ in
            runtimeStore.updateRuntime()
        }
    }
}
