import type { MouseButton } from './types.js';

export interface AutonomyRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AutonomyTemplate {
  // Base64-encoded PNG captured by the Swift helper. Kept inline on the node so
  // flows survive export / import without a parallel asset store.
  png: string;
  widthPoints: number;
  heightPoints: number;
  widthPx: number;
  heightPx: number;
}

export type AutonomyNodeKind =
  | 'start'
  | 'click'
  | 'move'
  | 'wait'
  | 'find'
  | 'branch'
  | 'end'
  // Flow control
  | 'loop'
  | 'counter'
  | 'set-var'
  | 'random-wait'
  | 'random-branch'
  | 'stop-error'
  // Feedback / logging
  | 'log'
  | 'notify'
  // Vision polling
  | 'wait-until-found'
  | 'wait-until-gone'
  // Input (helper-backed)
  | 'scroll'
  | 'keypress'
  | 'hotkey'
  | 'type-text'
  | 'drag'
  | 'screenshot';

export interface AutonomyNodeBase {
  id: string;
  kind: AutonomyNodeKind;
  x: number;
  y: number;
}

export type ClickTarget =
  | { kind: 'fixed'; x: number; y: number }
  | { kind: 'cursor' }
  | { kind: 'last-match'; offsetX?: number; offsetY?: number }
  | { kind: 'variable'; xVar: string; yVar: string };

export interface StartNode extends AutonomyNodeBase {
  kind: 'start';
}

export interface ClickNode extends AutonomyNodeBase {
  kind: 'click';
  button: MouseButton;
  clickKind: 'single' | 'double';
  target: ClickTarget;
}

export type MoveStyle = 'teleport' | 'linear' | 'bezier' | 'human';

export interface MoveNode extends AutonomyNodeBase {
  kind: 'move';
  target: ClickTarget;
  // Motion settings forwarded to the helper. Omit for instant teleport.
  style?: MoveStyle;
  durationMs?: number;
  curvature?: number;
  jitter?: number;
}

export interface WaitNode extends AutonomyNodeBase {
  kind: 'wait';
  ms: number;
}

export interface FindNode extends AutonomyNodeBase {
  kind: 'find';
  template: AutonomyTemplate | null;
  searchRegion: AutonomyRect | null;
  threshold: number; // 0 = perfect, 1 = anything goes; typical 0.12 – 0.30.
}

export type BranchCondition =
  | 'last-found'
  | 'pixel-color'
  | 'var-compare'
  | 'iteration';

export type VarCompareOp = '==' | '!=' | '<' | '<=' | '>' | '>=';

export interface BranchNode extends AutonomyNodeBase {
  kind: 'branch';
  condition: BranchCondition;
  // For 'pixel-color' — sample at (px,py) and compare RGB with tolerance.
  px?: number;
  py?: number;
  r?: number;
  g?: number;
  b?: number;
  tolerance?: number;
  // For 'var-compare' — compare a named variable against a literal value.
  varName?: string;
  op?: VarCompareOp;
  // literal can be a number (parsed from compareTo) or a string fallback.
  compareTo?: string;
  // For 'iteration' — branches TRUE when runner iteration count modulo N is 0.
  every?: number;
}

export interface EndNode extends AutonomyNodeBase {
  kind: 'end';
}

// --- New node interfaces -----------------------------------------------------

export interface LoopNode extends AutonomyNodeBase {
  kind: 'loop';
  count: number;
  indexVar?: string; // optional: expose current 0-based index as a var.
}

export type CounterOp = 'set' | 'inc' | 'dec' | 'reset';

export interface CounterNode extends AutonomyNodeBase {
  kind: 'counter';
  varName: string;
  op: CounterOp;
  amount: number; // used for set / inc / dec
}

// set-var: source picks where the value comes from.
export type SetVarSource =
  | { kind: 'literal-number'; value: number }
  | { kind: 'literal-string'; value: string }
  | { kind: 'last-found-x' }
  | { kind: 'last-found-y' }
  | { kind: 'last-found-score' }
  | { kind: 'elapsed-ms' }
  | { kind: 'iterations' }
  | { kind: 'cursor-x' }
  | { kind: 'cursor-y' }
  | { kind: 'random-int'; min: number; max: number };

export interface SetVarNode extends AutonomyNodeBase {
  kind: 'set-var';
  varName: string;
  source: SetVarSource;
}

export interface RandomWaitNode extends AutonomyNodeBase {
  kind: 'random-wait';
  minMs: number;
  maxMs: number;
}

export interface RandomBranchNode extends AutonomyNodeBase {
  kind: 'random-branch';
  probability: number; // 0..1 chance of taking the TRUE port.
}

export interface StopErrorNode extends AutonomyNodeBase {
  kind: 'stop-error';
  message: string;
}

export type LogSeverity = 'info' | 'warn' | 'error';

export interface LogNode extends AutonomyNodeBase {
  kind: 'log';
  message: string; // supports {var} templating.
  severity: LogSeverity;
}

export interface NotifyNode extends AutonomyNodeBase {
  kind: 'notify';
  title: string;
  body: string; // supports {var} templating.
}

// Shared shape for the two polling nodes.
export interface WaitForTemplateBase extends AutonomyNodeBase {
  template: AutonomyTemplate | null;
  searchRegion: AutonomyRect | null;
  threshold: number;
  intervalMs: number;
  timeoutMs: number;
}

export interface WaitUntilFoundNode extends WaitForTemplateBase {
  kind: 'wait-until-found';
}

export interface WaitUntilGoneNode extends WaitForTemplateBase {
  kind: 'wait-until-gone';
}

// --- Helper-backed nodes -----------------------------------------------------

export interface ScrollNode extends AutonomyNodeBase {
  kind: 'scroll';
  dx: number; // horizontal wheel ticks (negative = left).
  dy: number; // vertical wheel ticks (negative = up).
  target: ClickTarget; // where to scroll. 'cursor' scrolls at current position.
}

export type ModifierKey = 'cmd' | 'ctrl' | 'shift' | 'opt';

export interface KeypressNode extends AutonomyNodeBase {
  kind: 'keypress';
  key: string; // single character ("a", "1", "Enter", "Tab", "Escape", "ArrowUp", etc.)
  modifiers: ModifierKey[];
}

export type HotkeyPreset =
  | 'copy'
  | 'paste'
  | 'cut'
  | 'undo'
  | 'redo'
  | 'select-all'
  | 'save'
  | 'screenshot-region'
  | 'screenshot-full';

export interface HotkeyNode extends AutonomyNodeBase {
  kind: 'hotkey';
  preset: HotkeyPreset;
}

export interface TypeTextNode extends AutonomyNodeBase {
  kind: 'type-text';
  text: string; // supports {var} templating.
  perCharDelayMs: number; // 0 = fastest.
}

export interface DragNode extends AutonomyNodeBase {
  kind: 'drag';
  button: MouseButton;
  from: ClickTarget;
  to: ClickTarget;
  steps: number;
  stepDelayMs: number;
}

export interface ScreenshotNode extends AutonomyNodeBase {
  kind: 'screenshot';
  region: AutonomyRect | null; // null = whole primary display.
  toClipboard: boolean;
  saveToDisk: boolean;
  pathVar?: string; // optional var to read the output path from.
}

export type AutonomyNode =
  | StartNode
  | ClickNode
  | MoveNode
  | WaitNode
  | FindNode
  | BranchNode
  | EndNode
  | LoopNode
  | CounterNode
  | SetVarNode
  | RandomWaitNode
  | RandomBranchNode
  | StopErrorNode
  | LogNode
  | NotifyNode
  | WaitUntilFoundNode
  | WaitUntilGoneNode
  | ScrollNode
  | KeypressNode
  | HotkeyNode
  | TypeTextNode
  | DragNode
  | ScreenshotNode;

// Each node emits edges via named ports. Most nodes have a single 'out'; branch
// + loop + wait-until have pairs. The runner picks the edge whose fromPort
// matches the evaluated outcome.
export type AutonomyPort =
  | 'out'
  | 'true'
  | 'false'
  | 'body'
  | 'done'
  | 'found'
  | 'timeout';

export interface AutonomyEdge {
  id: string;
  fromId: string;
  fromPort: AutonomyPort;
  toId: string;
}

export interface AutonomyFlow {
  id: string;
  name: string;
  nodes: AutonomyNode[];
  edges: AutonomyEdge[];
  createdAt: number;
  updatedAt: number;
  // Safety cap — number of node executions before the runner auto-stops.
  maxSteps: number;
}

export interface AutonomyLogEntry {
  ts: number;
  severity: LogSeverity;
  message: string;
  nodeId?: string;
}

export interface AutonomyTick {
  status: 'idle' | 'running' | 'error';
  currentNodeId: string | null;
  iterations: number;
  elapsedMs: number;
  lastError?: string;
  lastFound?: { x: number; y: number; score: number } | null;
  vars?: Record<string, number | string>;
  logs?: AutonomyLogEntry[];
}

export interface CaptureResult {
  ok: boolean;
  png?: string;
  widthPoints?: number;
  heightPoints?: number;
  widthPx?: number;
  heightPx?: number;
  scale?: number;
  err?: string;
}

export interface MatchResult {
  ok: boolean;
  found: boolean;
  x?: number;
  y?: number;
  score?: number;
  err?: string;
}

export interface SampleResult {
  ok: boolean;
  r?: number;
  g?: number;
  b?: number;
  err?: string;
}

export interface RegionPickResult {
  ok: boolean;
  rect?: AutonomyRect;
  reason?: 'cancelled' | 'busy' | 'error';
}

// Port metadata — shared by renderer and timeline so canvas/timeline/store
// agree on how many ports each node kind has and what they're called.
export interface PortSpec {
  id: AutonomyPort;
  label: string;
  accent?: 'default' | 'danger';
}

export function outputPortsFor(kind: AutonomyNodeKind): PortSpec[] {
  switch (kind) {
    case 'end':
    case 'stop-error':
      return [];
    case 'branch':
    case 'random-branch':
      return [
        { id: 'true', label: 'T' },
        { id: 'false', label: 'F', accent: 'danger' },
      ];
    case 'loop':
      return [
        { id: 'body', label: 'body' },
        { id: 'done', label: 'done' },
      ];
    case 'wait-until-found':
    case 'wait-until-gone':
      return [
        { id: 'found', label: 'ok' },
        { id: 'timeout', label: 't/o', accent: 'danger' },
      ];
    default:
      return [{ id: 'out', label: '' }];
  }
}
