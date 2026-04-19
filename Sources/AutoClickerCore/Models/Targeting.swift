import Foundation

public struct TargetingConfiguration: Codable, Hashable, Sendable {
    public enum TargetMode: Codable, Hashable, Sendable {
        case fixed(point: ClickPoint)
        case boundingBox(rect: ClickRect)
        case image(templateID: UUID, confidence: Double)
        case color(hex: String, tolerance: Double)
        case accessibility(label: String?, role: String?, identifier: String?)
        case ocr(query: String, useRegex: Bool)
    }

    public var mode: TargetMode
    public var lockOnFirstMatch: Bool
    public var searchRegion: ClickRect?
    public var ocrPolicy: OCRBackendPolicy

    public init(mode: TargetMode, lockOnFirstMatch: Bool, searchRegion: ClickRect?, ocrPolicy: OCRBackendPolicy = .visionPreferredWithTesseractFallback) {
        self.mode = mode
        self.lockOnFirstMatch = lockOnFirstMatch
        self.searchRegion = searchRegion
        self.ocrPolicy = ocrPolicy
    }

    public static let `default` = TargetingConfiguration(
        mode: .fixed(point: ClickPoint(x: 0, y: 0)),
        lockOnFirstMatch: false,
        searchRegion: nil,
        ocrPolicy: .visionPreferredWithTesseractFallback
    )
}
