export type MouseButton = 'left' | 'right' | 'middle';
export type ClickKind = 'single' | 'double' | 'hold';

export type Target =
  | { kind: 'cursor' }
  | { kind: 'fixed'; x: number; y: number }
  | { kind: 'sequence'; points: Array<{ x: number; y: number; dwellMs: number }> };

export type StopCondition =
  | { kind: 'off' }
  | { kind: 'after-clicks'; count: number }
  | { kind: 'after-duration'; ms: number };

export type KillZoneKind = 'corners' | 'edges' | 'rect';

export interface KillZoneBase {
  id: string;
  name: string;
  enabled: boolean;
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
