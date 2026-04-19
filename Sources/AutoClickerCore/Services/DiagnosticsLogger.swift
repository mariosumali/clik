import Foundation

public enum DiagnosticsChannel: String, Codable, Sendable {
    case permissions
    case trigger
    case macro
    case targeting
    case click
    case performance
    case runtime
}

public actor DiagnosticsLogger {
    private let fileManager = FileManager.default
    private let maxFilesPerChannel = 5
    private let maxFileBytes = 512_000

    public init() {}

    public func log(_ message: String, channel: DiagnosticsChannel) {
        do {
            let url = try logURL(for: channel)
            let timestamp = ISO8601DateFormatter().string(from: Date())
            let line = "[\(timestamp)] \(message)\n"

            if fileManager.fileExists(atPath: url.path) {
                let handle = try FileHandle(forWritingTo: url)
                defer { try? handle.close() }
                try handle.seekToEnd()
                if let data = line.data(using: .utf8) {
                    try handle.write(contentsOf: data)
                }
            } else {
                try fileManager.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
                try line.write(to: url, atomically: true, encoding: .utf8)
            }

            try rotateIfNeeded(channel: channel, activeURL: url)
        } catch {
            // Logging never crashes product runtime.
        }
    }

    public func exportBundle(to destination: URL) throws {
        let logsDirectory = try logDirectory()
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = ["zip", "-r", destination.path, "."]
        process.currentDirectoryURL = logsDirectory
        try process.run()
        process.waitUntilExit()
        guard process.terminationStatus == 0 else {
            throw CocoaError(.fileWriteUnknown)
        }
    }

    private func rotateIfNeeded(channel: DiagnosticsChannel, activeURL: URL) throws {
        let attributes = try fileManager.attributesOfItem(atPath: activeURL.path)
        let size = (attributes[.size] as? NSNumber)?.intValue ?? 0
        guard size > maxFileBytes else { return }

        let baseName = channel.rawValue
        let directory = activeURL.deletingLastPathComponent()
        let dateSuffix = ISO8601DateFormatter().string(from: Date()).replacingOccurrences(of: ":", with: "-")
        let archived = directory.appendingPathComponent("\(baseName)-\(dateSuffix).log")
        try fileManager.moveItem(at: activeURL, to: archived)
        try "".write(to: activeURL, atomically: true, encoding: .utf8)

        let existing = try fileManager.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.creationDateKey])
            .filter { $0.lastPathComponent.hasPrefix(baseName + "-") }
            .sorted { left, right in
                let leftDate = (try? left.resourceValues(forKeys: [.creationDateKey]).creationDate) ?? .distantPast
                let rightDate = (try? right.resourceValues(forKeys: [.creationDateKey]).creationDate) ?? .distantPast
                return leftDate > rightDate
            }

        for url in existing.dropFirst(maxFilesPerChannel) {
            try? fileManager.removeItem(at: url)
        }
    }

    private func logURL(for channel: DiagnosticsChannel) throws -> URL {
        try logDirectory().appendingPathComponent("\(channel.rawValue).log")
    }

    private func logDirectory() throws -> URL {
        guard let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
            throw CocoaError(.fileNoSuchFile)
        }
        return appSupport
            .appendingPathComponent("autoclicker", isDirectory: true)
            .appendingPathComponent("logs", isDirectory: true)
    }
}
