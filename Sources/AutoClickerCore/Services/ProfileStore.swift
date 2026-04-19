import Foundation

public struct PersistedProfiles: Codable, Sendable {
    public var schemaVersion: Int
    public var profiles: [Profile]
    public var activeProfileID: UUID?

    public init(schemaVersion: Int = 1, profiles: [Profile], activeProfileID: UUID?) {
        self.schemaVersion = schemaVersion
        self.profiles = profiles
        self.activeProfileID = activeProfileID
    }
}

public struct ProfilePack: Codable, Sendable {
    public var schemaVersion: Int
    public var exportedAt: Date
    public var profiles: [Profile]

    public init(schemaVersion: Int = 1, exportedAt: Date = Date(), profiles: [Profile]) {
        self.schemaVersion = schemaVersion
        self.exportedAt = exportedAt
        self.profiles = profiles
    }
}

public actor ProfileStore {
    private let fileManager = FileManager.default
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    public init() {
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        decoder.dateDecodingStrategy = .iso8601
    }

    public func loadProfiles() throws -> PersistedProfiles {
        let url = try profilesURL()
        guard fileManager.fileExists(atPath: url.path) else {
            return PersistedProfiles(
                profiles: [Profile(name: "Default")],
                activeProfileID: nil
            )
        }

        let data = try Data(contentsOf: url)
        return try decoder.decode(PersistedProfiles.self, from: data)
    }

    public func saveProfiles(_ persistedProfiles: PersistedProfiles) throws {
        let url = try profilesURL()
        try fileManager.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        let data = try encoder.encode(persistedProfiles)
        try data.write(to: url, options: .atomic)
    }

    public func exportProfile(_ profile: Profile, to url: URL) throws {
        let data = try encoder.encode(profile)
        try data.write(to: url, options: .atomic)
    }

    public func importProfile(from url: URL, into persisted: PersistedProfiles) throws -> PersistedProfiles {
        let data = try Data(contentsOf: url)
        var imported = try decoder.decode(Profile.self, from: data)

        var profiles = persisted.profiles
        if profiles.contains(where: { $0.id == imported.id }) {
            imported.id = UUID()
        }
        imported.name = uniqueProfileName(imported.name, existing: profiles)
        profiles.append(imported)

        return PersistedProfiles(schemaVersion: persisted.schemaVersion, profiles: profiles, activeProfileID: persisted.activeProfileID)
    }

    public func exportPack(profiles: [Profile], to url: URL) throws {
        let pack = ProfilePack(profiles: profiles)
        let data = try encoder.encode(pack)
        try data.write(to: url, options: .atomic)
    }

    public func importPack(from url: URL, into persisted: PersistedProfiles) throws -> PersistedProfiles {
        let data = try Data(contentsOf: url)
        let pack = try decoder.decode(ProfilePack.self, from: data)

        var merged = persisted.profiles
        for incoming in pack.profiles {
            var profile = incoming
            if merged.contains(where: { $0.id == profile.id }) {
                profile.id = UUID()
            }
            profile.name = uniqueProfileName(profile.name, existing: merged)
            merged.append(profile)
        }

        return PersistedProfiles(schemaVersion: max(persisted.schemaVersion, pack.schemaVersion), profiles: merged, activeProfileID: persisted.activeProfileID)
    }

    private func uniqueProfileName(_ base: String, existing: [Profile]) -> String {
        let existingNames = Set(existing.map(\.name))
        guard existingNames.contains(base) else { return base }

        var index = 2
        while existingNames.contains("\(base) \(index)") {
            index += 1
        }
        return "\(base) \(index)"
    }

    private func profilesURL() throws -> URL {
        guard let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
            throw CocoaError(.fileNoSuchFile)
        }

        return appSupport
            .appendingPathComponent("autoclicker", isDirectory: true)
            .appendingPathComponent("profiles", isDirectory: true)
            .appendingPathComponent("profiles.cfprofiles.json")
    }
}
