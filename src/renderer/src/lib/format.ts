export interface Cadence {
  hours: number;
  minutes: number;
  seconds: number;
  millis: number;
}

export function cadenceToMs(c: Cadence): number {
  return (
    c.hours * 3_600_000 +
    c.minutes * 60_000 +
    c.seconds * 1000 +
    c.millis
  );
}

export function msToCadence(ms: number): Cadence {
  const hours = Math.floor(ms / 3_600_000);
  const rHours = ms - hours * 3_600_000;
  const minutes = Math.floor(rHours / 60_000);
  const rMin = rHours - minutes * 60_000;
  const seconds = Math.floor(rMin / 1000);
  const millis = rMin - seconds * 1000;
  return { hours, minutes, seconds, millis };
}

export function formatCps(intervalMs: number): string {
  if (intervalMs <= 0) return '∞';
  const cps = 1000 / intervalMs;
  if (cps >= 1000) return '∞';
  if (cps >= 100) return cps.toFixed(0);
  if (cps >= 10) return cps.toFixed(1);
  return cps.toFixed(2);
}

export function formatIntervalCompact(ms: number): string {
  if (ms === 0) return '0ms';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m${s ? ` ${s}s` : ''}`;
}

export function formatElapsed(ms: number): string {
  if (ms <= 0) return '—';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

export function formatClicks(n: number): string {
  if (n === 0) return '—';
  return n.toLocaleString('en-US');
}
