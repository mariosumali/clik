import Foundation

public actor MacroStore {
    private let fileManager = FileManager.default
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    public init() {
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        decoder.dateDecodingStrategy = .iso8601
    }

    public func listMacros() throws -> [MacroGraph] {
        let directory = try macrosDirectory()
        guard fileManager.fileExists(atPath: directory.path) else {
            return []
        }

        let urls = try fileManager.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "cfmacro" }

        return try urls.compactMap { url in
            let data = try Data(contentsOf: url)
            return try decoder.decode(MacroGraph.self, from: data)
        }
    }

    public func save(_ macro: MacroGraph) throws {
        let directory = try macrosDirectory()
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        let fileURL = directory.appendingPathComponent("\(macro.name).cfmacro")
        let data = try encoder.encode(macro)
        try data.write(to: fileURL, options: .atomic)
    }

    public func export(_ macro: MacroGraph, to url: URL) throws {
        let data = try encoder.encode(macro)
        try data.write(to: url, options: .atomic)
    }

    public func `import`(from url: URL) throws -> MacroGraph {
        let data = try Data(contentsOf: url)
        return try decoder.decode(MacroGraph.self, from: data)
    }

    private func macrosDirectory() throws -> URL {
        guard let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
            throw CocoaError(.fileNoSuchFile)
        }

        return appSupport
            .appendingPathComponent("autoclicker", isDirectory: true)
            .appendingPathComponent("macros", isDirectory: true)
    }
}
