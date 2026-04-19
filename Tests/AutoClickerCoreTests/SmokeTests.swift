import Testing
import Foundation
@testable import AutoClickerCore

@Test
func runtimeStoreStartsIdle() {
    let store = AppRuntimeStore()
    #expect(store.engineState == .idle)
}
