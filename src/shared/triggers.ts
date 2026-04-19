// Scheduling triggers — launch an autonomy flow automatically based on time
// or a system condition. The renderer keeps the authoritative list in its
// persisted store; the main process mirrors the enabled ones into a scheduler
// and fires them back as IPC events. Fresh triggers are off by default.

export type TriggerKind =
  | 'interval' // every N ms
  | 'daily' // at HH:MM local time
  | 'app-launch'; // when a given bundle id becomes frontmost

export interface TriggerBase {
  id: string;
  name: string;
  enabled: boolean;
  flowId: string; // autonomy flow to run
  // Never fire more than one triggered run at a time. When an instance is
  // already running, additional fires are dropped silently.
  skipIfRunning: boolean;
  lastFiredAt?: number;
}

export interface IntervalTrigger extends TriggerBase {
  kind: 'interval';
  intervalMs: number; // minimum 1000
}

export interface DailyTrigger extends TriggerBase {
  kind: 'daily';
  hour: number; // 0..23
  minute: number; // 0..59
}

export interface AppLaunchTrigger extends TriggerBase {
  kind: 'app-launch';
  bundleId: string; // e.g. 'com.apple.Safari'
}

export type Trigger = IntervalTrigger | DailyTrigger | AppLaunchTrigger;

// --- Mouse path recorder ---------------------------------------------------
// A recorded path is a list of timestamped cursor positions captured at ~60Hz
// from Electron's `screen.getCursorScreenPoint()`. The autonomy engine can
// replay it via a future `path-playback` node. For now the shapes live here
// so the renderer and main process can share the format.

export interface PathSample {
  t: number; // relative ms since recording started
  x: number;
  y: number;
}

export interface PathRecording {
  id: string;
  name: string;
  createdAt: number;
  durationMs: number;
  samples: PathSample[];
}

export interface PathRecorderStatus {
  active: boolean;
  id: string | null;
  samples: number;
  elapsedMs: number;
}
