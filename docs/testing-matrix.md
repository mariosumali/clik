# Testing Matrix

## Unit Coverage

- `ClickEngineStateMachine`: legal/illegal transitions, emergency-stop precedence.
- `HumanizationEngine`: deterministic seed reproducibility, jitter/timing bounds.
- `MacroGraph`: validation failures (missing entry, orphan nodes, bad references).
- `TriggerEngine`: OR/AND semantics, cooldown behavior, chain dispatch order.
- `ProfileStore`: import/export collision resolution, `.cfpack` merge behavior.

## Integration Coverage

- Profile -> trigger -> click runtime path.
- Recorder output replayed by `MacroRuntime`.
- Targeting adapters for color/AX/OCR return graceful errors on permission denial.
- Session autosave and crash-recovery snapshot lifecycle.

## UI Coverage

- Menu bar controls update runtime state.
- Settings permission dashboard deep-link actions.
- Dual macro editors remain in sync with canonical graph.
- Profile panel import/export controls and status messaging.

## Performance Coverage

- Idle memory and long-run leak checks.
- Sustained click loop stress runs.
- Vision/OCR heavy runs with diagnostics log review.
