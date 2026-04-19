// clik-helper: reads newline-delimited JSON from stdin, issues CGEvent mouse clicks.
// Protocol:
//   input  (one per line): {"id":123,"button":"left"|"right"|"middle","kind":"single"|"double"|"hold"|"release","x":<double>|null,"y":<double>|null}
//   output (one per line): {"id":123,"ok":true} | {"id":123,"ok":false,"err":"..."}
//   startup:               {"event":"ready","trusted":true|false}
//
// On launch we call AXIsProcessTrustedWithOptions([kAXTrustedCheckOptionPrompt: true])
// so macOS shows its Accessibility prompt the first time the app runs a click.

import Foundation
import CoreGraphics
import ApplicationServices

// MARK: - Trust check

func checkTrusted(prompt: Bool) -> Bool {
    let key = "AXTrustedCheckOptionPrompt" as CFString
    let opts: CFDictionary = [key: prompt] as CFDictionary
    return AXIsProcessTrustedWithOptions(opts)
}

// MARK: - Click driver

func mouseButton(_ name: String) -> CGMouseButton? {
    switch name {
    case "left":   return .left
    case "right":  return .right
    case "middle": return .center
    default:       return nil
    }
}

func eventTypes(for button: CGMouseButton) -> (down: CGEventType, up: CGEventType) {
    switch button {
    case .left:   return (.leftMouseDown, .leftMouseUp)
    case .right:  return (.rightMouseDown, .rightMouseUp)
    case .center: return (.otherMouseDown, .otherMouseUp)
    @unknown default: return (.leftMouseDown, .leftMouseUp)
    }
}

func currentCursor() -> CGPoint {
    if let loc = CGEvent(source: nil)?.location { return loc }
    return .zero
}

func postClick(button: CGMouseButton, at point: CGPoint, clickCount: Int64, kind: String) -> String? {
    let (downType, upType) = eventTypes(for: button)

    func make(_ type: CGEventType) -> CGEvent? {
        guard let ev = CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: point, mouseButton: button) else {
            return nil
        }
        ev.setIntegerValueField(.mouseEventClickState, value: clickCount)
        return ev
    }

    switch kind {
    case "single", "double":
        guard let down = make(downType), let up = make(upType) else {
            return "event-create-failed"
        }
        down.post(tap: .cghidEventTap)
        up.post(tap: .cghidEventTap)
    case "hold":
        guard let down = make(downType) else { return "event-create-failed" }
        down.post(tap: .cghidEventTap)
    case "release":
        guard let up = make(upType) else { return "event-create-failed" }
        up.post(tap: .cghidEventTap)
    default:
        return "unknown-kind"
    }
    return nil
}

// MARK: - IO

func writeLine(_ obj: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: obj, options: []),
          let s = String(data: data, encoding: .utf8) else { return }
    FileHandle.standardOutput.write(Data((s + "\n").utf8))
}

// Emit readiness so the parent knows we are alive.
writeLine(["event": "ready", "trusted": checkTrusted(prompt: true)])

// MARK: - Main loop

while let line = readLine(strippingNewline: true) {
    if line.isEmpty { continue }
    guard let data = line.data(using: .utf8),
          let root = try? JSONSerialization.jsonObject(with: data, options: []) as? [String: Any] else {
        writeLine(["ok": false, "err": "bad-json"])
        continue
    }

    let id = root["id"] as? Int ?? 0
    let cmd = root["cmd"] as? String ?? "click"

    if cmd == "ping" {
        writeLine(["id": id, "ok": true])
        continue
    }

    if cmd == "trust" {
        writeLine(["id": id, "ok": true, "trusted": checkTrusted(prompt: true)])
        continue
    }

    guard let buttonName = root["button"] as? String, let button = mouseButton(buttonName) else {
        writeLine(["id": id, "ok": false, "err": "bad-button"])
        continue
    }
    let kind = root["kind"] as? String ?? "single"

    let point: CGPoint
    if let x = root["x"] as? Double, let y = root["y"] as? Double {
        point = CGPoint(x: x, y: y)
    } else {
        point = currentCursor()
    }

    let clickCount: Int64 = kind == "double" ? 2 : 1
    if let err = postClick(button: button, at: point, clickCount: clickCount, kind: kind) {
        writeLine(["id": id, "ok": false, "err": err])
    } else {
        if kind == "double" {
            // second click in pair (CGEvent semantics).
            _ = postClick(button: button, at: point, clickCount: 2, kind: "single")
        }
        writeLine(["id": id, "ok": true])
    }
}
