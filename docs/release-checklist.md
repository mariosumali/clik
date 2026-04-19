# Release Checklist (Direct Distribution)

## 1) Preflight

- `swift build` passes for `AutoClickerCore`, `AutoClickerApp`, and `autoclicker`.
- `swift test` passes all unit and integration suites.
- Permission gating smoke-tested (Accessibility/Input Monitoring/Screen Recording denied + granted paths).
- Diagnostics export validated.

## 2) Build + Sign

- Archive app bundle from Xcode release configuration or equivalent CI workflow.
- Sign with Developer ID Application certificate.
- Verify signature:

```bash
codesign --verify --deep --strict --verbose=2 "AutoClickerApp.app"
```

## 3) Notarization

- Submit build:

```bash
xcrun notarytool submit "AutoClickerApp.zip" --keychain-profile "<profile>" --wait
```

- Staple ticket:

```bash
xcrun stapler staple "AutoClickerApp.app"
```

- Validate Gatekeeper assessment:

```bash
spctl -a -t exec -vv "AutoClickerApp.app"
```

## 4) Release Artifacts

- `AutoClickerApp.app` (signed + notarized)
- `autoclicker` CLI binary
- checksums (`shasum -a 256`)
- migration notes if schema versions changed
- short changelog with breaking-change callouts
