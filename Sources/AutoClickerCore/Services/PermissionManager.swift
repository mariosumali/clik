import Foundation
import AppKit
import ApplicationServices
import AVFoundation

public enum PermissionKind: String, CaseIterable, Codable, Sendable {
    case accessibility
    case inputMonitoring
    case screenRecording
    case microphone
    case automation
}

public enum PermissionStatus: String, Codable, Sendable {
    case granted
    case missing
    case notRequired
}

public protocol PermissionManaging: Sendable {
    func status(for permission: PermissionKind) -> PermissionStatus
    func openSystemSettings(for permission: PermissionKind)
}

public final class PermissionManager: PermissionManaging {
    public init() {}

    public func status(for permission: PermissionKind) -> PermissionStatus {
        switch permission {
        case .accessibility:
            return AXIsProcessTrusted() ? .granted : .missing
        case .inputMonitoring:
            if #available(macOS 10.15, *) {
                return CGPreflightListenEventAccess() ? .granted : .missing
            }
            return .notRequired
        case .screenRecording:
            if #available(macOS 10.15, *) {
                return CGPreflightScreenCaptureAccess() ? .granted : .missing
            }
            return .notRequired
        case .microphone:
            let status = AVCaptureDevice.authorizationStatus(for: .audio)
            return status == .authorized ? .granted : .missing
        case .automation:
            return .notRequired
        }
    }

    public func openSystemSettings(for permission: PermissionKind) {
        let urlString: String
        switch permission {
        case .accessibility:
            urlString = "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
        case .inputMonitoring:
            urlString = "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent"
        case .screenRecording:
            urlString = "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
        case .microphone:
            urlString = "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
        case .automation:
            urlString = "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation"
        }

        guard let url = URL(string: urlString) else { return }
        NSWorkspace.shared.open(url)
    }
}
