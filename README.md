# mars-autoclicker

Native macOS autoclicker/runtime stack built with Swift, SwiftUI, CGEvent, Vision, and AX APIs.

## Build

```bash
swift build
```

## Test

```bash
swift test
```

## Run CLI

```bash
swift run autoclicker doctor
swift run autoclicker run /path/to/profile.cfprofile --max-seconds 20
```

## Electron Remake

An additive Electron implementation now lives in `electron/` with a refreshed desktop dashboard UI and runtime controls.

```bash
cd electron
npm install
npm run dev
```

Notes:
- Swift sources are unchanged.
- Native click injection is optional and uses `@jitsi/robotjs` when available.
- Without native injector support, the app runs in simulation mode (UI and runtime metrics still function).

## Project Structure

- `Sources/AutoClickerCore`: runtime engines, models, persistence, diagnostics.
- `Sources/AutoClickerApp`: SwiftUI app shell, menu bar, HUD, editor panels.
- `Sources/autoclicker`: CLI runner for profile execution and diagnostics.
- `electron/`: Electron remake with modernized UI and IPC-based runtime controller.
- `docs/`: architecture, permissions, testing matrix, release checklist.
