# CLIK

A brutalist macOS autoclicker. Electron + React on top of a tiny Swift helper
binary that drives `CGEventPost`.

## Requirements

- macOS 12+
- Node 20+
- Xcode Command Line Tools (for `swiftc`): `xcode-select --install`

## First run

```bash
npm install
npm run dev
```

The Swift helper (`resources/clik-helper`) and the menubar tray icon
(`resources/trayTemplate*.png`) are built automatically before `dev` and
`build`. On first click, macOS prompts for **Accessibility** permission under
**System Settings → Privacy & Security → Accessibility**. Toggle **Clik** (or,
during dev, **Electron**) on, then return to the app. If permissions were
denied, the status bar shows `GRANT-ACCESSIBILITY`.

## Commands

| command                 | what it does                                         |
| ----------------------- | ---------------------------------------------------- |
| `npm run dev`           | build helper + icons + electron-vite dev             |
| `npm run build`         | production bundle (main, preload, renderer, helper)  |
| `npm run build:helper`  | compile the Swift helper only                        |
| `npm run build:icons`   | regenerate the tray template PNGs                    |
| `npm run package`       | build + `electron-forge package` (produces `.app`)   |
| `npm run make`          | build + DMG via `@electron-forge/maker-dmg`          |
| `npm run typecheck`     | run `tsc --noEmit` for node + web projects           |

## Two modes

CLIK ships as a single app with two UIs.

**Full app (dock / main window).** The full configurator: interval, button,
target, stop conditions, live click tester, Hotkeys page, Run Log (stub), etc.

**Menubar popover.** A crosshair sits in the macOS menu bar the whole time the
app is running. Click it for a 320×420 popover with the essentials: interval,
button, live stats, and a big **START / STOP** button. Click outside to
dismiss. Right-click the tray for *Open CLIK* and *Quit*. Useful when you want
to fire a quick run without pulling the full window to the front.

The menubar popover and the full window share state: if you tweak the interval
in one, it's reflected next time you open the other.

## Hotkeys

**Global start / stop.** Default: `⌥⇧C` (Option + Shift + C). Works from any
app — no need to focus CLIK first. Change it under **Hotkeys** in the sidebar;
the recorder shows what you're pressing and commits on key release. Requires
at least one modifier.

If the combo is already owned by another app, registration fails and the
recorder says *Could not register* — pick a different one.

**In-window only** (full app or popover, when focused):

- `Return` — fire (same as clicking **Start**)
- `Escape` — cancel (popover: also closes the popover)

## Layout

```
native/helper.swift         Swift driver — reads JSON per line, calls CGEventPost
native/build.sh             swiftc -> resources/clik-helper (universal arm64+x86_64)
native/build-tray-icon.mjs  generator for resources/trayTemplate*.png

src/shared/                 types + IPC channel names shared by main + renderer
src/main/                   Electron main (windows, tray, popover, IPC, hotkeys)
src/preload/                contextBridge -> window.clik
src/renderer/               React UI
  src/App.tsx               full-app shell
  src/PopoverApp.tsx        menubar popover shell
  src/components/Hotkeys/   hotkey recorder + settings page
  src/components/Tester/    click-tester right panel (measures CPS)
```

The renderer entry (`src/renderer/src/main.tsx`) picks the root component from
`window.clik.mode`, which the preload reads off
`--clik-mode=full|popover` set by the main process on each window.

## What's in this cut

- Interval, button (left/right/middle), kind (single/double), target (cursor
  or fixed x/y), stop condition (manual / after N clicks / after time)
- Humanize toggle — ±25% jitter on the interval when on
- Click tester on the right: live CPS, peak, total, reset
- Configurable **global** start/stop hotkey
- Menubar popover + tray icon
- Sequence + Run Log are still stubbed and marked `SOON` in the sidebar

## Signing + notarize

`forge.config.ts` has commented-out `osxSign` / `osxNotarize` blocks. Wire
them up with your Developer ID credentials before distributing.
