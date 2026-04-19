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
  | 'screenshot'
  // Vision / reading
  | 'read-text'
  // System
  | 'focus-app'
  // Composition
  | 'call-flow';

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
  // Minimum required match confidence (normalized cross-correlation, 0..1).
  // Higher = stricter. 1.0 = only accept a perfect pixel-identical hit.
  // 0.85 is a sensible default for UI elements; drop to ~0.7 when the widget
  // has hover / focus states you don't care about distinguishing.
  minConfidence: number;
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
  | { kind: 'last-found-confidence' }
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
  // See FindNode.minConfidence for semantics.
  minConfidence: number;
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

// --- Reading / system / composition -----------------------------------------

// Run OCR over a screen region (macOS Vision framework) and store the
// recognized text in `textVar`. Confidence is stored in `confidenceVar` when
// provided. Fast ocr uses accurate=false; `accurate=true` uses the precise
// revision (slower, better CJK / handwriting).
export interface ReadTextNode extends AutonomyNodeBase {
  kind: 'read-text';
  region: AutonomyRect | null; // null = whole primary display
  textVar: string; // variable to receive the text
  confidenceVar?: string; // optional variable to receive [0..1] confidence
  accurate?: boolean; // false by default
  lang?: string; // primary language hint, e.g. 'en-US'
}

// Bring a macOS app to the foreground by bundle id or app name. Stores a
// number in `resultVar` if supplied: 1=success, 0=not-running, -1=failure.
export interface FocusAppNode extends AutonomyNodeBase {
  kind: 'focus-app';
  appName: string; // e.g. 'Safari' OR bundle id 'com.apple.Safari'
  launchIfMissing?: boolean;
  resultVar?: string;
}

// Call another flow as a sub-routine. The sub-flow runs with its own variable
// scope; `returnVars` lists names that should be lifted back into the caller's
// scope after completion. `argVars` maps outer var -> inner var so the caller
// can pass in context.
export interface CallFlowNode extends AutonomyNodeBase {
  kind: 'call-flow';
  flowId: string | null;
  argVars?: Array<{ from: string; to: string }>;
  returnVars?: string[];
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
  | ScreenshotNode
  | ReadTextNode
  | FocusAppNode
  | CallFlowNode;

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
  lastFound?: { x: number; y: number; confidence: number } | null;
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
  // Confidence in [0, 1]; 1.0 means a pixel-perfect match.
  confidence?: number;
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

export interface OcrResult {
  ok: boolean;
  text?: string;
  confidence?: number; // average per-line confidence in [0, 1]
  err?: string;
}

export interface FocusAppResult {
  ok: boolean;
  // 1 = was already running and activated
  // 0 = not running (or launched when launchIfMissing=true)
  // -1 = failure
  code?: -1 | 0 | 1;
  err?: string;
}

export interface RunningApp {
  bundleId: string;
  name: string;
  pid: number;
  active: boolean;
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
