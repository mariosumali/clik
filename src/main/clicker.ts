import { EventEmitter } from 'node:events';
import type { ClickerConfig, ClickerTick, KillZoneRect } from '../shared/types.js';
import { HelperClient } from './helper.js';

export type CursorPointGetter = () => { x: number; y: number };

export class Clicker extends EventEmitter {
  private helper: HelperClient;
  private getCursorPoint: CursorPointGetter | null;
  private running = false;
  private config: ClickerConfig | null = null;
  private clicks = 0;
  private startedAt = 0;
  private timer: NodeJS.Timeout | null = null;
  private lastError: string | undefined;
  private seqIndex = 0;
  // How many times we've fired at the current sequence index. When >= that
  // point's `repeat` count we advance seqIndex and reset to 0.
  private seqRepeatsLeftAtIndex = 0;
  // Target timestamp for the next click. Advancing this by the intended delay
  // (rather than scheduling `delay` ms after each click completes) keeps the
  // average CPS aligned with the requested interval even when the helper
  // round-trip adds a few ms of latency per click.
  private nextTickAt = 0;
  // Resolved, flat list of forbidden rectangles in screen points. Populated on
  // start() from config.killZones when it's already a KillZoneRect[] (main
  // process expands presets before handing the config over).
  private killZones: KillZoneRect[] = [];

  constructor(helper: HelperClient, getCursorPoint?: CursorPointGetter) {
    super();
    this.helper = helper;
    this.getCursorPoint = getCursorPoint ?? null;
  }

  snapshot(): ClickerTick {
    return this.getState();
  }

  getState(): ClickerTick {
    return {
      status: this.running ? 'running' : 'idle',
      clicks: this.clicks,
      elapsedMs: this.running ? Date.now() - this.startedAt : 0,
      intervalMs: this.config?.intervalMs ?? 0,
      lastError: this.lastError,
    };
  }

  start(config: ClickerConfig): void {
    if (this.running) this.stop();
    // Reject empty sequences up front so the UI gets an immediate error tick
    // instead of silently flipping to 'running' with nothing to do.
    if (config.target.kind === 'sequence' && config.target.points.length === 0) {
      this.config = config;
      this.clicks = 0;
      this.startedAt = 0;
      this.running = false;
      this.lastError = 'empty-sequence';
      this.emitTick();
      return;
    }
    this.config = config;
    this.running = true;
    this.clicks = 0;
    this.startedAt = Date.now();
    this.nextTickAt = this.startedAt;
    this.lastError = undefined;
    this.seqIndex = 0;
    this.seqRepeatsLeftAtIndex = 0;
    // Main has already resolved presets into rectangles; anything else is
    // treated as "no zones" so the engine never tries to interpret raw preset
    // payloads on its own.
    this.killZones = Array.isArray(config.killZones)
      ? (config.killZones as KillZoneRect[])
      : [];
    this.emitTick();
    this.scheduleNext(0);
  }

  private isInsideKillZone(x: number, y: number): boolean {
    for (const z of this.killZones) {
      if (x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h) return true;
    }
    return false;
  }

  stop(reason?: string): void {
    if (!this.running) return;
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (reason) this.lastError = reason;
    this.emitTick();
  }

  private scheduleNext(after: number): void {
    if (!this.running || !this.config) return;
    this.timer = setTimeout(() => this.fireOnce(), after);
  }

  private applyHumanize(baseMs: number): number {
    const cfg = this.config!;
    const base = Math.max(1, baseMs);
    if (!cfg.humanize) return base;
    // ±25% jitter, but never below 1ms.
    const jitter = (Math.random() - 0.5) * 0.5 * base;
    return Math.max(1, Math.round(base + jitter));
  }

  private async fireOnce(): Promise<void> {
    if (!this.running || !this.config) return;
    const cfg = this.config;

    // Resolve the click position and the delay that follows it. For sequences we
    // step through points round-robin and use each point's own dwell; other
    // targets fall back to cfg.intervalMs.
    let clickX: number | null = null;
    let clickY: number | null = null;
    let nextDelay: number;

    if (cfg.target.kind === 'sequence') {
      const points = cfg.target.points;
      if (points.length === 0) {
        this.lastError = 'empty-sequence';
        this.stop(this.lastError);
        return;
      }
      const idx = this.seqIndex % points.length;
      const pt = points[idx];
      clickX = pt.x;
      clickY = pt.y;
      nextDelay = this.applyHumanize(pt.dwellMs);
      // Per-point repeat: hold on this index until we've fired `repeat` times,
      // then advance. `repeat` < 1 is treated as 1.
      const repeat = Math.max(1, pt.repeat ?? 1);
      this.seqRepeatsLeftAtIndex += 1;
      if (this.seqRepeatsLeftAtIndex >= repeat) {
        this.seqRepeatsLeftAtIndex = 0;
        this.seqIndex = (idx + 1) % points.length;
      }
    } else {
      if (cfg.target.kind === 'fixed') {
        clickX = cfg.target.x;
        clickY = cfg.target.y;
      }
      nextDelay = this.applyHumanize(cfg.intervalMs);
    }

    // Click-when-idle: postpone this click until the user has been idle for
    // at least `idleThresholdMs`. We poll the helper with a cadence equal to
    // the threshold (min 200ms, max 2s) so the re-check loop never busy-loops
    // but also reacts within a sensible window. The check is best-effort — if
    // the helper isn't ready or the call fails, we fall through and click.
    const idleThreshold = Math.max(0, Math.round(cfg.idleThresholdMs ?? 0));
    if (idleThreshold > 0) {
      try {
        const res = await this.helper.idle();
        const secondsIdle = res.ok ? (res.seconds ?? 0) : Infinity;
        const idleMs = secondsIdle * 1000;
        if (idleMs < idleThreshold) {
          const waitMs = Math.min(2000, Math.max(200, idleThreshold - idleMs));
          // Reschedule without advancing the tick — we still want to fire at
          // this (same) sequence index once the user goes idle.
          this.seqRepeatsLeftAtIndex = Math.max(0, this.seqRepeatsLeftAtIndex - 1);
          if (cfg.target.kind === 'sequence' && this.seqRepeatsLeftAtIndex === 0) {
            // Rewind the index we just advanced.
            const len = cfg.target.points.length;
            this.seqIndex = (this.seqIndex + len - 1) % len;
          }
          this.scheduleNext(waitMs);
          return;
        }
      } catch {
        // Fall through — clicking on a failed idle probe is the safer default.
      }
    }

    if (this.killZones.length > 0) {
      // For cursor-target clicks clickX/clickY are null and the helper reads
      // the cursor at click time; approximate with the live OS cursor here so
      // the safety check still fires. A tiny race between this read and the
      // actual click is acceptable for a stop-on-entry guard.
      let checkX = clickX;
      let checkY = clickY;
      if ((checkX == null || checkY == null) && this.getCursorPoint) {
        try {
          const pt = this.getCursorPoint();
          checkX = pt.x;
          checkY = pt.y;
        } catch {
          // If the cursor read fails, fall through — we'd rather click than
          // stop on a transient error in an unrelated subsystem.
        }
      }
      if (checkX != null && checkY != null && this.isInsideKillZone(checkX, checkY)) {
        this.stop('kill-zone');
        return;
      }
    }

    try {
      const res = await this.helper.click({
        button: cfg.button,
        kind: cfg.kind === 'hold' ? 'single' : cfg.kind,
        x: clickX,
        y: clickY,
      });
      if (!res.ok) {
        this.lastError = res.err ?? 'helper-failed';
        this.stop(this.lastError);
        return;
      }
      this.clicks += 1;
      this.emitTick();
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : 'unknown';
      this.stop(this.lastError);
      return;
    }

    // Stop condition.
    if (cfg.stop.kind === 'after-clicks' && this.clicks >= cfg.stop.count) {
      this.stop();
      return;
    }
    if (cfg.stop.kind === 'after-duration' && Date.now() - this.startedAt >= cfg.stop.ms) {
      this.stop();
      return;
    }

    // Drift-corrected scheduling: target a fixed cadence instead of adding
    // `nextDelay` on top of the helper round-trip. If we've fallen behind by
    // more than one interval (helper stall, laptop sleep, etc.), rebase to now
    // so we don't fire a burst of catch-up clicks.
    const now = Date.now();
    this.nextTickAt += nextDelay;
    if (this.nextTickAt < now - nextDelay) this.nextTickAt = now;
    this.scheduleNext(Math.max(0, this.nextTickAt - now));
  }

  private emitTick(): void {
    this.emit('tick', this.getState());
  }
}
