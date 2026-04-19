import Foundation

public struct HumanizedClickAction: Sendable {
    public var point: ClickPoint
    public var holdMilliseconds: Int
    public var intervalMilliseconds: Int
    public var movementPath: [ClickPoint]

    public init(point: ClickPoint, holdMilliseconds: Int, intervalMilliseconds: Int, movementPath: [ClickPoint]) {
        self.point = point
        self.holdMilliseconds = holdMilliseconds
        self.intervalMilliseconds = intervalMilliseconds
        self.movementPath = movementPath
    }
}

public actor HumanizationEngine {
    private var random: SeededGenerator
    private let configuration: HumanizationConfiguration

    public init(configuration: HumanizationConfiguration) {
        self.configuration = configuration
        self.random = SeededGenerator(seed: configuration.deterministicSeed ?? UInt64.random(in: 1...UInt64.max))
    }

    public func humanize(
        basePoint: ClickPoint,
        baseHoldMilliseconds: Int,
        baseIntervalMilliseconds: Int,
        previousPoint: ClickPoint?
    ) -> HumanizedClickAction {
        let jitteredPoint = applyJitter(basePoint)
        let hold = max(1, baseHoldMilliseconds + randomInt(delta: configuration.holdVarianceMilliseconds))
        let timingFactor = 1 + randomDouble(in: -configuration.timingVariancePercent...configuration.timingVariancePercent)
        let interval = max(1, Int(Double(baseIntervalMilliseconds) * timingFactor))
        let movementPath = makePath(from: previousPoint, to: jitteredPoint)

        return HumanizedClickAction(
            point: jitteredPoint,
            holdMilliseconds: hold,
            intervalMilliseconds: interval,
            movementPath: movementPath
        )
    }

    private func applyJitter(_ point: ClickPoint) -> ClickPoint {
        guard configuration.jitterSigmaPixels > 0 else { return point }

        let xNoise = gaussian(sigma: configuration.jitterSigmaPixels)
        let yNoise = gaussian(sigma: configuration.jitterSigmaPixels)
        return ClickPoint(x: point.x + xNoise, y: point.y + yNoise)
    }

    private func makePath(from source: ClickPoint?, to target: ClickPoint) -> [ClickPoint] {
        guard configuration.usesBezierMotion, let source else {
            return [target]
        }

        let control = ClickPoint(
            x: (source.x + target.x) / 2 + randomDouble(in: -30...30),
            y: (source.y + target.y) / 2 + randomDouble(in: -30...30)
        )

        return stride(from: 0.0, through: 1.0, by: 0.1).map { t in
            let inv = 1 - t
            let x = inv * inv * source.x + 2 * inv * t * control.x + t * t * target.x
            let y = inv * inv * source.y + 2 * inv * t * control.y + t * t * target.y
            return ClickPoint(x: x, y: y)
        }
    }

    private func gaussian(sigma: Double) -> Double {
        let u1 = max(0.000_001, randomDouble(in: 0...1))
        let u2 = randomDouble(in: 0...1)
        let z0 = sqrt(-2 * log(u1)) * cos(2 * .pi * u2)
        return z0 * sigma
    }

    private func randomDouble(in range: ClosedRange<Double>) -> Double {
        Double.random(in: range, using: &random)
    }

    private func randomInt(delta: Int) -> Int {
        guard delta > 0 else { return 0 }
        return Int.random(in: -delta...delta, using: &random)
    }
}

public struct SeededGenerator: RandomNumberGenerator, Sendable {
    private var state: UInt64

    public init(seed: UInt64) {
        self.state = seed == 0 ? 0x4D595DF4D0F33173 : seed
    }

    public mutating func next() -> UInt64 {
        state &+= 0x9E3779B97F4A7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58476D1CE4E5B9
        z = (z ^ (z >> 27)) &* 0x94D049BB133111EB
        return z ^ (z >> 31)
    }
}
