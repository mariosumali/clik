import { EventEmitter } from 'node:events';
import { screen } from 'electron';
import type { PathRecording, PathSample, PathRecorderStatus } from '../shared/triggers.js';

// Polls the OS cursor position at ~60Hz while active. Uses Electron's
// `screen.getCursorScreenPoint()` so there's no Swift / tap / Accessibility
// dependency beyond what the rest of the app already requires.
export class PathRecorder extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private samples: PathSample[] = [];
  private recordingId: string | null = null;
  private startedAt = 0;
  // The on-screen cursor is only sampled when it has moved by at least this
  // many points from the previous sample, so idle periods don't fill the
  // buffer with duplicate frames.
  private minDeltaSq = 0.25; // 0.5px

  start(): PathRecorderStatus {
    this.stop(false);
    this.samples = [];
    this.startedAt = Date.now();
    this.recordingId = `rec_${this.startedAt.toString(36)}`;
    this.timer = setInterval(() => this.sample(), 16);
    return this.status();
  }

  stop(emit = true): PathRecording | null {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (!this.recordingId) return null;
    const rec: PathRecording = {
      id: this.recordingId,
      name: new Date(this.startedAt).toLocaleTimeString(),
      createdAt: this.startedAt,
      durationMs: Date.now() - this.startedAt,
      samples: this.samples.slice(),
    };
    this.recordingId = null;
    if (emit) this.emit('done', rec);
    return rec;
  }

  isActive(): boolean {
    return this.timer !== null;
  }

  status(): PathRecorderStatus {
    return {
      active: this.timer !== null,
      id: this.recordingId,
      samples: this.samples.length,
      elapsedMs: this.recordingId ? Date.now() - this.startedAt : 0,
    };
  }

  private sample(): void {
    if (!this.recordingId) return;
    const pt = screen.getCursorScreenPoint();
    const t = Date.now() - this.startedAt;
    const last = this.samples.length > 0 ? this.samples[this.samples.length - 1]! : null;
    if (last) {
      const dx = pt.x - last.x;
      const dy = pt.y - last.y;
      if (dx * dx + dy * dy < this.minDeltaSq) return;
    }
    this.samples.push({ t, x: pt.x, y: pt.y });
    // Emit a tick so the renderer's recorder UI can show live sample count.
    this.emit('tick', this.status());
  }
}
