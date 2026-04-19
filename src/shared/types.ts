export type MouseButton = 'left' | 'right' | 'middle';
export type ClickKind = 'single' | 'double' | 'hold';

// Each SequencePoint / fixed target optionally carries a `displayIndex` hint.
// When present the main process treats (x, y) as LOCAL to that display's bounds
// and translates them to global screen points at run time. Without the hint,
// coordinates are global (the historical default, safe for everything legacy).
export interface SequencePointPayload {
  x: number;
  y: number;
  dwellMs: number;
  // Per-point repeat — fires the click this many times before advancing to the
  // next point. 1 (default) preserves legacy behavior.
  repeat?: number;
  displayIndex?: number;
}

export type Target =
  | { kind: 'cursor' }
  | { kind: 'fixed'; x: number; y: number; displayIndex?: number }
  | { kind: 'sequence'; points: SequencePointPayload[] };

export type StopCondition =
  | { kind: 'off' }
  | { kind: 'after-clicks'; count: number }
  | { kind: 'after-duration'; ms: number };

export type KillZoneKind = 'corners' | 'edges' | 'rect';

// Which workspace(s) a kill zone applies to. 'global' always applies; the
// others restrict the zone to that workspace's runner. Defaults to 'global' so
// installs that pre-date scoping keep their prior behavior.
export type KillZoneScope = 'global' | 'clicker' | 'sequence' | 'autonomy';

export interface KillZoneBase {
  id: string;
  name: string;
  enabled: boolean;
  scope?: KillZoneScope;
}

export type KillZone =
  | (KillZoneBase & { kind: 'corners'; size: number })
  | (KillZoneBase & { kind: 'edges'; margin: number })
  | (KillZoneBase & { kind: 'rect'; x: number; y: number; w: number; h: number });

export interface KillZoneRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Raw payload the renderer sends to main on clicker:start. Main expands the
// presets (corners/edges) against the current display layout and replaces
// `killZones` with a flat KillZoneRect[] before passing into the engine.
export interface KillZonePayload {
  enabled: boolean;
  zones: KillZone[];
}

export interface ClickerConfig {
  intervalMs: number;
  button: MouseButton;
  kind: ClickKind;
  target: Target;
  stop: StopCondition;
  humanize: boolean;
  // Set by the renderer as a KillZonePayload; the main process resolves presets
  // and rewrites this field to a KillZoneRect[] before handing it to Clicker.
  killZones?: KillZonePayload | KillZoneRect[];
  // Click-when-idle: if set, the clicker postpones each click until the user
  // has been idle (no mouse / keyboard) for at least this many ms. 0 disables.
  idleThresholdMs?: number;
  // Which workspace the run is coming from (sequence vs clicker). The main
  // process uses this to filter kill-zones by scope. 'clicker' is the default
  // when not provided, keeping the old behavior for callers that don't pass it.
  workspace?: 'clicker' | 'sequence';
}

export type ClickerStatus = 'idle' | 'running' | 'error';

export interface ClickerTick {
  status: ClickerStatus;
  clicks: number;
  elapsedMs: number;
  intervalMs: number;
  lastError?: string;
}

export interface PermissionState {
  trusted: boolean;
}

// Each workspace owns its own global start/stop hotkey so users can arm the
// clicker, sequence, and autonomy runners with distinct combos.
export type HotkeyTarget = 'clicker' | 'sequence' | 'autonomy';

export interface HotkeyRegistration {
  target: HotkeyTarget;
  accelerator: string;
  ok: boolean;
  err?: string;
}

export interface HotkeyFireEvent {
  target: HotkeyTarget;
  action: 'fire' | 'cancel';
}

export type WindowMode = 'full' | 'popover' | 'picker' | 'region-picker';

export type PickerResult =
  | { ok: true; x: number; y: number }
  | { ok: false; reason: 'cancelled' | 'busy' | 'error' };
