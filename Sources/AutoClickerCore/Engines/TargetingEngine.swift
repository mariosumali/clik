import Foundation
import CoreGraphics
import ApplicationServices
import Vision
import AppKit

public enum OCRBackendPolicy: String, Codable, Sendable {
    case visionOnly
    case visionPreferredWithTesseractFallback
    case tesseractOnly
}

public enum TargetingError: Error, LocalizedError, Sendable {
    case noScreenImage
    case templateUnavailable(UUID)
    case noMatchFound
    case inaccessibleAXHierarchy
    case unsupportedOCRBackend

    public var errorDescription: String? {
        switch self {
        case .noScreenImage:
            return "Unable to capture screen image for targeting."
        case let .templateUnavailable(id):
            return "Template \(id.uuidString) is unavailable."
        case .noMatchFound:
            return "No target match found."
        case .inaccessibleAXHierarchy:
            return "Accessibility hierarchy could not be queried."
        case .unsupportedOCRBackend:
            return "OCR backend is not available on this machine."
        }
    }
}

public actor TargetingEngine {
    private let templateStore: TemplateStore
    private let visionOCR = VisionOCRService()
    private let tesseractOCR = TesseractOCRService()

    public init(templateStore: TemplateStore = TemplateStore()) {
        self.templateStore = templateStore
    }

    public func resolve(
        config: TargetingConfiguration,
        ocrPolicy: OCRBackendPolicy = .visionPreferredWithTesseractFallback
    ) async throws -> ClickPoint {
        switch config.mode {
        case let .fixed(point):
            return point
        case let .boundingBox(rect):
            let x = Double.random(in: rect.x...(rect.x + rect.width))
            let y = Double.random(in: rect.y...(rect.y + rect.height))
            return ClickPoint(x: x, y: y)
        case let .image(templateID, confidence):
            return try await resolveImageTarget(templateID: templateID, confidence: confidence, searchRegion: config.searchRegion)
        case let .color(hex, tolerance):
            return try resolveColorTarget(hex: hex, tolerance: tolerance, searchRegion: config.searchRegion)
        case let .accessibility(label, role, identifier):
            return try resolveAccessibilityTarget(label: label, role: role, identifier: identifier)
        case let .ocr(query, useRegex):
            return try await resolveOCRTarget(query: query, useRegex: useRegex, searchRegion: config.searchRegion, policy: ocrPolicy)
        }
    }

    private func resolveImageTarget(templateID: UUID, confidence: Double, searchRegion: ClickRect?) async throws -> ClickPoint {
        guard let template = try await templateStore.loadTemplate(id: templateID) else {
            throw TargetingError.templateUnavailable(templateID)
        }

        guard let screenshot = captureScreenCGImage(searchRegion) else {
            throw TargetingError.noScreenImage
        }

        // Placeholder matcher: compare average luminance and return center of search region on threshold pass.
        let templateLuma = averageLuminance(template)
        let screenLuma = averageLuminance(screenshot)
        let score = 1 - min(1, abs(templateLuma - screenLuma))
        guard score >= confidence else {
            throw TargetingError.noMatchFound
        }

        let rect = searchRegion ?? fullScreenRect()
        return ClickPoint(x: rect.x + rect.width / 2, y: rect.y + rect.height / 2)
    }

    private func resolveColorTarget(hex: String, tolerance: Double, searchRegion: ClickRect?) throws -> ClickPoint {
        guard let screenshot = captureScreenCGImage(searchRegion) else {
            throw TargetingError.noScreenImage
        }
        guard let target = RGBColor(hex: hex) else {
            throw TargetingError.noMatchFound
        }

        let region = searchRegion ?? fullScreenRect()
        guard let provider = screenshot.dataProvider, let data = provider.data else {
            throw TargetingError.noMatchFound
        }
        let ptr = CFDataGetBytePtr(data)
        let width = screenshot.width
        let height = screenshot.height
        let bytesPerPixel = 4
        let bytesPerRow = screenshot.bytesPerRow

        for y in 0..<height {
            for x in 0..<width {
                let offset = y * bytesPerRow + x * bytesPerPixel
                guard let ptr else { continue }
                let b = Double(ptr[offset])
                let g = Double(ptr[offset + 1])
                let r = Double(ptr[offset + 2])

                let color = RGBColor(r: r, g: g, b: b)
                if target.distance(to: color) <= tolerance * 442 {
                    return ClickPoint(x: region.x + Double(x), y: region.y + Double(y))
                }
            }
        }

        throw TargetingError.noMatchFound
    }

    private func resolveAccessibilityTarget(label: String?, role: String?, identifier: String?) throws -> ClickPoint {
        guard let app = NSWorkspace.shared.frontmostApplication else {
            throw TargetingError.inaccessibleAXHierarchy
        }
        let appElement = AXUIElementCreateApplication(app.processIdentifier)

        guard let match = findAXElement(
            startingAt: appElement,
            label: label,
            role: role,
            identifier: identifier,
            depth: 0
        ) else {
            throw TargetingError.noMatchFound
        }

        var positionValue: CFTypeRef?
        var sizeValue: CFTypeRef?
        AXUIElementCopyAttributeValue(match, kAXPositionAttribute as CFString, &positionValue)
        AXUIElementCopyAttributeValue(match, kAXSizeAttribute as CFString, &sizeValue)

        guard
            let positionValue,
            let sizeValue,
            CFGetTypeID(positionValue) == AXValueGetTypeID(),
            CFGetTypeID(sizeValue) == AXValueGetTypeID()
        else {
            throw TargetingError.noMatchFound
        }
        let posValue = positionValue as! AXValue
        let sizeVal = sizeValue as! AXValue

        var point = CGPoint.zero
        var size = CGSize.zero
        AXValueGetValue(posValue, .cgPoint, &point)
        AXValueGetValue(sizeVal, .cgSize, &size)

        return ClickPoint(x: point.x + size.width / 2, y: point.y + size.height / 2)
    }

    private func resolveOCRTarget(
        query: String,
        useRegex: Bool,
        searchRegion: ClickRect?,
        policy: OCRBackendPolicy
    ) async throws -> ClickPoint {
        guard let screenshot = captureScreenCGImage(searchRegion) else {
            throw TargetingError.noScreenImage
        }
        let region = searchRegion ?? fullScreenRect()

        switch policy {
        case .visionOnly:
            if let box = try await visionOCR.findMatch(in: screenshot, query: query, regex: useRegex) {
                return mapVisionRectToScreen(box, in: region)
            }
        case .visionPreferredWithTesseractFallback:
            if let box = try await visionOCR.findMatch(in: screenshot, query: query, regex: useRegex) {
                return mapVisionRectToScreen(box, in: region)
            }
            if let box = try await tesseractOCR.findMatch(in: screenshot, query: query, regex: useRegex) {
                return ClickPoint(x: region.x + box.midX, y: region.y + box.midY)
            }
        case .tesseractOnly:
            guard let box = try await tesseractOCR.findMatch(in: screenshot, query: query, regex: useRegex) else {
                throw TargetingError.noMatchFound
            }
            return ClickPoint(x: region.x + box.midX, y: region.y + box.midY)
        }

        throw TargetingError.noMatchFound
    }

    private func captureScreenCGImage(_ searchRegion: ClickRect?) -> CGImage? {
        let rect = if let searchRegion {
            CGRect(x: searchRegion.x, y: searchRegion.y, width: searchRegion.width, height: searchRegion.height)
        } else {
            CGRect.infinite
        }
        return CGWindowListCreateImage(rect, .optionOnScreenOnly, kCGNullWindowID, .bestResolution)
    }

    private func fullScreenRect() -> ClickRect {
        let frame = NSScreen.main?.frame ?? .zero
        return ClickRect(x: frame.origin.x, y: frame.origin.y, width: frame.size.width, height: frame.size.height)
    }

    private func averageLuminance(_ image: CGImage) -> Double {
        guard let provider = image.dataProvider, let data = provider.data else { return 0.5 }
        guard let ptr = CFDataGetBytePtr(data) else { return 0.5 }

        let pixelCount = image.width * image.height
        let stride = 4
        var total = 0.0

        for index in 0..<pixelCount {
            let base = index * stride
            let b = Double(ptr[base])
            let g = Double(ptr[base + 1])
            let r = Double(ptr[base + 2])
            total += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0
        }

        return total / Double(max(1, pixelCount))
    }

    private func findAXElement(
        startingAt root: AXUIElement,
        label: String?,
        role: String?,
        identifier: String?,
        depth: Int
    ) -> AXUIElement? {
        guard depth <= 8 else { return nil }

        if matches(root, label: label, role: role, identifier: identifier) {
            return root
        }

        var childrenValue: CFTypeRef?
        AXUIElementCopyAttributeValue(root, kAXChildrenAttribute as CFString, &childrenValue)
        guard let children = childrenValue as? [AXUIElement] else {
            return nil
        }

        for child in children {
            if let found = findAXElement(startingAt: child, label: label, role: role, identifier: identifier, depth: depth + 1) {
                return found
            }
        }
        return nil
    }

    private func matches(_ element: AXUIElement, label: String?, role: String?, identifier: String?) -> Bool {
        func read(_ attr: CFString) -> String? {
            var value: CFTypeRef?
            AXUIElementCopyAttributeValue(element, attr, &value)
            return value as? String
        }

        let currentLabel = read(kAXTitleAttribute as CFString)
        let currentRole = read(kAXRoleAttribute as CFString)
        let currentIdentifier = read(kAXIdentifierAttribute as CFString)

        let labelMatch = label == nil || currentLabel == label
        let roleMatch = role == nil || currentRole == role
        let identifierMatch = identifier == nil || currentIdentifier == identifier
        return labelMatch && roleMatch && identifierMatch
    }

    private func mapVisionRectToScreen(_ rect: CGRect, in searchRegion: ClickRect) -> ClickPoint {
        let x = searchRegion.x + rect.midX * searchRegion.width
        let y = searchRegion.y + (1 - rect.midY) * searchRegion.height
        return ClickPoint(x: x, y: y)
    }
}

public actor TemplateStore {
    private let fileManager = FileManager.default

    public init() {}

    public func saveTemplate(_ image: CGImage, id: UUID) throws {
        let url = try templateURL(for: id)
        try fileManager.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        let bitmapRep = NSBitmapImageRep(cgImage: image)
        guard let data = bitmapRep.representation(using: .png, properties: [:]) else {
            throw CocoaError(.fileWriteUnknown)
        }
        try data.write(to: url, options: .atomic)
    }

    public func loadTemplate(id: UUID) throws -> CGImage? {
        let url = try templateURL(for: id)
        guard fileManager.fileExists(atPath: url.path) else { return nil }
        guard let image = NSImage(contentsOf: url),
              let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
            return nil
        }
        return cgImage
    }

    private func templateURL(for id: UUID) throws -> URL {
        guard let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
            throw CocoaError(.fileNoSuchFile)
        }
        return appSupport
            .appendingPathComponent("autoclicker", isDirectory: true)
            .appendingPathComponent("templates", isDirectory: true)
            .appendingPathComponent("\(id.uuidString).png")
    }
}

private struct RGBColor {
    var r: Double
    var g: Double
    var b: Double

    init(r: Double, g: Double, b: Double) {
        self.r = r
        self.g = g
        self.b = b
    }

    init?(hex: String) {
        let cleaned = hex.replacingOccurrences(of: "#", with: "")
        guard cleaned.count == 6, let value = Int(cleaned, radix: 16) else { return nil }
        self.r = Double((value >> 16) & 0xFF)
        self.g = Double((value >> 8) & 0xFF)
        self.b = Double(value & 0xFF)
    }

    func distance(to other: RGBColor) -> Double {
        let dr = r - other.r
        let dg = g - other.g
        let db = b - other.b
        return sqrt(dr * dr + dg * dg + db * db)
    }
}

private actor VisionOCRService {
    func findMatch(in image: CGImage, query: String, regex: Bool) async throws -> CGRect? {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = false

        let handler = VNImageRequestHandler(cgImage: image)
        try handler.perform([request])

        guard let observations = request.results else { return nil }
        let matcher = TextMatcher(query: query, regex: regex)

        for observation in observations {
            guard let candidate = observation.topCandidates(1).first else { continue }
            if matcher.matches(candidate.string) {
                return observation.boundingBox
            }
        }
        return nil
    }
}

private actor TesseractOCRService {
    func findMatch(in image: CGImage, query: String, regex: Bool) async throws -> CGRect? {
        let tempDirectory = URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
        let imageURL = tempDirectory.appendingPathComponent("autoclicker-ocr-\(UUID().uuidString).png")
        let outputBase = tempDirectory.appendingPathComponent("autoclicker-ocr-\(UUID().uuidString)")

        defer {
            try? FileManager.default.removeItem(at: imageURL)
            try? FileManager.default.removeItem(at: outputBase.appendingPathExtension("tsv"))
        }

        let bitmapRep = NSBitmapImageRep(cgImage: image)
        guard let png = bitmapRep.representation(using: .png, properties: [:]) else { return nil }
        try png.write(to: imageURL, options: .atomic)

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = [
            "tesseract",
            imageURL.path,
            outputBase.path,
            "tsv"
        ]

        let outputPipe = Pipe()
        process.standardError = outputPipe

        do {
            try process.run()
            process.waitUntilExit()
        } catch {
            return nil
        }

        guard process.terminationStatus == 0 else { return nil }

        let tsvURL = outputBase.appendingPathExtension("tsv")
        guard let content = try? String(contentsOf: tsvURL) else { return nil }
        let matcher = TextMatcher(query: query, regex: regex)

        for line in content.split(separator: "\n").dropFirst() {
            let columns = line.split(separator: "\t", omittingEmptySubsequences: false)
            guard columns.count >= 12 else { continue }
            let text = String(columns[11])
            guard matcher.matches(text) else { continue }
            guard
                let left = Double(columns[6]),
                let top = Double(columns[7]),
                let width = Double(columns[8]),
                let height = Double(columns[9])
            else { continue }
            return CGRect(x: left, y: top, width: width, height: height)
        }
        return nil
    }
}

private struct TextMatcher {
    let query: String
    let regex: Bool

    func matches(_ text: String) -> Bool {
        if regex {
            return text.range(of: query, options: .regularExpression) != nil
        }
        return text.localizedCaseInsensitiveContains(query)
    }
}
