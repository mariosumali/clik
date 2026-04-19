import Foundation
import Darwin.Mach

public struct PerformanceBudgets: Sendable {
    public var idleCPUTargetPercent: Double
    public var activeCPUTargetPercent: Double
    public var visionHeavyCPUTargetPercent: Double
    public var typicalMemoryMB: Double
    public var warningMemoryMB: Double

    public init(
        idleCPUTargetPercent: Double = 1.5,
        activeCPUTargetPercent: Double = 5,
        visionHeavyCPUTargetPercent: Double = 20,
        typicalMemoryMB: Double = 250,
        warningMemoryMB: Double = 400
    ) {
        self.idleCPUTargetPercent = idleCPUTargetPercent
        self.activeCPUTargetPercent = activeCPUTargetPercent
        self.visionHeavyCPUTargetPercent = visionHeavyCPUTargetPercent
        self.typicalMemoryMB = typicalMemoryMB
        self.warningMemoryMB = warningMemoryMB
    }
}

public actor PerformanceBudgetMonitor {
    private let diagnostics: DiagnosticsLogger
    private let budgets: PerformanceBudgets

    public init(
        diagnostics: DiagnosticsLogger = DiagnosticsLogger(),
        budgets: PerformanceBudgets = PerformanceBudgets()
    ) {
        self.diagnostics = diagnostics
        self.budgets = budgets
    }

    public func evaluateMemoryFootprint() async {
        let memoryMB = currentMemoryMB()
        if memoryMB >= budgets.warningMemoryMB {
            await diagnostics.log("Memory warning threshold exceeded: \(Int(memoryMB))MB", channel: .performance)
        }
    }

    private func currentMemoryMB() -> Double {
        var info = mach_task_basic_info()
        var count = mach_msg_type_number_t(MemoryLayout<mach_task_basic_info>.size) / 4

        let result: kern_return_t = withUnsafeMutablePointer(to: &info) { pointer in
            pointer.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { reboundPointer in
                task_info(mach_task_self_, task_flavor_t(MACH_TASK_BASIC_INFO), reboundPointer, &count)
            }
        }

        guard result == KERN_SUCCESS else { return 0 }
        return Double(info.resident_size) / (1024 * 1024)
    }
}
