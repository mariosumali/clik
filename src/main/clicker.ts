import { EventEmitter } from 'node:events';
import type { ClickerConfig, ClickerTick } from '../shared/types.js';
import { HelperClient } from './helper.js';

export class Clicker extends EventEmitter {
  private helper: HelperClient;
  private running = false;
  private config: ClickerConfig | null = null;
  private clicks = 0;
  private startedAt = 0;
  private timer: NodeJS.Timeout | null = null;
  private lastError: string | undefined;

  constructor(helper: HelperClient) {
    super();
    this.helper = helper;
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
    this.config = config;
    this.running = true;
    this.clicks = 0;
    this.startedAt = Date.now();
    this.lastError = undefined;
    this.emitTick();
    this.scheduleNext(0);
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

  private computeInterval(): number {
    const cfg = this.config!;
    const base = Math.max(1, cfg.intervalMs);
    if (!cfg.humanize) return base;
    // ±25% jitter, but never below 1ms.
    const jitter = (Math.random() - 0.5) * 0.5 * base;
    return Math.max(1, Math.round(base + jitter));
  }

  private async fireOnce(): Promise<void> {
    if (!this.running || !this.config) return;
    const cfg = this.config;
    const x = cfg.target.kind === 'fixed' ? cfg.target.x : null;
    const y = cfg.target.kind === 'fixed' ? cfg.target.y : null;

    try {
      const res = await this.helper.click({
        button: cfg.button,
        kind: cfg.kind === 'hold' ? 'single' : cfg.kind,
        x,
        y,
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

    this.scheduleNext(this.computeInterval());
  }

  private emitTick(): void {
    this.emit('tick', this.getState());
  }
}
