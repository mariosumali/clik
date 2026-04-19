import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

type PendingResolver = (msg: HelperResponse) => void;

export interface HelperResponse {
  id: number;
  ok: boolean;
  err?: string;
  trusted?: boolean;
  // capture
  png?: string;
  w?: number;
  h?: number;
  pxW?: number;
  pxH?: number;
  scale?: number;
  // sample
  r?: number;
  g?: number;
  b?: number;
  // match
  found?: boolean;
  cx?: number;
  cy?: number;
  score?: number;
  // capture
  clipboardOk?: boolean;
}

export interface ClickRequest {
  button?: 'left' | 'right' | 'middle';
  kind?: 'single' | 'double' | 'hold' | 'release';
  x?: number | null;
  y?: number | null;
}

export interface MoveRequest {
  x: number;
  y: number;
  // Motion settings. Omit for instant teleport (the default).
  style?: 'teleport' | 'linear' | 'bezier' | 'human';
  durationMs?: number;
  curvature?: number;
  jitter?: number;
}

export interface CaptureRequest {
  x: number;
  y: number;
  w: number;
  h: number;
  toClipboard?: boolean;
}

export interface ScrollRequest {
  dx: number;
  dy: number;
  x?: number | null;
  y?: number | null;
}

export interface KeypressRequest {
  key: string;
  modifiers?: string[];
}

export interface TypeRequest {
  text: string;
  perCharDelayMs?: number;
}

export interface DragRequest {
  button?: 'left' | 'right' | 'middle';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  steps?: number;
  stepDelayMs?: number;
}

export interface SampleRequest {
  x: number;
  y: number;
}

export interface MatchRequest {
  png: string;
  x: number;
  y: number;
  w: number;
  h: number;
  threshold?: number;
}

export function resolveHelperPath(): string {
  // Packaged: resources ship alongside app.asar via extraResource.
  const packaged = path.join(process.resourcesPath || '', 'clik-helper');
  if (existsSync(packaged)) return packaged;

  // Dev: repo-relative.
  const dev = path.join(app.getAppPath(), 'resources', 'clik-helper');
  if (existsSync(dev)) return dev;

  // Last resort — next to cwd.
  return path.join(process.cwd(), 'resources', 'clik-helper');
}

export class HelperClient {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private buffer = '';
  private nextId = 1;
  private pending = new Map<number, PendingResolver>();
  private ready = false;
  private trusted = false;
  private onReadyCbs: Array<(trusted: boolean) => void> = [];
  private onExitCbs: Array<(code: number | null) => void> = [];

  start(): void {
    if (this.proc) return;
    const bin = resolveHelperPath();
    if (!existsSync(bin)) {
      throw new Error(`clik-helper not found at ${bin}. Run 'npm run build:helper'.`);
    }
    const proc = spawn(bin, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    proc.stdout.setEncoding('utf8');
    proc.stderr.setEncoding('utf8');

    proc.stdout.on('data', (chunk: string) => this.onData(chunk));
    proc.stderr.on('data', (chunk: string) => {
      console.warn('[clik-helper] stderr:', chunk.trim());
    });
    proc.on('exit', (code) => {
      this.proc = null;
      this.ready = false;
      for (const [, resolve] of this.pending) {
        resolve({ id: -1, ok: false, err: 'helper-exited' });
      }
      this.pending.clear();
      for (const cb of this.onExitCbs) cb(code);
    });
    this.proc = proc;
  }

  stop(): void {
    if (!this.proc) return;
    this.proc.kill();
    this.proc = null;
  }

  onReady(cb: (trusted: boolean) => void): void {
    if (this.ready) cb(this.trusted);
    else this.onReadyCbs.push(cb);
  }

  onExit(cb: (code: number | null) => void): void {
    this.onExitCbs.push(cb);
  }

  isTrusted(): boolean {
    return this.trusted;
  }

  async click(req: ClickRequest): Promise<HelperResponse> {
    return this.send({ cmd: 'click', ...req });
  }

  async move(req: MoveRequest): Promise<HelperResponse> {
    return this.send({ cmd: 'move', ...req });
  }

  async capture(req: CaptureRequest): Promise<HelperResponse> {
    return this.send({ cmd: 'capture', ...req });
  }

  async sample(req: SampleRequest): Promise<HelperResponse> {
    return this.send({ cmd: 'sample', ...req });
  }

  async match(req: MatchRequest): Promise<HelperResponse> {
    return this.send({ cmd: 'match', ...req });
  }

  async scroll(req: ScrollRequest): Promise<HelperResponse> {
    return this.send({ cmd: 'scroll', ...req });
  }

  async keypress(req: KeypressRequest): Promise<HelperResponse> {
    return this.send({ cmd: 'keypress', ...req });
  }

  async type(req: TypeRequest): Promise<HelperResponse> {
    return this.send({ cmd: 'type', ...req });
  }

  async drag(req: DragRequest): Promise<HelperResponse> {
    return this.send({ cmd: 'drag', ...req });
  }

  private send(payload: Record<string, unknown>): Promise<HelperResponse> {
    if (!this.proc) return Promise.resolve({ id: -1, ok: false, err: 'helper-not-running' });
    const id = this.nextId++;
    const body = JSON.stringify({ id, ...payload });
    return new Promise<HelperResponse>((resolve) => {
      this.pending.set(id, resolve);
      this.proc!.stdin.write(body + '\n');
    });
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let nl: number;
    while ((nl = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (!line) continue;
      let obj: unknown;
      try {
        obj = JSON.parse(line);
      } catch {
        console.warn('[clik-helper] bad json:', line);
        continue;
      }
      const msg = obj as HelperResponse & { event?: string };
      if (msg.event === 'ready') {
        this.ready = true;
        this.trusted = !!msg.trusted;
        for (const cb of this.onReadyCbs) cb(this.trusted);
        this.onReadyCbs.length = 0;
        continue;
      }
      if (typeof msg.id === 'number') {
        const resolver = this.pending.get(msg.id);
        if (resolver) {
          this.pending.delete(msg.id);
          resolver(msg);
        }
      }
    }
  }
}
