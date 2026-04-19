# mars-autoclicker Architecture

## High-Level Runtime

1. Triggers evaluate profile conditions.
2. Macro runtime resolves next action.
3. Targeting resolves location/element.
4. Humanization mutates action timing/path.
5. Click engine injects final input events.

## Modules

- `AutoClickerCore`: models, engines, persistence, runtime orchestration.
- `AutoClickerApp`: SwiftUI desktop UI, menu bar, HUD, settings.
- `autoclicker`: CLI runner and diagnostics surface.
