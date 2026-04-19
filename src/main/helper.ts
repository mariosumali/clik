import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

type PendingResolver = (msg: HelperResponse) => void;

interface HelperResponse {
  id: number;
  ok: boolean;
  err?: string;
  trusted?: boolean;
}

interface HelperRequest {
  cmd?: 'click' | 'ping' | 'trust';
  button?: 'left' | 'right' | 'middle';
  kind?: 'single' | 'double' | 'hold' | 'release';
  x?: number | null;
  y?: number | null;
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

  async click(req: HelperRequest): Promise<HelperResponse> {
    if (!this.proc) throw new Error('helper not running');
    const id = this.nextId++;
    const payload = JSON.stringify({ id, cmd: 'click', ...req });
    return new Promise<HelperResponse>((resolve) => {
      this.pending.set(id, resolve);
      this.proc!.stdin.write(payload + '\n');
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
      const msg = obj as { event?: string; id?: number; ok?: boolean; trusted?: boolean; err?: string };
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
          resolver({ id: msg.id, ok: !!msg.ok, err: msg.err, trusted: msg.trusted });
        }
      }
    }
  }
}
