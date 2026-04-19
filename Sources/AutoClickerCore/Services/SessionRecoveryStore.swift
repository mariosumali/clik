import Foundation

public struct RuntimeSessionSnapshot: Codable, Sendable {
    public var schemaVersion: Int
    public var state: EngineState
    public var clickCount: Int
    public var runtimeSeconds: TimeInterval
    public var activeProfileID: UUID?
    public var capturedAt: Date

    public init(
        schemaVersion: Int = 1,
        state: EngineState,
        clickCount: Int,
        runtimeSeconds: TimeInterval,
        activeProfileID: UUID?,
        capturedAt: Date = Date()
    ) {
        self.schemaVersion = schemaVersion
        self.state = state
        self.clickCount = clickCount
        self.runtimeSeconds = runtimeSeconds
        self.activeProfileID = activeProfileID
        self.capturedAt = capturedAt
    }
}

public actor SessionRecoveryStore {
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()
    private let fileManager = FileManager.default

    public init() {
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        decoder.dateDecodingStrategy = .iso8601
    }

    public func save(_ snapshot: RuntimeSessionSnapshot) throws {
        let url = try snapshotURL()
        try fileManager.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        let data = try encoder.encode(snapshot)
        try data.write(to: url, options: .atomic)
    }

    public func loadLatest() throws -> RuntimeSessionSnapshot? {
        let url = try snapshotURL()
        guard fileManager.fileExists(atPath: url.path) else {
            return nil
        }
        let data = try Data(contentsOf: url)
        return try decoder.decode(RuntimeSessionSnapshot.self, from: data)
    }

    public func clear() throws {
        let url = try snapshotURL()
        if fileManager.fileExists(atPath: url.path) {
            try fileManager.removeItem(at: url)
        }
    }

    private func snapshotURL() throws -> URL {
        guard let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
            throw CocoaError(.fileNoSuchFile)
        }
        return appSupport
            .appendingPathComponent("autoclicker", isDirectory: true)
            .appendingPathComponent("runtime", isDirectory: true)
            .appendingPathComponent("last-session.json")
    }
}
