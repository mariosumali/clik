# Electron App

This folder contains a full Electron remake of `mars-autoclicker` with a redesigned dashboard UI.

## What It Includes

- Three-column desktop control deck UI.
- Profile CRUD plus `.cfprofile` / `.cfpack` import-export.
- Runtime engine controls (`Start`, `Pause/Resume`, `Stop`) with F8/F9/F12 global shortcuts.
- Runtime metrics (state, clicks, CPS, elapsed time, injection mode).
- macOS permissions dashboard with direct System Settings links.
- Click injection adapter:
  - Native mode when optional `@jitsi/robotjs` is available.
  - Simulation mode when native dependency is missing.

## Run

```bash
cd electron
npm install
npm run dev
```

## Notes

- App state and profiles are persisted under Electron `userData` in `profiles.json`.
- Existing Swift sources remain untouched; this is additive.
