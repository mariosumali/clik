# CLIK

A brutalist macOS autoclicker. Electron + React on top of a tiny Swift helper
binary that drives `CGEventPost` for input and `ScreenCaptureKit` for vision.

## Requirements

- macOS 12+
- Node 20+
- Xcode Command Line Tools (for `swiftc`): `xcode-select --install`

## First run

```bash
npm install
npm run dev
```

The Swift helper (`resources/clik-helper`), the menubar tray template
(`resources/trayTemplate*.png`), and the packaged app icon (`resources/Clik.icns`)
are produced before `dev` and `build`. `build:app-icon` draws the multi-size
PNGs into a fresh `resources/Clik.iconset/` and runs `iconutil` on macOS (on
other platforms the step skips and Forge falls back to a default icon). The
generated `.icns` / `.iconset` are gitignored so each clone gets them from the
scripts, not from Git.

On first click, macOS prompts for **Accessibility** permission under **System
Settings → Privacy & Security → Accessibility**. Toggle **Clik** (or, during
dev, **Electron**) on, then return to the app. If it's missing, the status bar
shows `GRANT-ACCESSIBILITY`.

The **Autonomy** workspace additionally needs **Screen Recording** permission
(same Privacy & Security pane) so the helper can capture regions for template
matching. Preferences → Permissions has shortcuts to both panes.

## Commands

| command                | what it does                                         |
| ---------------------- | ---------------------------------------------------- |
| `npm run dev`          | build helper + icons + electron-vite dev             |
| `npm run build`        | production bundle (main, preload, renderer, helper)  |
| `npm run build:helper` | compile the Swift helper only                        |
| `npm run build:icons`  | regenerate the tray template PNGs                    |
| `npm run build:app-icon` | build `resources/Clik.icns` from `Clik.iconset`   |
| `npm run package`      | build + `electron-forge package` (produces `.app`)   |
| `npm run make`         | build + DMG via `@electron-forge/maker-dmg`          |
| `npm run typecheck`    | run `tsc --noEmit` for node + web projects           |

## Two shells

CLIK ships as a single app with two UIs that share state.

**Full app (dock / main window).** The configurator. Four workspaces in the
sidebar — Clicker, Sequence, Autonomy, Run Log — plus a Preferences modal
reached from the gear.

**Menubar popover.** A crosshair sits in the macOS menu bar the whole time the
app is running. Click it for a 320×560 popover made of configurable modules
(interval, mouse, target, stop, humanize, theme, accent, hotkey, stats, and the
required status bar + start control). Reorder or hide modules in **Preferences
→ Menu-bar popover**. Click outside to dismiss. Right-click the tray for *Open
CLIK* and *Quit*. Useful for firing a quick run without pulling the full window
to the front.

If you tweak the interval in one shell, it's reflected next time you open the
other.

## Workspaces

**Clicker.** The classic: interval, button (left/right/middle), kind
(single/double), target (cursor or fixed x/y), stop condition (manual / after
N clicks / after time), humanize toggle (±25% jitter on the interval).

**Sequence.** Walk a list of points in order, one click per point, each
pointing at captured screen coordinates. Shares the stop / humanize / button
controls with Clicker.

**Autonomy.** A visual flow editor for more-than-a-click jobs. Three views of
the same flow:

- **Graph** — drag-and-drop node canvas with a palette grouped by Flow /
  Input / Vision / Data / Feedback
- **Timeline** — linear read of the current run
- **Code** — text DSL (see `src/shared/autonomyDsl.ts`) for copy-paste and
  diffing

Node kinds include `click`, `move`, `drag`, `scroll`, `keypress`, `hotkey`,
`type-text`, `wait` / `random-wait`, `loop`, `counter`, `branch` /
`random-branch`, `set-var`, `find` + `wait-until-found` / `wait-until-gone`
(template matching via `ScreenCaptureKit`), `screenshot`, `log`, `notify`,
`stop-error`, and `end`. Flows are persisted per-workspace and have in-app
undo / redo.

**Scheduling triggers** (in Autonomy) start a saved flow from the main process
without you pressing Start: **interval** (every *n* ms, minimum 1s), **daily**
(local time), or **app-launch** (when a given macOS app bundle ID becomes
frontmost). The renderer owns the list; the scheduler runs in the main process
and skips overlapping fires when you enable *skip if already running*.

**Path recording** captures the cursor track at ~60 Hz for use in flows (shared
format in `src/shared/triggers.ts`; playback wiring lands in the graph as it
ships).

**Run Log.** Every clicker and sequence run lands here with workspace,
interval, button, kind, target, stop condition, humanize, click count,
duration, and outcome (`completed` / `stopped` / `error`). Lives in
`localStorage` on the full window.

## Hotkeys

**Global per workspace.** Each workspace has its own toggle hotkey, registered
through the main process so it works with the window hidden:

- Clicker — `⌥⇧C` (Alt+Shift+C)
- Sequence — `⌥⇧S`
- Autonomy — `⌥⇧A`

Change any of them under **Preferences → Hotkeys** or from the workspace
header. The recorder shows what you're pressing and commits on key release;
at least one modifier is required. If the combo is already owned by another
app, registration fails and the recorder says *Could not register* — pick a
different one.

**In-window only** (full app or popover, when focused):

- `Return` — fire (same as clicking **Start**) for the current workspace
- `Escape` — cancel (popover: also closes the popover)

## Preferences

Opened from the sidebar gear. Covers:

- **Appearance** — theme (System / Light / Dark + named palettes), accent
  color, interface density (Comfy / Compact), reduce motion
- **Window & Dock** — launch at login, always on top, show in Dock, close
  hides window
- **Menu-bar popover** — auto-hide on blur
- **Feedback** — sound cues on start/stop, system notification on completion,
  confirm before stopping
- **Power** — prevent display sleep during a run
- **Kill Zones** — stop immediately if a click would land in a banned region.
  Presets for screen edges (N-px strip) and corners (N×N squares), plus any
  number of custom rectangles drawn with the region picker
- **Permissions** — Accessibility status + shortcut to System Settings
- **Data** — reset every preference above to its default

## Layout

```
native/helper.swift         Swift driver — reads JSON per line, drives CGEventPost + ScreenCaptureKit
native/build.sh             swiftc -> resources/clik-helper (universal arm64 + x86_64)
native/build-tray-icon.mjs  generator for resources/trayTemplate*.png
native/build-app-icon.mjs   generates Clik.iconset PNGs + iconutil -> resources/Clik.icns

src/shared/                 types, IPC channel names, autonomy models + DSL, triggers + path samples
src/main/                   Electron main (windows, tray, popover, IPC, hotkeys, helper, triggers, path recorder)
src/preload/                contextBridge -> window.clik
src/renderer/               React UI
  src/App.tsx               full-app shell
  src/PopoverApp.tsx        menubar popover shell
  src/components/Clicker/   clicker workspace (interval/button/target/stop cards)
  src/components/Sequence/  sequence workspace (point list + shared controls)
  src/components/Autonomy/  node canvas, inspector, timeline, code editor
  src/components/RunLog/    run log workspace
  src/components/Settings/  preferences modal
  src/components/Hotkeys/   hotkey recorder + workspace hotkey button
  src/components/Tester/    click-tester widget (live CPS, peak, total)
```

The renderer entry (`src/renderer/src/main.tsx`) picks the root component from
`window.clik.mode`, which the preload reads off `--clik-mode=full|popover` set
by the main process on each window.

## Signing + notarize

`forge.config.ts` has `osxSign` / `osxNotarize` blocks. Wire them up with your
Developer ID credentials before distributing.
