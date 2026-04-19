import Foundation

public struct HumanizationConfiguration: Codable, Hashable, Sendable {
    public enum Preset: String, Codable, CaseIterable, Sendable {
        case off
        case subtle
        case natural
        case heavy
    }

    public var preset: Preset
    public var jitterSigmaPixels: Double
    public var timingVariancePercent: Double
    public var holdVarianceMilliseconds: Int
    public var usesBezierMotion: Bool
    public var movementSpeedPixelsPerSecond: Double
    public var idleWiggleEnabled: Bool
    public var deterministicSeed: UInt64?

    public init(
        preset: Preset,
        jitterSigmaPixels: Double,
        timingVariancePercent: Double,
        holdVarianceMilliseconds: Int,
        usesBezierMotion: Bool,
        movementSpeedPixelsPerSecond: Double,
        idleWiggleEnabled: Bool,
        deterministicSeed: UInt64?
    ) {
        self.preset = preset
        self.jitterSigmaPixels = jitterSigmaPixels
        self.timingVariancePercent = timingVariancePercent
        self.holdVarianceMilliseconds = holdVarianceMilliseconds
        self.usesBezierMotion = usesBezierMotion
        self.movementSpeedPixelsPerSecond = movementSpeedPixelsPerSecond
        self.idleWiggleEnabled = idleWiggleEnabled
        self.deterministicSeed = deterministicSeed
    }

    public static let `default` = HumanizationConfiguration(
        preset: .natural,
        jitterSigmaPixels: 1.5,
        timingVariancePercent: 0.1,
        holdVarianceMilliseconds: 20,
        usesBezierMotion: true,
        movementSpeedPixelsPerSecond: 900,
        idleWiggleEnabled: false,
        deterministicSeed: nil
    )
}
