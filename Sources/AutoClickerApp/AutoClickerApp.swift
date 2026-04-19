import SwiftUI
import AutoClickerCore

@main
struct AutoClickerMacApp: App {
    @StateObject private var runtimeStore: AppRuntimeStore
    @StateObject private var runtimeController: RuntimeController
    @State private var selectedTab: MainTab = .clickEngine
    @State private var isHUDVisible = true

    private let permissionManager = PermissionManager()
    private let quickProfile = Profile(name: "Quick Start")

    init() {
        let store = AppRuntimeStore()
        _runtimeStore = StateObject(wrappedValue: store)
        _runtimeController = StateObject(wrappedValue: RuntimeController(runtimeStore: store))
    }

    var body: some Scene {
        WindowGroup("mars-autoclicker") {
            MainWindowView(
                runtimeStore: runtimeStore,
                selectedTab: $selectedTab,
                permissionManager: permissionManager,
                startAction: { runtimeController.start(profile: quickProfile) },
                pauseResumeAction: { runtimeController.pauseOrResume() },
                stopAction: { runtimeController.stop() },
                armTriggersAction: { runtimeController.armTriggers(for: quickProfile) },
                disarmTriggersAction: { runtimeController.disarmTriggers() }
            )
            .frame(minWidth: 1080, minHeight: 720)
            .overlay(alignment: .topTrailing) {
                if isHUDVisible {
                    HUDOverlayView(runtimeStore: runtimeStore)
                        .padding()
                }
            }
        }

        MenuBarExtra("autoclicker", systemImage: "cursorarrow.click.2") {
            MenuBarContentView(
                runtimeStore: runtimeStore,
                selectedTab: $selectedTab,
                isHUDVisible: $isHUDVisible,
                startAction: { runtimeController.start(profile: quickProfile) },
                pauseResumeAction: { runtimeController.pauseOrResume() },
                stopAction: { runtimeController.stop() }
            )
        }
        .menuBarExtraStyle(.window)

        Settings {
            SettingsView(permissionManager: permissionManager)
                .padding()
                .frame(width: 540, height: 460)
        }
    }
}
