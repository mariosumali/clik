import { EventEmitter } from 'node:events';
import { screen, Notification } from 'electron';
import { HelperClient } from './helper.js';
import type {
  AutonomyEdge,
  AutonomyFlow,
  AutonomyLogEntry,
  AutonomyNode,
  AutonomyPort,
  AutonomyTick,
  BranchNode,
  ClickNode,
  ClickTarget,
  CounterNode,
  DragNode,
  FindNode,
  HotkeyNode,
  KeypressNode,
  LogNode,
  LoopNode,
  ModifierKey,
  MoveNode,
  NotifyNode,
  RandomBranchNode,
  RandomWaitNode,
  ScreenshotNode,
  ScrollNode,
  SetVarNode,
  StopErrorNode,
  TypeTextNode,
  WaitNode,
  WaitUntilFoundNode,
  WaitUntilGoneNode,
} from '../shared/autonomy.js';

interface RunnerState {
  startedAt: number;
  iterations: number;
  currentNodeId: string | null;
  lastFound: { x: number; y: number; score: number } | null;
  lastError?: string;
  pendingTimer: NodeJS.Timeout | null;
  cancelled: boolean;
  // Named variables — string-keyed number/string slots. Populated by set-var,
  // counter, and loop (via indexVar). Read by click/move targets, branches,
  // and {name}-templated message nodes.
  vars: Record<string, number | string>;
  // Per-loop-node iteration counters. Keyed by node id so nested loops work
  // correctly when they share scope.
  loopCounters: Record<string, number>;
  // Bounded ring buffer of log entries surfaced on ticks.
  logs: AutonomyLogEntry[];
}

// Default safety cap if the flow doesn't specify one.
const DEFAULT_MAX_STEPS = 1000;
const LOG_CAP = 200;

// The runner walks the directed graph from the Start node. Each node's
// successor is picked by the edge whose fromPort matches the evaluated output
// ('out' for linear nodes, 'true' / 'false' for branches, 'body' / 'done' for
// loops, 'found' / 'timeout' for wait-until-* nodes). Loops are allowed but
// the `maxSteps` ceiling guards against runaways.
export class AutonomyRunner extends EventEmitter {
  private helper: HelperClient;
  private flow: AutonomyFlow | null = null;
  private state: RunnerState | null = null;
  private running = false;

  constructor(helper: HelperClient) {
    super();
    this.helper = helper;
  }

  snapshot(): AutonomyTick {
    if (!this.running || !this.state) {
      return {
        status: 'idle',
        currentNodeId: null,
        iterations: 0,
        elapsedMs: 0,
      };
    }
    return {
      status: 'running',
      currentNodeId: this.state.currentNodeId,
      iterations: this.state.iterations,
      elapsedMs: Date.now() - this.state.startedAt,
      lastError: this.state.lastError,
      lastFound: this.state.lastFound,
      vars: { ...this.state.vars },
      logs: this.state.logs.slice(-50),
    };
  }

  async start(flow: AutonomyFlow): Promise<{ ok: boolean; err?: string }> {
    if (this.running) this.stop('restarted');
    const startNode = flow.nodes.find((n) => n.kind === 'start');
    if (!startNode) return { ok: false, err: 'no-start-node' };

    this.flow = flow;
    this.state = {
      startedAt: Date.now(),
      iterations: 0,
      currentNodeId: startNode.id,
      lastFound: null,
      pendingTimer: null,
      cancelled: false,
      vars: {},
      loopCounters: {},
      logs: [],
    };
    this.running = true;
    this.emitTick();
    // Run off the microtask queue so the caller's IPC reply lands first.
    queueMicrotask(() => this.step());
    return { ok: true };
  }

  stop(reason?: string): void {
    if (!this.running) return;
    const s = this.state;
    this.running = false;
    if (s) {
      s.cancelled = true;
      if (s.pendingTimer) {
        clearTimeout(s.pendingTimer);
        s.pendingTimer = null;
      }
      if (reason && reason !== 'completed') s.lastError = reason;
    }
    this.emitTick();
  }

  private async step(): Promise<void> {
    const flow = this.flow;
    const s = this.state;
    if (!flow || !s || !this.running || s.cancelled) return;

    const nodeId = s.currentNodeId;
    if (!nodeId) {
      this.finish('completed');
      return;
    }
    const node = flow.nodes.find((n) => n.id === nodeId);
    if (!node) {
      this.finish('missing-node');
      return;
    }

    const cap = flow.maxSteps > 0 ? flow.maxSteps : DEFAULT_MAX_STEPS;
    if (s.iterations >= cap) {
      this.finish('max-steps');
      return;
    }
    s.iterations += 1;
    this.emitTick();

    try {
      const nextPort = await this.execute(node);
      if (!this.running || !this.state || this.state.cancelled) return;

      if (nextPort === null) {
        // End node reached, or a node explicitly terminated the run.
        this.finish('completed');
        return;
      }

      const nextId = this.followEdge(flow.edges, node.id, nextPort);
      if (!nextId) {
        this.finish('dead-end');
        return;
      }
      this.state.currentNodeId = nextId;
      queueMicrotask(() => this.step());
    } catch (err) {
      this.finish(err instanceof Error ? err.message : 'unknown-error');
    }
  }

  // Returns the outbound port name to follow, or null to end the run.
  private async execute(node: AutonomyNode): Promise<AutonomyPort | null> {
    const s = this.state!;
    switch (node.kind) {
      case 'start':
        return 'out';
      case 'end':
        return null;
      case 'stop-error': {
        const sn = node as StopErrorNode;
        throw new Error(this.resolveTemplate(sn.message || 'stopped-with-error'));
      }
      case 'wait':
        await this.sleep((node as WaitNode).ms);
        return 'out';
      case 'random-wait': {
        const rn = node as RandomWaitNode;
        const lo = Math.min(rn.minMs, rn.maxMs);
        const hi = Math.max(rn.minMs, rn.maxMs);
        const ms = Math.floor(lo + Math.random() * Math.max(0, hi - lo));
        await this.sleep(ms);
        return 'out';
      }
      case 'random-branch': {
        const rbn = node as RandomBranchNode;
        const p = Math.min(1, Math.max(0, rbn.probability));
        return Math.random() < p ? 'true' : 'false';
      }
      case 'loop': {
        const ln = node as LoopNode;
        const idx = s.loopCounters[ln.id] ?? 0;
        if (idx < ln.count) {
          s.loopCounters[ln.id] = idx + 1;
          if (ln.indexVar) s.vars[ln.indexVar] = idx;
          return 'body';
        }
        // Loop done — reset so a re-entry via an outer loop starts fresh.
        delete s.loopCounters[ln.id];
        return 'done';
      }
      case 'counter': {
        const cn = node as CounterNode;
        const cur = typeof s.vars[cn.varName] === 'number'
          ? (s.vars[cn.varName] as number)
          : 0;
        switch (cn.op) {
          case 'set':
            s.vars[cn.varName] = cn.amount;
            break;
          case 'inc':
            s.vars[cn.varName] = cur + cn.amount;
            break;
          case 'dec':
            s.vars[cn.varName] = cur - cn.amount;
            break;
          case 'reset':
            s.vars[cn.varName] = 0;
            break;
        }
        return 'out';
      }
      case 'set-var': {
        const svn = node as SetVarNode;
        s.vars[svn.varName] = this.computeSetVarValue(svn);
        return 'out';
      }
      case 'log': {
        const lg = node as LogNode;
        this.appendLog({
          ts: Date.now(),
          severity: lg.severity,
          message: this.resolveTemplate(lg.message),
          nodeId: lg.id,
        });
        return 'out';
      }
      case 'notify': {
        const nn = node as NotifyNode;
        try {
          if (Notification.isSupported()) {
            new Notification({
              title: this.resolveTemplate(nn.title || 'CLIK'),
              body: this.resolveTemplate(nn.body),
            }).show();
          }
        } catch {
          // Silent — notifications are best-effort feedback.
        }
        return 'out';
      }
      case 'move': {
        const mv = node as MoveNode;
        // `cursor` as a move target is a no-op ("move cursor to cursor"), so
        // short-circuit before hitting the helper. For fixed / last-match /
        // variable we post a real mouseMoved event; downstream click nodes
        // with target.kind === 'cursor' will then fire at this location.
        if (mv.target.kind === 'cursor') return 'out';
        const pt = this.resolveTargetPoint(mv.target);
        if (!pt) throw new Error('move-target-unresolved');
        const res = await this.helper.move({
          x: pt.x,
          y: pt.y,
          style: mv.style,
          durationMs: mv.durationMs,
          curvature: mv.curvature,
          jitter: mv.jitter,
        });
        if (!res.ok) throw new Error(res.err ?? 'move-failed');
        return 'out';
      }
      case 'click': {
        const cn = node as ClickNode;
        const pt = this.resolveTargetPoint(cn.target);
        const res = await this.helper.click({
          button: cn.button,
          kind: cn.clickKind,
          x: pt ? pt.x : null,
          y: pt ? pt.y : null,
        });
        if (!res.ok) throw new Error(res.err ?? 'click-failed');
        return 'out';
      }
      case 'scroll': {
        const sn = node as ScrollNode;
        const pt = this.resolveTargetPoint(sn.target);
        const res = await this.helper.scroll({
          dx: sn.dx,
          dy: sn.dy,
          x: pt ? pt.x : null,
          y: pt ? pt.y : null,
        });
        if (!res.ok) throw new Error(res.err ?? 'scroll-failed');
        return 'out';
      }
      case 'keypress': {
        const kn = node as KeypressNode;
        const res = await this.helper.keypress({
          key: kn.key,
          modifiers: kn.modifiers,
        });
        if (!res.ok) throw new Error(res.err ?? 'keypress-failed');
        return 'out';
      }
      case 'hotkey': {
        const hn = node as HotkeyNode;
        const combo = hotkeyPresetToCombo(hn.preset);
        const res = await this.helper.keypress(combo);
        if (!res.ok) throw new Error(res.err ?? 'hotkey-failed');
        return 'out';
      }
      case 'type-text': {
        const tn = node as TypeTextNode;
        const text = this.resolveTemplate(tn.text);
        const res = await this.helper.type({
          text,
          perCharDelayMs: tn.perCharDelayMs,
        });
        if (!res.ok) throw new Error(res.err ?? 'type-failed');
        return 'out';
      }
      case 'drag': {
        const dn = node as DragNode;
        const from = this.resolveTargetPoint(dn.from);
        const to = this.resolveTargetPoint(dn.to);
        if (!from || !to) throw new Error('drag-target-unresolved');
        const res = await this.helper.drag({
          button: dn.button,
          x1: from.x,
          y1: from.y,
          x2: to.x,
          y2: to.y,
          steps: Math.max(2, dn.steps),
          stepDelayMs: Math.max(0, dn.stepDelayMs),
        });
        if (!res.ok) throw new Error(res.err ?? 'drag-failed');
        return 'out';
      }
      case 'screenshot': {
        const sh = node as ScreenshotNode;
        const region = sh.region ?? this.primaryDisplayRegion();
        const res = await this.helper.capture({
          x: region.x,
          y: region.y,
          w: region.w,
          h: region.h,
          toClipboard: sh.toClipboard,
        });
        if (!res.ok) throw new Error(res.err ?? 'capture-failed');
        if (sh.saveToDisk && sh.pathVar) {
          const p = String(s.vars[sh.pathVar] ?? '');
          if (p && res.png) {
            try {
              const { writeFile } = await import('node:fs/promises');
              await writeFile(p, Buffer.from(res.png, 'base64'));
            } catch (err) {
              this.appendLog({
                ts: Date.now(),
                severity: 'warn',
                message: `screenshot save failed: ${(err as Error).message}`,
                nodeId: sh.id,
              });
            }
          }
        }
        return 'out';
      }
      case 'find': {
        const fn = node as FindNode;
        const found = await this.runFind(fn);
        s.lastFound = found ?? null;
        return 'out';
      }
      case 'wait-until-found': {
        const wn = node as WaitUntilFoundNode;
        const deadline = Date.now() + Math.max(0, wn.timeoutMs);
        while (Date.now() < deadline) {
          const f = await this.runFind(wn as unknown as FindNode);
          if (!this.running || this.state?.cancelled) return null;
          if (f) {
            s.lastFound = f;
            return 'found';
          }
          await this.sleep(Math.max(10, wn.intervalMs));
          if (!this.running || this.state?.cancelled) return null;
        }
        return 'timeout';
      }
      case 'wait-until-gone': {
        const wn = node as WaitUntilGoneNode;
        const deadline = Date.now() + Math.max(0, wn.timeoutMs);
        while (Date.now() < deadline) {
          const f = await this.runFind(wn as unknown as FindNode);
          if (!this.running || this.state?.cancelled) return null;
          if (!f) {
            s.lastFound = null;
            return 'found';
          }
          await this.sleep(Math.max(10, wn.intervalMs));
          if (!this.running || this.state?.cancelled) return null;
        }
        return 'timeout';
      }
      case 'branch': {
        const bn = node as BranchNode;
        const branched = await this.evaluateBranch(bn);
        return branched ? 'true' : 'false';
      }
      default:
        throw new Error('unknown-node-kind');
    }
  }

  private computeSetVarValue(node: SetVarNode): number | string {
    const s = this.state!;
    const src = node.source;
    switch (src.kind) {
      case 'literal-number':
        return src.value;
      case 'literal-string':
        return this.resolveTemplate(src.value);
      case 'last-found-x':
        return s.lastFound?.x ?? 0;
      case 'last-found-y':
        return s.lastFound?.y ?? 0;
      case 'last-found-score':
        return s.lastFound?.score ?? 1;
      case 'elapsed-ms':
        return Date.now() - s.startedAt;
      case 'iterations':
        return s.iterations;
      case 'cursor-x':
        return screen.getCursorScreenPoint().x;
      case 'cursor-y':
        return screen.getCursorScreenPoint().y;
      case 'random-int': {
        const lo = Math.min(src.min, src.max);
        const hi = Math.max(src.min, src.max);
        return Math.floor(lo + Math.random() * (hi - lo + 1));
      }
    }
  }

  private async runFind(node: FindNode): Promise<{ x: number; y: number; score: number } | null> {
    if (!node.template) throw new Error('no-template');
    const region = node.searchRegion ?? this.primaryDisplayRegion();
    const res = await this.helper.match({
      png: node.template.png,
      x: region.x,
      y: region.y,
      w: region.w,
      h: region.h,
      threshold: node.threshold,
    });
    if (!res.ok) throw new Error(res.err ?? 'match-failed');
    if (!res.found || res.cx === undefined || res.cy === undefined) return null;
    return { x: res.cx, y: res.cy, score: res.score ?? 0 };
  }

  private async evaluateBranch(node: BranchNode): Promise<boolean> {
    const s = this.state!;
    if (node.condition === 'last-found') {
      return !!s.lastFound;
    }
    if (node.condition === 'pixel-color') {
      if (node.px === undefined || node.py === undefined) return false;
      const res = await this.helper.sample({ x: node.px, y: node.py });
      if (!res.ok) throw new Error(res.err ?? 'sample-failed');
      const tol = node.tolerance ?? 16;
      const dr = Math.abs((res.r ?? 0) - (node.r ?? 0));
      const dg = Math.abs((res.g ?? 0) - (node.g ?? 0));
      const db = Math.abs((res.b ?? 0) - (node.b ?? 0));
      return dr <= tol && dg <= tol && db <= tol;
    }
    if (node.condition === 'var-compare') {
      if (!node.varName) return false;
      const lhs = s.vars[node.varName];
      const rhsRaw = node.compareTo ?? '';
      const rhsNum = Number(rhsRaw);
      const op = node.op ?? '==';
      // Compare numerically when both sides parse cleanly; otherwise string-compare.
      const numeric = typeof lhs === 'number' && !Number.isNaN(rhsNum);
      const a = numeric ? (lhs as number) : String(lhs ?? '');
      const b = numeric ? rhsNum : rhsRaw;
      switch (op) {
        case '==':
          return a === b;
        case '!=':
          return a !== b;
        case '<':
          return a < b;
        case '<=':
          return a <= b;
        case '>':
          return a > b;
        case '>=':
          return a >= b;
      }
    }
    if (node.condition === 'iteration') {
      const every = Math.max(1, node.every ?? 1);
      return s.iterations % every === 0;
    }
    return false;
  }

  // Expand {var}, {lastFound.x}, {iterations}, {elapsedMs} inside user strings.
  private resolveTemplate(s: string): string {
    if (!s || s.indexOf('{') === -1) return s;
    const st = this.state!;
    return s.replace(/\{([^}]+)\}/g, (_m, key: string) => {
      const k = key.trim();
      if (k === 'iterations') return String(st.iterations);
      if (k === 'elapsedMs') return String(Date.now() - st.startedAt);
      if (k === 'lastFound.x') return String(st.lastFound?.x ?? '');
      if (k === 'lastFound.y') return String(st.lastFound?.y ?? '');
      if (k === 'lastFound.score') return String(st.lastFound?.score ?? '');
      const v = st.vars[k];
      return v === undefined ? '' : String(v);
    });
  }

  private resolveTargetPoint(target: ClickTarget): { x: number; y: number } | null {
    const s = this.state;
    if (target.kind === 'fixed') {
      return { x: target.x, y: target.y };
    }
    if (target.kind === 'cursor') {
      return null; // Let the helper read the live cursor.
    }
    if (target.kind === 'last-match') {
      const m = s?.lastFound;
      if (!m) return null;
      return {
        x: m.x + (target.offsetX ?? 0),
        y: m.y + (target.offsetY ?? 0),
      };
    }
    if (target.kind === 'variable') {
      const xs = s?.vars[target.xVar];
      const ys = s?.vars[target.yVar];
      const xn = typeof xs === 'number' ? xs : Number(xs);
      const yn = typeof ys === 'number' ? ys : Number(ys);
      if (Number.isFinite(xn) && Number.isFinite(yn)) return { x: xn, y: yn };
      return null;
    }
    return null;
  }

  private appendLog(entry: AutonomyLogEntry): void {
    const s = this.state;
    if (!s) return;
    s.logs.push(entry);
    if (s.logs.length > LOG_CAP) s.logs.splice(0, s.logs.length - LOG_CAP);
  }

  private followEdge(edges: AutonomyEdge[], fromId: string, fromPort: AutonomyPort): string | null {
    const edge = edges.find((e) => e.fromId === fromId && e.fromPort === fromPort);
    return edge ? edge.toId : null;
  }

  private primaryDisplayRegion() {
    const d = screen.getPrimaryDisplay().bounds;
    return { x: d.x, y: d.y, w: d.width, h: d.height };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      if (!this.state) return resolve();
      this.state.pendingTimer = setTimeout(() => {
        if (this.state) this.state.pendingTimer = null;
        resolve();
      }, Math.max(0, ms));
    });
  }

  private finish(reason: string): void {
    this.running = false;
    const s = this.state;
    if (s) {
      if (reason !== 'completed') s.lastError = reason;
      if (s.pendingTimer) {
        clearTimeout(s.pendingTimer);
        s.pendingTimer = null;
      }
      s.currentNodeId = null;
    }
    this.emitTick();
  }

  private emitTick(): void {
    this.emit('tick', this.snapshot());
  }
}

// Map a HotkeyNode preset to a (key, modifiers) pair for the helper. Mac-first
// layouts: Cmd for editing ops, Cmd+Shift for screenshot combos.
function hotkeyPresetToCombo(preset: string): { key: string; modifiers: ModifierKey[] } {
  switch (preset) {
    case 'copy':
      return { key: 'c', modifiers: ['cmd'] };
    case 'paste':
      return { key: 'v', modifiers: ['cmd'] };
    case 'cut':
      return { key: 'x', modifiers: ['cmd'] };
    case 'undo':
      return { key: 'z', modifiers: ['cmd'] };
    case 'redo':
      return { key: 'z', modifiers: ['cmd', 'shift'] };
    case 'select-all':
      return { key: 'a', modifiers: ['cmd'] };
    case 'save':
      return { key: 's', modifiers: ['cmd'] };
    case 'screenshot-region':
      return { key: '4', modifiers: ['cmd', 'shift'] };
    case 'screenshot-full':
      return { key: '3', modifiers: ['cmd', 'shift'] };
    default:
      return { key: 'c', modifiers: ['cmd'] };
  }
}
