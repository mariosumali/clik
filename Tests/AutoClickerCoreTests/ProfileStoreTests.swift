import Testing
import Foundation
@testable import AutoClickerCore

@Test
func importProfileRenamesConflicts() async throws {
    let store = ProfileStore()
    let existing = PersistedProfiles(
        profiles: [Profile(id: UUID(uuidString: "00000000-0000-0000-0000-000000000001")!, name: "Default")],
        activeProfileID: nil
    )

    var imported = Profile(id: existing.profiles[0].id, name: "Default")
    imported.clickEngine = .default
    let tempURL = URL(fileURLWithPath: NSTemporaryDirectory())
        .appendingPathComponent("profile-\(UUID().uuidString).cfprofile")
    defer { try? FileManager.default.removeItem(at: tempURL) }

    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    try encoder.encode(imported).write(to: tempURL)

    let merged = try await store.importProfile(from: tempURL, into: existing)
    #expect(merged.profiles.count == 2)
    #expect(merged.profiles[0].id != merged.profiles[1].id)
    #expect(merged.profiles[1].name == "Default 2")
}
