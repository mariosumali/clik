# PRD — mars-autoclicker (macOS Autoclicker)
**Version**: 1.0 Draft  
**Platform**: macOS 14+ (Sonoma)  
**Stack**: Swift 5.9+, SwiftUI, CGEvent / CGEventTap, Vision framework, AXUIElement API

---

## 1. Overview

autoclicker is a personal-use macOS automation tool designed to be the most capable autoclicker available on the platform. It combines a low-level click engine, macro recording and scripting, intelligent targeting (image/color recognition), humanization layers, and a full-featured SwiftUI UI — all running natively without Electron or web tech.

Target users span the full spectrum: power users automating repetitive workflows, gamers, accessibility users, and developers doing UI testing. The design must serve all of them without compromising capability for any.

---

## 2. Goals

- Surpass the feature set of every existing macOS autoclicker (MurGee, Steuererklärung, etc.)
- Zero-latency, system-level click injection using `CGEvent`
- Native performance — menu bar always accessible, full window when needed
- Profiles system allowing instant context switching
- Humanization that makes automated input indistinguishable from real usage
- Minimal system footprint when idle

---

## 3. Non-Goals (v1)

- Cloud sync or multi-device support
- App Store distribution (personal build only — avoids sandbox restrictions on CGEvent)


---

## 4. System Permissions Required

This app depends on multiple macOS privacy domains. Missing permissions must only disable impacted features, never crash or block app launch.

| Permission | Needed For | Request Timing | Denied Behavior |
| --- | --- | --- | --- |
| Accessibility | AX targeting, element inspection, interaction with protected UI contexts | On onboarding and when enabling AX targeting | AX targeting disabled; show actionable settings link |
| Input Monitoring | Global hotkeys, macro recorder event tap | On onboarding and first background hotkey/recording use | Background hotkeys and recorder disabled; manual controls still work |
| Screen Recording | Image matching, color scan, OCR, screen preview | On onboarding and first vision-based feature use | Image/color/OCR modes disabled; preview panel becomes unavailable |
| Microphone | Audio trigger support | First time audio trigger is enabled | Audio trigger type disabled only |
| Automation (optional) | Optional Apple Events integrations | Only when optional integration is enabled | Optional integration disabled; core runtime unaffected |

### 4.1 Permission UX Requirements
- Permission dashboard displays `Granted`, `Missing`, or `Not Required`.
- Each permission row includes one-click navigation to system settings.
- On first launch, run a guided setup flow with skip support and explicit tradeoff text.
- Missing permission warnings must be contextual (only shown where feature is used).
- Permission state changes should be logged locally for diagnostics.

## 5. App Architecture

### 5.1 App Presence

**Menu Bar**
- Always-visible menu bar icon showing current state: idle / running / paused
- Dropdown: Start/Stop, active profile name, click counter, quick access to profiles, open main window
- Status color indicator: gray (idle), green (running), amber (paused)

**Main Window**
- Full SwiftUI window, resizable, dark appearance
- Sections: Click Engine, Macro Editor, Targeting, Humanization, Triggers, Profiles
- Accessible via menu bar dropdown or `Cmd+Shift+K` global shortcut

**Floating HUD Overlay**
- Draggable, transparent, always-on-top overlay
- Shows: active/paused state, clicks elapsed, clicks/sec, current macro step, time running
- Toggle via hotkey; respects `Do Not Disturb` mode

---

## 6. Feature Specifications

### 6.1 Click Engine

**Click Types**
- Left click, right click, middle click
- Double click (configurable gap between clicks)
- Click and hold (configurable hold duration in ms)
- Click and drag (start coord → end coord, configurable speed)
- Scroll wheel (direction, amount, speed)

**Click Interval Modes**
- Fixed: exact ms between clicks
- Random range: uniform distribution between [min, max] ms
- Gaussian: normally distributed around a mean with configurable σ (most human-like)

**Click Duration**
- Configurable mousedown → mouseup hold time (default: 50ms, range: 1ms–5000ms)

**Coordinate Modes**
- Fixed point (absolute screen coordinates)
- Relative to active window (survives window moves)
- Follow cursor position at trigger time (click wherever cursor currently is)
- Random within bounding box (define a rect; each click picks a random point inside)

**Multi-monitor Support**
- Per-display coordinate spaces with correct Retina scaling (2x, 3x)
- Display selector in coordinate picker

---

### 6.2 Macro Recording & Playback

**Recorder**
- Record all mouse events: moves, clicks, scrolls, drags
- Record keyboard input alongside mouse events
- Capture timing between events (preserves natural pacing)
- Start/stop recording via hotkey

**Playback**
- Speed multiplier: 0.1x → 20x
- Loop count: N times, infinite (with kill switch), or until condition
- Playback position indicator (step N of M)

**Macro Editor**
- List of steps: each step shows type, coordinates, timing, notes
- Reorder steps via drag
- Edit individual step parameters inline
- Insert new steps at any position: Click, Move, Scroll, Key Press, Wait, Branch, Screenshot
- Delete / duplicate steps
- Group steps into labeled sub-routines (reusable blocks)

**Macro Script Format**
- Macros saved as `.cfmacro` (JSON under the hood)
- Import / export via file system
- Human-readable structure for manual editing in any text editor

**Conditional Branching**
- `IF color at (x,y) == #RRGGBB → jump to step N`
- `IF image found on screen → jump to step N`
- `IF click count >= N → stop`
- `LOOP N times`
- `WAIT until condition (with timeout)`

**Variables**
- Integer, float, boolean, string types
- Settable from step actions
- Usable in conditions and wait durations

---

### 6.3 Targeting

**Fixed Coordinate**
- Manual input (x, y)
- Visual picker: click to capture coordinates from a crosshair overlay

**Image Recognition**
- Vision framework `VNTemplateMatchingRequest`
- Capture template: select a screen region to use as target
- Confidence threshold slider (0.0–1.0)
- Search region: full screen or defined rect (performance optimization)
- Find first / find all / find center-of-largest modes
- Re-evaluate every click cycle vs. lock on first find toggle

**Color Targeting**
- Click the first pixel matching a hex color within a search region
- Tolerance slider (exact match → fuzzy match)
- Preview: highlight matched pixels in real time in the targeting panel

**Accessibility Tree Targeting**
- Target a UI element by its AXLabel, AXRole, or AXIdentifier
- App selector (target by frontmost app or specific app by bundle ID)
- Survives window resizes, DPI changes, and window moves
- Fallback: if AX element not found, skip or error

**OCR Targeting (stretch v1)**
- Vision `VNRecognizeTextRequest`
- Click element whose visible text matches a string or regex
- macOS 15+ only (flag as beta feature)

---

### 6.4 Humanization

All humanization parameters are independently toggleable and have their own intensity sliders.

**Positional Jitter**
- Gaussian noise added to each click coordinate
- σ configurable in pixels (0 = off, up to 20px)

**Timing Variance**
- Random ±% applied to base interval on top of interval mode settings
- Independent seed per session for reproducibility option

**Mouse Movement**
- Bezier curve path between last position and click target
- Control point randomization (how curved the path is)
- Configurable movement speed (pixels/sec)
- Realistic acceleration / deceleration (ease-in-out)
- Option: teleport (instant) vs. move (animated path)

**Click Hold Variance**
- Random ±ms variation on hold duration

**Idle Behavior**
- Between click bursts: occasionally move mouse slightly in random direction
- Frequency and magnitude configurable

**Humanization Presets**
- Off / Subtle / Natural / Heavy
- Each preset sets all humanization sliders to a calibrated default

---

### 6.5 Triggers

Multiple triggers can be assigned to a profile; each independently starts, stops, or pauses the engine.

**Hotkey Triggers**
- Global keyboard shortcut (captured via Input Monitoring even when app is backgrounded)
- Separate hotkeys for: start, stop, pause/resume, emergency kill (single key)
- Conflict detection with existing system shortcuts

**Timer / Schedule Triggers**
- Start after N seconds delay
- Start at a specific clock time (HH:MM:SS)
- Cron-style recurring schedule
- Auto-stop after N seconds / N clicks / specific time

**Event-Driven Triggers**
- Image appears on screen (Vision framework)
- Color detected at coordinate
- Active app changes (start only when specific app is frontmost)
- Clipboard content changes
- Audio output detected (using Core Audio level monitoring)

**Trigger Chaining**
- Triggers can chain: "when image appears, wait 2s, then start macro"
- Logical operators: AND / OR across multiple conditions

---

### 6.6 Profiles & Configuration

**Profiles**
- Named, color-labeled presets
- Each profile contains: click engine settings, macro assignment, targeting config, humanization settings, triggers
- Duplicate, rename, delete profiles
- Quick-switch via menu bar dropdown or `Cmd+[1–9]` shortcuts

**Global Defaults**
- Base settings applied to new profiles
- Override per-profile without affecting global defaults

**Import / Export**
- Export any profile as `.cfprofile` (JSON)
- Import from file
- Bundle multiple profiles into a `.cfpack` archive

---

## 7. UI / Visual Design

**General Direction**
- `#0a0a0a` background, sharp geometry, zero border-radius
- Geist Mono as primary typeface — reinforces precision / technical tool identity
- Accent: single color (configurable by user; default `#00FF88` green for active states)
- All status states communicated via text + color, never icons alone

**Main Window Layout**
- Left sidebar: profile list + global settings
- Center: active panel (tab-switched between Click Engine / Macros / Targeting / Humanization / Triggers)
- Right panel: live preview — screen thumbnail with click position marked, real-time stats

**Macro Editor**
- Numbered step list, monospace font
- Each step: left-border accent color by type (click = green, key = blue, wait = amber, branch = purple)
- Inline editing on click; no modal popups

**Floating HUD**
- Compact: 200×60px, draggable
- Fields: STATUS, CLICKS, CPS, STEP
- Font: Geist Mono 11pt
- Background: `rgba(0,0,0,0.75)` with 1px border at 20% white

**Settings Panel**
- Permission status dashboard (green/red per permission with one-tap fix)
- Hotkey binding UI (press to record)
- Theme accent color picker

---

## 8. Technical Architecture

### 8.0 Runtime Composition and Execution Order
- Runtime executes in this order for every actionable step:
  1. Trigger engine evaluates start/pause/stop conditions
  2. Macro runtime resolves the next action node
  3. Targeting engine resolves concrete target coordinates or element
  4. Humanization engine mutates timing/path/hold with seeded randomness
  5. Click engine posts final events through `CGEvent`
- Humanization is applied once at the composition boundary to avoid double jitter or duplicate timing variance.
- Recorder tags app-injected events so playback does not recursively re-record synthetic events.

### Click Injection
```
CGEventCreateMouseEvent → CGEventSetIntegerValueField (click state) → CGEventPost(kCGHIDEventTap)
```
- All click injection on a dedicated background `DispatchQueue` (never blocks main thread)
- Interval timer: `DispatchSourceTimer` for precision

### Event Tap (Recorder)
```
CGEventTapCreate(kCGHIDEventTap, kCGHeadInsertEventTap, ...)
```
- Passive tap for recording (does not intercept / modify events)
- Records to an in-memory buffer, flushed to disk on stop

### Image Recognition
- Runs Vision requests on `CVPixelBuffer` captured via `CGWindowListCreateImage`
- Off main thread via `VNImageRequestHandler` on background queue
- Result cached for one tick interval to avoid redundant searches

### State Machine
```
States: Idle → Armed → Running → Paused → Stopped
```
- All state transitions go through a single `ClickEngineStateMachine` actor
- Published via `@Observable` / `ObservableObject` for SwiftUI binding
- Illegal transitions are rejected and logged (for example `Idle -> Paused`).
- Emergency stop preempts all queues and forces immediate `Stopped` transition.

### Persistence
- Profiles: `~/Library/Application Support/autoclicker/profiles/`
- Macros: `~/Library/Application Support/autoclicker/macros/`
- Global config: `UserDefaults` (lightweight settings only)
- All JSON, human-readable
- All persisted documents include `schemaVersion`; startup runs migration chain before load.

### 8.1 Canonical Macro Model for Dual Editors
- Canonical runtime format is graph-backed AST:
  - Node kinds: action, wait, condition, loop, subroutine-call, variable-set
  - Edge kinds: `next`, `trueBranch`, `falseBranch`, loop-back
- Linear editor is a projection over the canonical graph with ordering metadata.
- Node graph editor mutates canonical graph directly.
- Validation guarantees:
  - Exactly one entry node
  - No orphan nodes
  - Loop bounds explicit unless user marked as infinite (kill switch required)
  - Variable type checks (`int`, `float`, `bool`, `string`)

### 8.2 Trigger Engine Semantics
- Trigger groups evaluate deterministically top-to-bottom per profile tick.
- Group operators:
  - `any` (OR): first successful child fires group
  - `all` (AND): all children must pass within evaluation window
- Debounce:
  - Per-trigger cooldown to prevent rapid refire
  - Group cooldown to prevent duplicate chain jobs
- Chaining model:
  - Trigger result enqueues a chain job (`condition -> delay -> action`)
  - Chain jobs are cancelable on stop/emergency stop
- Priority:
  - Emergency stop has highest priority and preempts all runtime work

### 8.3 Targeting Cache Policy
- Targeting resolves at run time unless profile is configured to lock first match.
- Vision/color/OCR checks are cached for a single tick to avoid duplicate scans.
- Cache invalidation events:
  - Next engine tick
  - Display topology change
  - Frontmost app change for app-scoped modes

### 8.4 Reliability and Performance Budgets
- Idle CPU target: < 1.5%
- Running click-only CPU target: < 5%
- Running vision-heavy profile CPU target: < 20% sustained
- Memory target: < 250 MB typical, warning threshold at 400 MB
- Emergency stop response target: <= 100 ms p95

---

## 9. Phased Roadmap

### Phase 1 — Core Engine (MVP)
- Click engine (all types, all interval modes, all coordinate modes)
- Hotkey triggers (start/stop/pause)
- Fixed + bounding box targeting
- Basic humanization (jitter + timing variance)
- Menu bar presence + floating HUD
- Profiles with global defaults

### Phase 2 — Macros
- Macro recorder + playback
- Macro editor (step list, reorder, edit)
- Sub-routines and variables
- Conditional branching
- `.cfmacro` import/export

### Phase 3 — Intelligence
- Image recognition targeting
- Color targeting
- Event-driven triggers (image/color/app/clipboard)
- Full humanization suite (Bezier movement, idle behavior)
- OCR targeting (beta)

### Phase 4 — Polish
- Cron scheduling
- AX tree targeting
- Trigger chaining with logical operators
- Full `.cfprofile` / `.cfpack` import/export
- CLI runner (`autoclicker run profile.cfprofile`)

---

## 10. Open Questions (Resolved for v1.1)

1. Macro editor ships with both linear list and node graph in v1 via one canonical model.
2. OCR ships with Vision plus optional Tesseract fallback path.
3. HUD defaults to compact global mode with per-app suppression options.
4. Onboarding includes simple guided setup while advanced controls remain available.

---

## 11. Reliability and Diagnostics

### 11.1 Crash Safety and Recovery
- Autosave active session every 2 seconds while runtime is active.
- Persist last runtime snapshot (`state`, counters, active profile, current macro node).
- On abnormal restart, present a recovery prompt to restore or discard last session.

### 11.2 Logging and Diagnostics
- Structured local logs in `~/Library/Application Support/autoclicker/logs/`.
- Log channels: `permissions`, `trigger`, `macro`, `targeting`, `click`, `performance`.
- Privacy defaults:
  - Do not persist literal keypress content by default
  - Mask clipboard payloads
- Provide one-click diagnostics export bundle from settings.

### 11.3 Deterministic Replay Mode
- Optional fixed random seed controls jitter/timing/path randomness.
- Run metadata stores seed + profile hash for reproducibility.
- Deterministic mode disables adaptive humanization behaviors.

---

## 12. QA and Acceptance Criteria

### 12.1 Engine Correctness
- Click interval precision target: <= 3 ms p95 for intervals >= 20 ms.
- Emergency stop latency target: <= 100 ms p95.
- Macro execution order stable across long replay sessions.

### 12.2 Permission-Denied Behavior
- Every permission-gated feature has a clear fallback UI and no fatal failure.
- App remains launchable with any subset of permissions denied.

### 12.3 Targeting Quality
- Multi-monitor mapping validated on mixed DPI display setups.
- Image/OCR threshold bounds verified at min/max settings.
- Both Vision and Tesseract OCR paths covered by tests.

### 12.4 Test Matrix
- Unit: state machine transitions, trigger operator logic, macro model validation, migrations.
- Integration: recorder/playback, profile import/export, runtime composition stack.
- UI: menu bar controls, HUD state updates, permissions dashboard, macro editors.
- Long-run: 8-hour soak with bounded memory and stable runtime behavior.

---

## 13. Packaging and Distribution

- Distribution target is direct signed/notarized app (outside App Store).
- Release flow:
  1. Build release archive
  2. Sign with Developer ID certificate
  3. Notarize and staple ticket
  4. Publish release notes and checksums
- CLI runner is shipped as in-bundle binary and standalone release asset.
- Schema migrations are mandatory for any persisted format change.
