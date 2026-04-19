import { EventEmitter } from 'node:events';
import type { Trigger } from '../shared/triggers.js';
import type { HelperClient } from './helper.js';

// Scheduler that mirrors a list of triggers from the renderer and fires
// callbacks on the main process. Interval and daily triggers run off a single
// 1s tick so we don't burn timers per trigger. App-launch triggers poll the
// helper's running-apps list every 2s and fire on transition into frontmost.
export class TriggersManager extends EventEmitter {
  private helper: HelperClient;
  private triggers: Trigger[] = [];
  private timer: NodeJS.Timeout | null = null;
  private appPollTimer: NodeJS.Timeout | null = null;
  private activeBundleId: string | null = null;
  private lastFires: Record<string, number> = {};
  private isTriggerRunning: () => boolean;

  constructor(helper: HelperClient, isTriggerRunning: () => boolean) {
    super();
    this.helper = helper;
    this.isTriggerRunning = isTriggerRunning;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 1000);
    this.appPollTimer = setInterval(() => { void this.pollApps(); }, 2000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.appPollTimer) clearInterval(this.appPollTimer);
    this.timer = null;
    this.appPollTimer = null;
  }

  setTriggers(triggers: Trigger[]): void {
    this.triggers = triggers.slice();
    this.start();
  }

  removeTrigger(id: string): void {
    this.triggers = this.triggers.filter((t) => t.id !== id);
    delete this.lastFires[id];
  }

  private tick(): void {
    const now = Date.now();
    for (const t of this.triggers) {
      if (!t.enabled) continue;
      if (t.skipIfRunning && this.isTriggerRunning()) continue;
      if (t.kind === 'interval') {
        const last = this.lastFires[t.id] ?? 0;
        if (now - last >= Math.max(1000, t.intervalMs)) {
          this.fire(t);
        }
      } else if (t.kind === 'daily') {
        const d = new Date(now);
        if (d.getHours() === t.hour && d.getMinutes() === t.minute) {
          const last = this.lastFires[t.id] ?? 0;
          // Only fire once per minute window.
          if (now - last > 60_000) this.fire(t);
        }
      }
    }
  }

  private async pollApps(): Promise<void> {
    const hasAppTriggers = this.triggers.some((t) => t.kind === 'app-launch' && t.enabled);
    if (!hasAppTriggers) return;
    try {
      const res = await this.helper.listApps();
      if (!res.ok || !res.apps) return;
      const active = res.apps.find((a) => a.active) ?? null;
      const currentBundle = active?.bundleId ?? null;
      // Only fire on a TRANSITION into a matching frontmost app, not every poll.
      if (currentBundle !== this.activeBundleId) {
        for (const t of this.triggers) {
          if (t.kind !== 'app-launch' || !t.enabled) continue;
          if (t.bundleId === currentBundle) {
            if (t.skipIfRunning && this.isTriggerRunning()) continue;
            this.fire(t);
          }
        }
        this.activeBundleId = currentBundle;
      }
    } catch {
      // Helper hiccup — next poll will retry.
    }
  }

  private fire(t: Trigger): void {
    this.lastFires[t.id] = Date.now();
    this.emit('fire', t);
  }
}
