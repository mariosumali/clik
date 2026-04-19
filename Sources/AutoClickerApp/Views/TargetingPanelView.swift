import SwiftUI
import AutoClickerCore

struct TargetingPanelView: View {
    enum ModeChoice: String, CaseIterable, Identifiable {
        case fixed
        case boundingBox
        case image
        case color
        case accessibility
        case ocr

        var id: String { rawValue }
    }

    @State private var mode: ModeChoice = .fixed
    @State private var x = 400.0
    @State private var y = 300.0
    @State private var width = 200.0
    @State private var height = 120.0
    @State private var colorHex = "#00FF88"
    @State private var colorTolerance = 0.2
    @State private var axLabel = ""
    @State private var axRole = ""
    @State private var axIdentifier = ""
    @State private var ocrQuery = "Start"
    @State private var useRegex = false
    @State private var ocrPolicy: OCRBackendPolicy = .visionPreferredWithTesseractFallback
    @State private var lastResult = "No target resolved yet"

    private let targetingEngine = TargetingEngine()

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Targeting")
                .font(.title2.bold())

            Picker("Target Mode", selection: $mode) {
                ForEach(ModeChoice.allCases) { mode in
                    Text(mode.rawValue.capitalized).tag(mode)
                }
            }
            .pickerStyle(.segmented)

            Group {
                switch mode {
                case .fixed:
                    pointInputs
                case .boundingBox:
                    pointInputs
                    rectInputs
                case .image:
                    Text("Template-based image matching uses saved template IDs from the template store.")
                        .foregroundStyle(.secondary)
                case .color:
                    pointInputs
                    TextField("Hex Color", text: $colorHex)
                    HStack {
                        Text("Tolerance")
                        Slider(value: $colorTolerance, in: 0...1)
                        Text(String(format: "%.2f", colorTolerance))
                            .monospacedDigit()
                    }
                case .accessibility:
                    TextField("AX Label (optional)", text: $axLabel)
                    TextField("AX Role (optional)", text: $axRole)
                    TextField("AX Identifier (optional)", text: $axIdentifier)
                case .ocr:
                    TextField("OCR Query", text: $ocrQuery)
                    Toggle("Use Regex", isOn: $useRegex)
                    Picker("OCR Backend", selection: $ocrPolicy) {
                        Text("Vision").tag(OCRBackendPolicy.visionOnly)
                        Text("Vision + Tesseract").tag(OCRBackendPolicy.visionPreferredWithTesseractFallback)
                        Text("Tesseract").tag(OCRBackendPolicy.tesseractOnly)
                    }
                }
            }

            HStack {
                Button("Resolve Target") {
                    resolveTarget()
                }
                Text(lastResult)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()
        }
        .padding()
    }

    private var pointInputs: some View {
        HStack {
            Stepper("X: \(Int(x))", value: $x, in: 0...6000)
            Stepper("Y: \(Int(y))", value: $y, in: 0...4000)
        }
    }

    private var rectInputs: some View {
        HStack {
            Stepper("W: \(Int(width))", value: $width, in: 10...6000)
            Stepper("H: \(Int(height))", value: $height, in: 10...4000)
        }
    }

    private func resolveTarget() {
        let config: TargetingConfiguration

        switch mode {
        case .fixed:
            config = TargetingConfiguration(
                mode: .fixed(point: ClickPoint(x: x, y: y)),
                lockOnFirstMatch: false,
                searchRegion: nil,
                ocrPolicy: ocrPolicy
            )
        case .boundingBox:
            config = TargetingConfiguration(
                mode: .boundingBox(rect: ClickRect(x: x, y: y, width: width, height: height)),
                lockOnFirstMatch: false,
                searchRegion: ClickRect(x: x, y: y, width: width, height: height),
                ocrPolicy: ocrPolicy
            )
        case .image:
            config = TargetingConfiguration(
                mode: .image(templateID: UUID(), confidence: 0.7),
                lockOnFirstMatch: false,
                searchRegion: ClickRect(x: x, y: y, width: width, height: height),
                ocrPolicy: ocrPolicy
            )
        case .color:
            config = TargetingConfiguration(
                mode: .color(hex: colorHex, tolerance: colorTolerance),
                lockOnFirstMatch: false,
                searchRegion: ClickRect(x: x, y: y, width: width, height: height),
                ocrPolicy: ocrPolicy
            )
        case .accessibility:
            config = TargetingConfiguration(
                mode: .accessibility(
                    label: axLabel.isEmpty ? nil : axLabel,
                    role: axRole.isEmpty ? nil : axRole,
                    identifier: axIdentifier.isEmpty ? nil : axIdentifier
                ),
                lockOnFirstMatch: true,
                searchRegion: nil,
                ocrPolicy: ocrPolicy
            )
        case .ocr:
            config = TargetingConfiguration(
                mode: .ocr(query: ocrQuery, useRegex: useRegex),
                lockOnFirstMatch: false,
                searchRegion: ClickRect(x: x, y: y, width: width, height: height),
                ocrPolicy: ocrPolicy
            )
        }

        Task {
            do {
                let point = try await targetingEngine.resolve(config: config, ocrPolicy: ocrPolicy)
                lastResult = String(format: "Resolved @ (%.1f, %.1f)", point.x, point.y)
            } catch {
                lastResult = "Resolution failed: \(error.localizedDescription)"
            }
        }
    }
}
