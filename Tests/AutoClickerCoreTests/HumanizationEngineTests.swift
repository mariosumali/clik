import Testing
import Foundation
@testable import AutoClickerCore

@Test
func deterministicSeedProducesStableOutput() async {
    let config = HumanizationConfiguration(
        preset: .natural,
        jitterSigmaPixels: 1.0,
        timingVariancePercent: 0.2,
        holdVarianceMilliseconds: 10,
        usesBezierMotion: true,
        movementSpeedPixelsPerSecond: 800,
        idleWiggleEnabled: false,
        deterministicSeed: 42
    )

    let engineA = HumanizationEngine(configuration: config)
    let engineB = HumanizationEngine(configuration: config)

    let first = await engineA.humanize(
        basePoint: ClickPoint(x: 100, y: 100),
        baseHoldMilliseconds: 50,
        baseIntervalMilliseconds: 120,
        previousPoint: ClickPoint(x: 80, y: 80)
    )
    let second = await engineB.humanize(
        basePoint: ClickPoint(x: 100, y: 100),
        baseHoldMilliseconds: 50,
        baseIntervalMilliseconds: 120,
        previousPoint: ClickPoint(x: 80, y: 80)
    )

    #expect(first.point == second.point)
    #expect(first.holdMilliseconds == second.holdMilliseconds)
    #expect(first.intervalMilliseconds == second.intervalMilliseconds)
    #expect(first.movementPath == second.movementPath)
}
