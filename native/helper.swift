// clik-helper: reads newline-delimited JSON from stdin, issues CGEvent mouse clicks.
// Protocol:
//   input  (one per line):
//     click:   {"id":N,"cmd":"click","button":"left"|"right"|"middle","kind":"single"|"double"|"hold"|"release","x":<pt>|null,"y":<pt>|null}
//     move:    {"id":N,"cmd":"move","x":<pt>,"y":<pt>,
//              "style":"teleport"|"linear"|"bezier"|"human",
//              "durationMs":<int>,"curvature":<0-1>,"jitter":<0-1>}
//     ping:    {"id":N,"cmd":"ping"}
//     trust:   {"id":N,"cmd":"trust"}              // Accessibility permission
//     capture: {"id":N,"cmd":"capture","x":<pt>,"y":<pt>,"w":<pt>,"h":<pt>,"toClipboard":true?}
//     sample:  {"id":N,"cmd":"sample","x":<pt>,"y":<pt>}
//     match:   {"id":N,"cmd":"match","png":"<base64>","x":<pt>,"y":<pt>,"w":<pt>,"h":<pt>,"threshold":<0-1>}
//     scroll:  {"id":N,"cmd":"scroll","dx":<lines>,"dy":<lines>,"x":<pt>|null,"y":<pt>|null}
//     keypress:{"id":N,"cmd":"keypress","key":"a","modifiers":["cmd","shift",...]}
//     type:    {"id":N,"cmd":"type","text":"hello","perCharDelayMs":<int>}
//     drag:    {"id":N,"cmd":"drag","button":"left","x1":<pt>,"y1":<pt>,"x2":<pt>,"y2":<pt>,"steps":<int>,"stepDelayMs":<int>}
//   output (one per line): {"id":N,"ok":true,...} | {"id":N,"ok":false,"err":"..."}
//   startup:               {"event":"ready","trusted":true|false}
//
// Coordinates are macOS screen points (same coordinate space as CGEventPost / click).
// Capture + match also request Screen Recording permission on first use (macOS 10.15+).

import Foundation
import CoreGraphics
import ApplicationServices
import AppKit

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

// Posts a single mouseMoved event at the given screen-point location.
@discardableResult
func postMove(to point: CGPoint) -> String? {
    guard let ev = CGEvent(
        mouseEventSource: nil,
        mouseType: .mouseMoved,
        mouseCursorPosition: point,
        mouseButton: .left
    ) else {
        return "event-create-failed"
    }
    ev.post(tap: .cghidEventTap)
    return nil
}

// MARK: - Cursor animation

// Cubic-bezier interpolation. P0/P3 = endpoints, P1/P2 = control handles.
func cubicBezier(_ t: Double, _ p0: CGPoint, _ p1: CGPoint, _ p2: CGPoint, _ p3: CGPoint) -> CGPoint {
    let u = 1.0 - t
    let b0 = u * u * u
    let b1 = 3.0 * u * u * t
    let b2 = 3.0 * u * t * t
    let b3 = t * t * t
    return CGPoint(
        x: b0 * p0.x + b1 * p1.x + b2 * p2.x + b3 * p3.x,
        y: b0 * p0.y + b1 * p1.y + b2 * p2.y + b3 * p3.y
    )
}

// Symmetric ease-in-out cubic — the default timing curve. Start slow, peak in
// the middle, ease to a stop.
func easeInOutCubic(_ t: Double) -> Double {
    return t < 0.5 ? 4 * t * t * t : 1 - pow(-2 * t + 2, 3) / 2
}

// Ease-out-cubic — fast initial motion, decelerating into the target. Used for
// "human" style where people tend to overshoot quickly and home in.
func easeOutCubic(_ t: Double) -> Double {
    return 1 - pow(1 - t, 3)
}

// Deterministic-per-call small hash used to phase the jitter signal so two
// consecutive moves don't wobble in lock-step.
private var phaseSeed: UInt64 = UInt64(Date().timeIntervalSince1970 * 1000)
func nextPhase() -> Double {
    phaseSeed &+= 0x9E3779B97F4A7C15
    let bits = phaseSeed >> 11
    return Double(bits) / Double(UInt64.max >> 11) * .pi * 2
}

// Animated move from `start` to `end` using `style`. This call blocks the
// helper's stdin pump for `durationMs`; autonomy issues moves serially so
// that's acceptable. Clamp durationMs to [0, 10_000] as a safety rail.
func animatedMove(
    from start: CGPoint,
    to end: CGPoint,
    style: String,
    durationMs: Int,
    curvature: Double,
    jitter: Double
) -> String? {
    let clampedDuration = max(0, min(10_000, durationMs))
    if style == "teleport" || clampedDuration <= 0 {
        return postMove(to: end)
    }

    let dx = end.x - start.x
    let dy = end.y - start.y
    let dist = (dx * dx + dy * dy).squareRoot()
    // Nothing to animate — just snap.
    if dist < 0.5 {
        return postMove(to: end)
    }

    // Perpendicular (left-hand normal) unit vector to the straight path.
    let perpX = -dy / dist
    let perpY = dx / dist

    // Which side of the line to arc around. Random per-move so repeated human
    // moves don't trace the same path.
    let sideSign: Double = Bool.random() ? 1.0 : -1.0
    let clampedCurve = max(0.0, min(1.0, curvature))
    let clampedJitter = max(0.0, min(1.0, jitter))

    // Control-point offset scales with distance so short hops arc subtly and
    // long hauls arc boldly. 0.45 keeps the arc visible without looping.
    let controlOffset = dist * clampedCurve * 0.45 * sideSign

    // Control points sit at ~1/3 and ~2/3 of the straight path, pushed off by
    // controlOffset along the normal. For 'human' we also wiggle them a bit.
    var c1 = CGPoint(
        x: start.x + dx / 3.0 + perpX * controlOffset,
        y: start.y + dy / 3.0 + perpY * controlOffset
    )
    var c2 = CGPoint(
        x: start.x + dx * 2.0 / 3.0 + perpX * controlOffset,
        y: start.y + dy * 2.0 / 3.0 + perpY * controlOffset
    )
    if style == "human" {
        let wobble = dist * 0.04
        c1.x += Double.random(in: -wobble...wobble)
        c1.y += Double.random(in: -wobble...wobble)
        c2.x += Double.random(in: -wobble...wobble)
        c2.y += Double.random(in: -wobble...wobble)
    }

    let useBezier = style == "bezier" || style == "human"
    let easing: (Double) -> Double = (style == "human") ? easeOutCubic : easeInOutCubic

    // Target ~240 Hz animation, capped by duration to keep the loop bounded.
    let frameHz = 240.0
    let totalFrames = max(2, Int(Double(clampedDuration) / 1000.0 * frameHz))

    // Phase offsets so jitter isn't a pure sine.
    let phaseX = nextPhase()
    let phaseY = nextPhase()

    let startInstant = Date()
    let totalSeconds = Double(clampedDuration) / 1000.0

    for i in 1...totalFrames {
        let raw = Double(i) / Double(totalFrames)
        let t = easing(raw)

        var pt: CGPoint
        if useBezier {
            pt = cubicBezier(t, start, c1, c2, end)
        } else {
            pt = CGPoint(x: start.x + dx * t, y: start.y + dy * t)
        }

        if style == "human" && clampedJitter > 0 {
            // Gently fade jitter to zero near the endpoints so landings are clean.
            let edge = min(raw, 1 - raw) * 2.0
            let amp = clampedJitter * 2.5 * min(1.0, edge * 2.0)
            let j1 = sin(raw * .pi * 6 + phaseX) * amp
            let j2 = cos(raw * .pi * 7 + phaseY) * amp
            pt.x += j1
            pt.y += j2
        }

        postMove(to: pt)

        // Sleep until the next frame boundary so total wall time ≈ durationMs
        // even if postMove is quick. Use absolute timing (not per-frame sleep)
        // to avoid clock drift.
        let targetElapsed = totalSeconds * raw
        let actualElapsed = -startInstant.timeIntervalSinceNow
        let toSleep = targetElapsed - actualElapsed
        if toSleep > 0 {
            usleep(UInt32(toSleep * 1_000_000))
        }
    }

    // Guarantee the cursor lands exactly on the target, regardless of jitter.
    return postMove(to: end)
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

// MARK: - Screen capture + pixel ops

// Capture a region specified in macOS screen *points*. Returns the CGImage at
// the display's pixel resolution (width = points * displayScale). Callers
// ratio-scale template/search images to the same basis before matching.
func captureRect(pointsRect: CGRect) -> CGImage? {
    // CGWindowListCreateImage accepts rects in global screen points. `bestResolution`
    // preserves Retina density.
    return CGWindowListCreateImage(pointsRect, .optionOnScreenOnly, kCGNullWindowID, [.bestResolution])
}

// Render a CGImage into a tightly-packed grayscale byte buffer at a target size.
func rasterToGray(_ image: CGImage, width: Int, height: Int) -> [UInt8]? {
    guard width > 0, height > 0 else { return nil }
    let colorSpace = CGColorSpaceCreateDeviceGray()
    var buf = [UInt8](repeating: 0, count: width * height)
    let ok: Bool = buf.withUnsafeMutableBytes { raw -> Bool in
        guard let base = raw.baseAddress else { return false }
        guard let ctx = CGContext(
            data: base,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: width,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.none.rawValue
        ) else { return false }
        ctx.interpolationQuality = .medium
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        return true
    }
    return ok ? buf : nil
}

// Render a CGImage into a tightly-packed RGBA buffer (used to sample pixel colour).
func rasterToRGBA(_ image: CGImage, width: Int, height: Int) -> [UInt8]? {
    guard width > 0, height > 0 else { return nil }
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    var buf = [UInt8](repeating: 0, count: width * height * 4)
    let ok: Bool = buf.withUnsafeMutableBytes { raw -> Bool in
        guard let base = raw.baseAddress else { return false }
        let info = CGImageAlphaInfo.premultipliedLast.rawValue
        guard let ctx = CGContext(
            data: base,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: width * 4,
            space: colorSpace,
            bitmapInfo: info
        ) else { return false }
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        return true
    }
    return ok ? buf : nil
}

func pngBase64(from image: CGImage) -> String? {
    let rep = NSBitmapImageRep(cgImage: image)
    guard let data = rep.representation(using: .png, properties: [:]) else { return nil }
    return data.base64EncodedString()
}

func decodePngBase64(_ b64: String) -> CGImage? {
    guard let data = Data(base64Encoded: b64) else { return nil }
    guard let src = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
    return CGImageSourceCreateImageAtIndex(src, 0, nil)
}

// MARK: - Template matching (grayscale SAD with early-abort)

// Downscales both the search image and the template to a common coarse basis so
// the O(sw*sh*tw*th) SAD loop stays tractable. Returns the match offset (tx, ty)
// in the *coarse* search grid along with a normalised score in [0,1] (0 = perfect).
func matchTemplate(search: CGImage, template: CGImage) -> (cx: Int, cy: Int, score: Double, coarseScale: Double)? {
    // Cap the coarse search's longest edge at 240px; scale the template by the
    // same ratio so aspect ratios are preserved.
    let longest = max(search.width, search.height)
    let coarseScale = longest > 240 ? (240.0 / Double(longest)) : 1.0
    let sw = max(1, Int(Double(search.width) * coarseScale))
    let sh = max(1, Int(Double(search.height) * coarseScale))
    let tw = max(1, Int(Double(template.width) * coarseScale))
    let th = max(1, Int(Double(template.height) * coarseScale))

    guard tw >= 2, th >= 2, tw <= sw, th <= sh else { return nil }
    guard let s = rasterToGray(search, width: sw, height: sh),
          let t = rasterToGray(template, width: tw, height: th) else { return nil }

    let maxX = sw - tw
    let maxY = sh - th
    var bestSum: UInt64 = .max
    var bestX = 0
    var bestY = 0

    s.withUnsafeBufferPointer { sp in
        t.withUnsafeBufferPointer { tp in
            let sBase = sp.baseAddress!
            let tBase = tp.baseAddress!
            for y in 0...maxY {
                for x in 0...maxX {
                    var sum: UInt64 = 0
                    var abort = false
                    for ty in 0..<th {
                        let srcRow = sBase + ((y + ty) * sw + x)
                        let tplRow = tBase + (ty * tw)
                        var rowSum: UInt64 = 0
                        for tx in 0..<tw {
                            let d = Int(srcRow[tx]) - Int(tplRow[tx])
                            rowSum += UInt64(d < 0 ? -d : d)
                        }
                        sum &+= rowSum
                        if sum >= bestSum { abort = true; break }
                    }
                    if !abort && sum < bestSum {
                        bestSum = sum
                        bestX = x
                        bestY = y
                    }
                }
            }
        }
    }

    if bestSum == .max { return nil }
    let norm = Double(bestSum) / Double(tw * th * 255)
    return (bestX, bestY, norm, coarseScale)
}

// MARK: - Keyboard + scroll + drag

// Map printable keys and common named keys to macOS virtual key codes. Covers
// the US layout. Unknown keys fall back to CGEvent.keyboardSetUnicodeString
// which works for arbitrary Unicode characters but ignores modifiers.
func virtualKeyCode(for name: String) -> CGKeyCode? {
    let lower = name.lowercased()
    // Named keys first so single-letter names like "m" don't accidentally match.
    switch lower {
    case "enter", "return":   return 0x24
    case "tab":               return 0x30
    case "space", " ":        return 0x31
    case "backspace", "delete": return 0x33
    case "escape", "esc":     return 0x35
    case "arrowleft", "left": return 0x7B
    case "arrowright", "right": return 0x7C
    case "arrowdown", "down": return 0x7D
    case "arrowup", "up":     return 0x7E
    case "home":              return 0x73
    case "end":               return 0x77
    case "pageup":            return 0x74
    case "pagedown":          return 0x79
    case "forwarddelete", "fwddelete": return 0x75
    case "f1":  return 0x7A; case "f2":  return 0x78
    case "f3":  return 0x63; case "f4":  return 0x76
    case "f5":  return 0x60; case "f6":  return 0x61
    case "f7":  return 0x62; case "f8":  return 0x64
    case "f9":  return 0x65; case "f10": return 0x6D
    case "f11": return 0x67; case "f12": return 0x6F
    default: break
    }
    // Letters a–z and digit row 0–9.
    let letters: [String: CGKeyCode] = [
        "a": 0x00, "s": 0x01, "d": 0x02, "f": 0x03, "h": 0x04, "g": 0x05,
        "z": 0x06, "x": 0x07, "c": 0x08, "v": 0x09, "b": 0x0B, "q": 0x0C,
        "w": 0x0D, "e": 0x0E, "r": 0x0F, "y": 0x10, "t": 0x11, "1": 0x12,
        "2": 0x13, "3": 0x14, "4": 0x15, "6": 0x16, "5": 0x17, "=": 0x18,
        "9": 0x19, "7": 0x1A, "-": 0x1B, "8": 0x1C, "0": 0x1D, "]": 0x1E,
        "o": 0x1F, "u": 0x20, "[": 0x21, "i": 0x22, "p": 0x23, "l": 0x25,
        "j": 0x26, "'": 0x27, "k": 0x28, ";": 0x29, "\\": 0x2A, ",": 0x2B,
        "/": 0x2C, "n": 0x2D, "m": 0x2E, ".": 0x2F, "`": 0x32,
    ]
    return letters[lower]
}

func modifierFlags(from names: [String]) -> CGEventFlags {
    var flags: CGEventFlags = []
    for name in names {
        switch name.lowercased() {
        case "cmd", "command", "meta": flags.insert(.maskCommand)
        case "shift":                   flags.insert(.maskShift)
        case "opt", "option", "alt":    flags.insert(.maskAlternate)
        case "ctrl", "control":         flags.insert(.maskControl)
        case "fn":                      flags.insert(.maskSecondaryFn)
        default: break
        }
    }
    return flags
}

// Post a single key-down/up pair with modifiers. When the key isn't in the US
// virtual-key table, fall back to CGEventKeyboardSetUnicodeString (emits the
// literal character — modifiers won't work here, but it beats erroring out).
func postKeypress(key: String, modifiers: [String]) -> String? {
    let flags = modifierFlags(from: modifiers)
    if let vk = virtualKeyCode(for: key) {
        guard let down = CGEvent(keyboardEventSource: nil, virtualKey: vk, keyDown: true),
              let up   = CGEvent(keyboardEventSource: nil, virtualKey: vk, keyDown: false) else {
            return "event-create-failed"
        }
        down.flags = flags
        up.flags = flags
        down.post(tap: .cghidEventTap)
        up.post(tap: .cghidEventTap)
        return nil
    }
    // Unicode fallback — keycode 0 + setUnicodeString.
    guard let down = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: true),
          let up   = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: false) else {
        return "event-create-failed"
    }
    let scalars = Array(key.utf16)
    scalars.withUnsafeBufferPointer { ptr in
        if let base = ptr.baseAddress {
            down.keyboardSetUnicodeString(stringLength: ptr.count, unicodeString: base)
            up.keyboardSetUnicodeString(stringLength: ptr.count, unicodeString: base)
        }
    }
    down.flags = flags
    up.flags = flags
    down.post(tap: .cghidEventTap)
    up.post(tap: .cghidEventTap)
    return nil
}

// Type a literal UTF-16 string by emitting one key-down/up per code unit via
// CGEventKeyboardSetUnicodeString. Bypasses the layout so emoji and non-ASCII
// characters land correctly.
func postType(text: String, perCharDelayMs: Int) -> String? {
    let delayUs = UInt32(max(0, perCharDelayMs) * 1000)
    for ch in text.unicodeScalars {
        let utf16 = Array(String(ch).utf16)
        guard let down = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: true),
              let up   = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: false) else {
            return "event-create-failed"
        }
        utf16.withUnsafeBufferPointer { ptr in
            if let base = ptr.baseAddress {
                down.keyboardSetUnicodeString(stringLength: ptr.count, unicodeString: base)
                up.keyboardSetUnicodeString(stringLength: ptr.count, unicodeString: base)
            }
        }
        down.post(tap: .cghidEventTap)
        up.post(tap: .cghidEventTap)
        if delayUs > 0 { usleep(delayUs) }
    }
    return nil
}

// Scroll wheel event. `dx`/`dy` are in wheel "lines" (positive y = up, positive
// x = right) to match the convention used by most apps.
func postScroll(dx: Int32, dy: Int32, at point: CGPoint?) -> String? {
    if let p = point {
        postMove(to: p)
    }
    guard let ev = CGEvent(
        scrollWheelEvent2Source: nil,
        units: .line,
        wheelCount: 2,
        wheel1: dy,
        wheel2: dx,
        wheel3: 0
    ) else {
        return "event-create-failed"
    }
    ev.post(tap: .cghidEventTap)
    return nil
}

// Click-and-drag: post a mouseDown at (x1,y1), a run of mouseDragged events
// along the straight line to (x2,y2), then a mouseUp at the destination.
// `steps` is clamped to at least 2 so we always emit the endpoints.
func postDrag(
    button: CGMouseButton,
    from a: CGPoint,
    to b: CGPoint,
    steps: Int,
    stepDelayMs: Int
) -> String? {
    let (downType, upType) = eventTypes(for: button)
    let dragType: CGEventType
    switch button {
    case .left:   dragType = .leftMouseDragged
    case .right:  dragType = .rightMouseDragged
    case .center: dragType = .otherMouseDragged
    @unknown default: dragType = .leftMouseDragged
    }
    guard let down = CGEvent(mouseEventSource: nil, mouseType: downType, mouseCursorPosition: a, mouseButton: button) else {
        return "event-create-failed"
    }
    down.post(tap: .cghidEventTap)

    let n = max(2, steps)
    let delayUs = UInt32(max(0, stepDelayMs) * 1000)
    for i in 1...n {
        let t = Double(i) / Double(n)
        let p = CGPoint(x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t)
        guard let drag = CGEvent(mouseEventSource: nil, mouseType: dragType, mouseCursorPosition: p, mouseButton: button) else {
            return "event-create-failed"
        }
        drag.post(tap: .cghidEventTap)
        if delayUs > 0 { usleep(delayUs) }
    }
    guard let up = CGEvent(mouseEventSource: nil, mouseType: upType, mouseCursorPosition: b, mouseButton: button) else {
        return "event-create-failed"
    }
    up.post(tap: .cghidEventTap)
    return nil
}

// Copy a captured PNG onto the system pasteboard. Best-effort: failures are
// surfaced by the caller, not thrown.
func copyImageToClipboard(_ image: CGImage) -> Bool {
    let rep = NSBitmapImageRep(cgImage: image)
    guard let data = rep.representation(using: .png, properties: [:]) else { return false }
    let pb = NSPasteboard.general
    pb.clearContents()
    return pb.setData(data, forType: .png)
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

    if cmd == "move" {
        guard let x = root["x"] as? Double, let y = root["y"] as? Double else {
            writeLine(["id": id, "ok": false, "err": "bad-point"]); continue
        }
        let style = (root["style"] as? String) ?? "teleport"
        let durationMs = (root["durationMs"] as? Int)
            ?? Int((root["durationMs"] as? Double) ?? 0)
        let curvature = (root["curvature"] as? Double) ?? 0.3
        let jitter = (root["jitter"] as? Double) ?? 0.2
        let start = currentCursor()
        let end = CGPoint(x: x, y: y)
        if let err = animatedMove(
            from: start,
            to: end,
            style: style,
            durationMs: durationMs,
            curvature: curvature,
            jitter: jitter
        ) {
            writeLine(["id": id, "ok": false, "err": err])
        } else {
            writeLine(["id": id, "ok": true])
        }
        continue
    }

    if cmd == "capture" {
        guard let x = root["x"] as? Double, let y = root["y"] as? Double,
              let w = root["w"] as? Double, let h = root["h"] as? Double,
              w > 0, h > 0 else {
            writeLine(["id": id, "ok": false, "err": "bad-rect"]); continue
        }
        let rect = CGRect(x: x, y: y, width: w, height: h)
        guard let img = captureRect(pointsRect: rect) else {
            writeLine(["id": id, "ok": false, "err": "capture-failed"]); continue
        }
        guard let b64 = pngBase64(from: img) else {
            writeLine(["id": id, "ok": false, "err": "encode-failed"]); continue
        }
        var clipboardOk = false
        if (root["toClipboard"] as? Bool) == true {
            clipboardOk = copyImageToClipboard(img)
        }
        // Pixel dims vs point dims give the effective display scale used.
        let scale = w > 0 ? Double(img.width) / w : 1.0
        writeLine(["id": id, "ok": true, "png": b64,
                   "w": w, "h": h,
                   "pxW": img.width, "pxH": img.height,
                   "scale": scale,
                   "clipboardOk": clipboardOk])
        continue
    }

    if cmd == "scroll" {
        let dx = Int32((root["dx"] as? Double) ?? Double((root["dx"] as? Int) ?? 0))
        let dy = Int32((root["dy"] as? Double) ?? Double((root["dy"] as? Int) ?? 0))
        var pt: CGPoint? = nil
        if let x = root["x"] as? Double, let y = root["y"] as? Double {
            pt = CGPoint(x: x, y: y)
        }
        if let err = postScroll(dx: dx, dy: dy, at: pt) {
            writeLine(["id": id, "ok": false, "err": err])
        } else {
            writeLine(["id": id, "ok": true])
        }
        continue
    }

    if cmd == "keypress" {
        guard let key = root["key"] as? String, !key.isEmpty else {
            writeLine(["id": id, "ok": false, "err": "bad-key"]); continue
        }
        let mods = (root["modifiers"] as? [String]) ?? []
        if let err = postKeypress(key: key, modifiers: mods) {
            writeLine(["id": id, "ok": false, "err": err])
        } else {
            writeLine(["id": id, "ok": true])
        }
        continue
    }

    if cmd == "type" {
        guard let text = root["text"] as? String else {
            writeLine(["id": id, "ok": false, "err": "bad-text"]); continue
        }
        let delay = (root["perCharDelayMs"] as? Int) ?? Int((root["perCharDelayMs"] as? Double) ?? 0)
        if let err = postType(text: text, perCharDelayMs: delay) {
            writeLine(["id": id, "ok": false, "err": err])
        } else {
            writeLine(["id": id, "ok": true])
        }
        continue
    }

    if cmd == "drag" {
        guard let x1 = root["x1"] as? Double, let y1 = root["y1"] as? Double,
              let x2 = root["x2"] as? Double, let y2 = root["y2"] as? Double else {
            writeLine(["id": id, "ok": false, "err": "bad-args"]); continue
        }
        let buttonName = (root["button"] as? String) ?? "left"
        guard let button = mouseButton(buttonName) else {
            writeLine(["id": id, "ok": false, "err": "bad-button"]); continue
        }
        let steps = (root["steps"] as? Int) ?? Int((root["steps"] as? Double) ?? 24)
        let stepDelay = (root["stepDelayMs"] as? Int) ?? Int((root["stepDelayMs"] as? Double) ?? 8)
        if let err = postDrag(
            button: button,
            from: CGPoint(x: x1, y: y1),
            to: CGPoint(x: x2, y: y2),
            steps: steps,
            stepDelayMs: stepDelay
        ) {
            writeLine(["id": id, "ok": false, "err": err])
        } else {
            writeLine(["id": id, "ok": true])
        }
        continue
    }

    if cmd == "sample" {
        guard let x = root["x"] as? Double, let y = root["y"] as? Double else {
            writeLine(["id": id, "ok": false, "err": "bad-point"]); continue
        }
        // Capture a 1-point box at the cursor. The image may be 1×1 (non-Retina)
        // or 2×2 (Retina); averaging isn't important — we take the top-left pixel.
        let rect = CGRect(x: x, y: y, width: 1, height: 1)
        guard let img = captureRect(pointsRect: rect),
              let px = rasterToRGBA(img, width: img.width, height: img.height) else {
            writeLine(["id": id, "ok": false, "err": "capture-failed"]); continue
        }
        let r = Int(px[0]); let g = Int(px[1]); let b = Int(px[2])
        writeLine(["id": id, "ok": true, "r": r, "g": g, "b": b])
        continue
    }

    if cmd == "match" {
        guard let b64 = root["png"] as? String,
              let x = root["x"] as? Double, let y = root["y"] as? Double,
              let w = root["w"] as? Double, let h = root["h"] as? Double,
              w > 0, h > 0 else {
            writeLine(["id": id, "ok": false, "err": "bad-args"]); continue
        }
        let threshold = (root["threshold"] as? Double) ?? 0.25
        guard let tpl = decodePngBase64(b64) else {
            writeLine(["id": id, "ok": false, "err": "bad-template"]); continue
        }
        guard let search = captureRect(pointsRect: CGRect(x: x, y: y, width: w, height: h)) else {
            writeLine(["id": id, "ok": false, "err": "capture-failed"]); continue
        }
        guard let m = matchTemplate(search: search, template: tpl) else {
            writeLine(["id": id, "ok": true, "found": false, "score": 1.0]); continue
        }
        // Centre of the template in screen points. Coarse-grid position / coarseScale
        // reconstructs the full-resolution pixel offset; then divide by the display
        // scale (searchPxW / w) to convert to points.
        let coarseScale = m.coarseScale
        let fullOffsetPxX = Double(m.cx) / coarseScale
        let fullOffsetPxY = Double(m.cy) / coarseScale
        let fullTplPxW = Double(tpl.width)
        let fullTplPxH = Double(tpl.height)
        let dispScale = w > 0 ? Double(search.width) / w : 1.0
        let centerPointX = x + (fullOffsetPxX + fullTplPxW / 2.0) / dispScale
        let centerPointY = y + (fullOffsetPxY + fullTplPxH / 2.0) / dispScale
        let found = m.score <= threshold
        writeLine([
            "id": id, "ok": true,
            "found": found,
            "cx": centerPointX,
            "cy": centerPointY,
            "score": m.score,
        ])
        continue
    }

    // Default: click
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
