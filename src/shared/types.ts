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

export interface ClickerConfig {
  intervalMs: number;
  button: MouseButton;
  kind: ClickKind;
  target: Target;
  stop: StopCondition;
  humanize: boolean;
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

export interface HotkeyRegistration {
  accelerator: string;
  ok: boolean;
  err?: string;
}

export type WindowMode = 'full' | 'popover' | 'picker';

export type PickerResult =
  | { ok: true; x: number; y: number }
  | { ok: false; reason: 'cancelled' | 'busy' | 'error' };
