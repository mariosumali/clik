import Foundation
import AutoClickerCore

@main
struct AutoClickerCLI {
    static func main() async {
        let arguments = CommandLine.arguments

        guard arguments.count >= 2 else {
            print("Usage:")
            print("  autoclicker run <profile-path> [--max-seconds N]")
            print("  autoclicker doctor")
            return
        }

        switch arguments[1] {
        case "doctor":
            let permissionManager = PermissionManager()
            for permission in PermissionKind.allCases {
                let status = permissionManager.status(for: permission).rawValue
                print("\(permission.rawValue): \(status)")
            }
        case "run":
            await run(arguments: arguments)
        default:
            print("Unknown command: \(arguments[1])")
        }
    }

    private static func run(arguments: [String]) async {
        guard arguments.count >= 3 else {
            print("Missing profile path.")
            return
        }

        let profilePath = arguments[2]
        let maxSeconds = parseMaxSeconds(arguments: arguments) ?? 10
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        let profileURL = URL(fileURLWithPath: profilePath)
        guard let data = try? Data(contentsOf: profileURL),
              let profile = try? decoder.decode(Profile.self, from: data) else {
            print("Could not decode profile at path: \(profilePath)")
            return
        }

        let clickEngine = ClickEngine()
        let targeting = TargetingEngine()
        let startedAt = Date()

        do {
            try await clickEngine.start(
                configuration: profile.clickEngine,
                humanization: profile.humanization,
                targetResolver: {
                    (try? await targeting.resolve(config: profile.targeting)) ?? ClickPoint(x: 0, y: 0)
                }
            )

            while Date().timeIntervalSince(startedAt) < maxSeconds {
                let state = await clickEngine.currentState()
                if state == .stopped { break }
                try? await Task.sleep(nanoseconds: 200_000_000)
            }

            try? await clickEngine.stop()
            let clicks = await clickEngine.clickCounter
            print("Run complete.")
            print("Profile: \(profile.name)")
            print("Clicks executed: \(clicks)")
            print("Elapsed seconds: \(Int(Date().timeIntervalSince(startedAt)))")
        } catch {
            print("Run failed: \(error.localizedDescription)")
        }
    }

    private static func parseMaxSeconds(arguments: [String]) -> TimeInterval? {
        guard let flagIndex = arguments.firstIndex(of: "--max-seconds"), arguments.indices.contains(flagIndex + 1) else {
            return nil
        }
        return TimeInterval(arguments[flagIndex + 1])
    }
}
