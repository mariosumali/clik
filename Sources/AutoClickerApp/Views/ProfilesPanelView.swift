import SwiftUI
import AppKit
import UniformTypeIdentifiers
import AutoClickerCore

struct ProfilesPanelView: View {
    @State private var persisted = PersistedProfiles(profiles: [Profile(name: "Default")], activeProfileID: nil)
    @State private var selectedProfileID: UUID?
    @State private var statusMessage = ""

    private let store = ProfileStore()

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Profiles")
                .font(.title2.bold())

            HStack {
                Button("New", action: addProfile)
                Button("Duplicate", action: duplicateProfile)
                Button("Delete", action: deleteProfile)
                Button("Save", action: saveProfiles)
            }

            HStack {
                Button("Import .cfprofile", action: importProfile)
                Button("Export .cfprofile", action: exportProfile)
                Button("Import .cfpack", action: importPack)
                Button("Export .cfpack", action: exportPack)
            }

            Table(persisted.profiles, selection: $selectedProfileID) {
                TableColumn("Name") { profile in
                    Text(profile.name)
                }
                TableColumn("Accent") { profile in
                    Text(profile.accentHexColor)
                        .font(.system(.body, design: .monospaced))
                }
                TableColumn("Updated") { profile in
                    Text(profile.updatedAt, style: .relative)
                }
            }

            if !statusMessage.isEmpty {
                Text(statusMessage)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
        .task { await loadProfiles() }
    }

    private func addProfile() {
        persisted.profiles.append(Profile(name: "Profile \(persisted.profiles.count + 1)"))
        selectedProfileID = persisted.profiles.last?.id
    }

    private func duplicateProfile() {
        guard let selected = selectedProfile else { return }
        var copy = selected
        copy.id = UUID()
        copy.name = "\(selected.name) Copy"
        copy.updatedAt = Date()
        persisted.profiles.append(copy)
        selectedProfileID = copy.id
    }

    private func deleteProfile() {
        guard let selectedProfileID else { return }
        persisted.profiles.removeAll { $0.id == selectedProfileID }
        self.selectedProfileID = persisted.profiles.first?.id
    }

    private func saveProfiles() {
        Task {
            do {
                try await store.saveProfiles(persisted)
                statusMessage = "Profiles saved."
            } catch {
                statusMessage = "Save failed: \(error.localizedDescription)"
            }
        }
    }

    private func importProfile() {
        guard let url = openPanel(allowedTypes: ["cfprofile"]) else { return }
        Task {
            do {
                persisted = try await store.importProfile(from: url, into: persisted)
                statusMessage = "Imported profile from \(url.lastPathComponent)"
            } catch {
                statusMessage = "Import failed: \(error.localizedDescription)"
            }
        }
    }

    private func exportProfile() {
        guard let selectedProfile else { return }
        guard let url = savePanel(defaultName: "\(selectedProfile.name).cfprofile") else { return }
        Task {
            do {
                try await store.exportProfile(selectedProfile, to: url)
                statusMessage = "Exported profile to \(url.lastPathComponent)"
            } catch {
                statusMessage = "Export failed: \(error.localizedDescription)"
            }
        }
    }

    private func importPack() {
        guard let url = openPanel(allowedTypes: ["cfpack"]) else { return }
        Task {
            do {
                persisted = try await store.importPack(from: url, into: persisted)
                statusMessage = "Imported pack from \(url.lastPathComponent)"
            } catch {
                statusMessage = "Pack import failed: \(error.localizedDescription)"
            }
        }
    }

    private func exportPack() {
        guard let url = savePanel(defaultName: "profiles.cfpack") else { return }
        Task {
            do {
                try await store.exportPack(profiles: persisted.profiles, to: url)
                statusMessage = "Exported profile pack."
            } catch {
                statusMessage = "Pack export failed: \(error.localizedDescription)"
            }
        }
    }

    @MainActor
    private func loadProfiles() async {
        do {
            persisted = try await store.loadProfiles()
            selectedProfileID = persisted.profiles.first?.id
        } catch {
            statusMessage = "Load failed: \(error.localizedDescription)"
        }
    }

    private var selectedProfile: Profile? {
        persisted.profiles.first(where: { $0.id == selectedProfileID })
    }

    @MainActor
    private func openPanel(allowedTypes: [String]) -> URL? {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowedContentTypes = allowedTypes.compactMap { UTType(filenameExtension: $0) }
        return panel.runModal() == .OK ? panel.url : nil
    }

    @MainActor
    private func savePanel(defaultName: String) -> URL? {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = defaultName
        return panel.runModal() == .OK ? panel.url : nil
    }
}
