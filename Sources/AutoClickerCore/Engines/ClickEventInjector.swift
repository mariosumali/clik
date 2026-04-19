import Foundation
import CoreGraphics

public struct ClickAction: Sendable {
    public var clickType: ClickEngineConfiguration.ClickType
    public var point: ClickPoint
    public var holdMilliseconds: Int
    public var movementPath: [ClickPoint]

    public init(
        clickType: ClickEngineConfiguration.ClickType,
        point: ClickPoint,
        holdMilliseconds: Int,
        movementPath: [ClickPoint]
    ) {
        self.clickType = clickType
        self.point = point
        self.holdMilliseconds = holdMilliseconds
        self.movementPath = movementPath
    }
}

public protocol ClickInjecting: Sendable {
    func perform(_ action: ClickAction) throws
}

public final class ClickEventInjector: @unchecked Sendable, ClickInjecting {
    public init() {}

    public func perform(_ action: ClickAction) throws {
        if action.movementPath.count > 1 {
            try moveCursor(path: action.movementPath)
        }

        switch action.clickType {
        case .left:
            try click(at: action.point, button: .left, holdMilliseconds: action.holdMilliseconds)
        case .right:
            try click(at: action.point, button: .right, holdMilliseconds: action.holdMilliseconds)
        case .middle:
            try click(at: action.point, button: .center, holdMilliseconds: action.holdMilliseconds)
        case .double:
            try click(at: action.point, button: .left, holdMilliseconds: action.holdMilliseconds, clickState: 1)
            try click(at: action.point, button: .left, holdMilliseconds: action.holdMilliseconds, clickState: 2)
        case .hold:
            try click(at: action.point, button: .left, holdMilliseconds: action.holdMilliseconds)
        case .drag:
            try drag(at: action.point, holdMilliseconds: action.holdMilliseconds)
        case .scroll:
            try scroll(lines: 3)
        }
    }

    private func moveCursor(path: [ClickPoint]) throws {
        for point in path {
            let cgPoint = CGPoint(x: point.x, y: point.y)
            guard let move = CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: cgPoint, mouseButton: .left) else {
                throw CocoaError(.coderInvalidValue)
            }
            move.post(tap: .cghidEventTap)
            usleep(4_000)
        }
    }

    private func click(
        at point: ClickPoint,
        button: CGMouseButton,
        holdMilliseconds: Int,
        clickState: Int64 = 1
    ) throws {
        let cgPoint = CGPoint(x: point.x, y: point.y)
        let downType = mouseDownType(for: button)
        let upType = mouseUpType(for: button)

        guard
            let down = CGEvent(mouseEventSource: nil, mouseType: downType, mouseCursorPosition: cgPoint, mouseButton: button),
            let up = CGEvent(mouseEventSource: nil, mouseType: upType, mouseCursorPosition: cgPoint, mouseButton: button)
        else {
            throw CocoaError(.coderInvalidValue)
        }

        down.setIntegerValueField(.mouseEventClickState, value: clickState)
        up.setIntegerValueField(.mouseEventClickState, value: clickState)
        down.post(tap: .cghidEventTap)
        usleep(useconds_t(max(1, holdMilliseconds) * 1000))
        up.post(tap: .cghidEventTap)
    }

    private func drag(at point: ClickPoint, holdMilliseconds: Int) throws {
        let start = CGPoint(x: point.x, y: point.y)
        let end = CGPoint(x: point.x + 80, y: point.y + 40)

        guard
            let down = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: start, mouseButton: .left),
            let drag = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDragged, mouseCursorPosition: end, mouseButton: .left),
            let up = CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: end, mouseButton: .left)
        else {
            throw CocoaError(.coderInvalidValue)
        }

        down.post(tap: .cghidEventTap)
        usleep(useconds_t(max(1, holdMilliseconds) * 1000))
        drag.post(tap: .cghidEventTap)
        up.post(tap: .cghidEventTap)
    }

    private func scroll(lines: Int32) throws {
        guard let scroll = CGEvent(scrollWheelEvent2Source: nil, units: .line, wheelCount: 1, wheel1: lines, wheel2: 0, wheel3: 0) else {
            throw CocoaError(.coderInvalidValue)
        }
        scroll.post(tap: .cghidEventTap)
    }

    private func mouseDownType(for button: CGMouseButton) -> CGEventType {
        switch button {
        case .left:
            return .leftMouseDown
        case .right:
            return .rightMouseDown
        case .center:
            return .otherMouseDown
        @unknown default:
            return .leftMouseDown
        }
    }

    private func mouseUpType(for button: CGMouseButton) -> CGEventType {
        switch button {
        case .left:
            return .leftMouseUp
        case .right:
            return .rightMouseUp
        case .center:
            return .otherMouseUp
        @unknown default:
            return .leftMouseUp
        }
    }
}
