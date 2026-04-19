import SwiftUI
import AutoClickerCore

struct HUDOverlayView: View {
    @ObservedObject var runtimeStore: AppRuntimeStore

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text("STATUS")
                Spacer()
                Text(runtimeStore.engineState.rawValue.uppercased())
            }
            HStack {
                Text("CLICKS")
                Spacer()
                Text("\(runtimeStore.clickCount)")
            }
            HStack {
                Text("CPS")
                Spacer()
                Text(String(format: "%.2f", runtimeStore.clicksPerSecond))
            }
            HStack {
                Text("TIME")
                Spacer()
                Text("\(Int(runtimeStore.runtimeSeconds))s")
            }
        }
        .font(.system(size: 11, weight: .medium, design: .monospaced))
        .padding(10)
        .frame(width: 200)
        .background(Color.black.opacity(0.75))
        .overlay {
            RoundedRectangle(cornerRadius: 2)
                .stroke(Color.white.opacity(0.2), lineWidth: 1)
        }
    }
}
