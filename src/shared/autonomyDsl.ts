// Bidirectional text <-> graph codec for Autonomy flows.
//
// The DSL is script-like: each node is a named declaration, edges are port
// arrows. Example:
//
//   flow "My Flow" {
//     maxSteps: 1000
//   }
//
//   start1 = start()                            @ (40, 200)
//   w1     = wait(ms: 500)                      @ (200, 200)
//   c1     = click(button: "left", kind: "single",
//                  target: point(100, 200))     @ (360, 200)
//   f1     = find(template: $tpl_f1, minConfidence: 0.85)
//   b1     = branch(condition: "last-found")
//   end1   = end()
//
//   start1 -> w1 -> c1 -> f1
//   f1.found   -> b1
//   f1.timeout -> end1
//   b1.true    -> c1
//   b1.false   -> end1
//
// Round-trip behavior:
// - Node identifiers derive from `node.id` with hyphens replaced by underscores,
//   so `formatFlow -> parseFlow -> formatFlow` is idempotent.
// - Template blobs are never inlined; the formatter emits `$tpl_<id>` refs and
//   the parser resolves them from `prevFlow` so edits never destroy templates.
// - `@ (x, y)` layout hints are optional; new nodes without hints are placed
//   at a default offset (see DEFAULT_NODE_X / DEFAULT_NODE_Y).

import type {
  AutonomyEdge,
  AutonomyFlow,
  AutonomyNode,
  AutonomyNodeKind,
  AutonomyPort,
  AutonomyRect,
  AutonomyTemplate,
  BranchCondition,
  BranchNode,
  ClickNode,
  ClickTarget,
  CounterNode,
  CounterOp,
  DragNode,
  EndNode,
  FindNode,
  HotkeyNode,
  HotkeyPreset,
  KeypressNode,
  LogNode,
  LogSeverity,
  LoopNode,
  ModifierKey,
  MoveNode,
  MoveStyle,
  NotifyNode,
  RandomBranchNode,
  RandomWaitNode,
  ScreenshotNode,
  ScrollNode,
  SetVarNode,
  SetVarSource,
  StartNode,
  StopErrorNode,
  TypeTextNode,
  VarCompareOp,
  WaitNode,
  WaitUntilFoundNode,
  WaitUntilGoneNode,
} from './autonomy.js';
import type { MouseButton } from './types.js';

// --- Public API --------------------------------------------------------------

export interface ParseError {
  line: number;
  col: number;
  message: string;
}

export type ParseResult =
  | { ok: true; flow: AutonomyFlow }
  | { ok: false; errors: ParseError[] };

// Identifier form used in code. Hyphens are not allowed in JS-ish identifiers,
// so node.id is sanitized for display and reversed on parse via prevFlow lookup.
function nodeDisplayName(node: AutonomyNode): string {
  return node.id.replace(/-/g, '_');
}

// Canonical kind <-> DSL name mapping. DSL uses camelCase so identifiers stay
// hyphen-free.
const KIND_TO_DSL: Record<AutonomyNodeKind, string> = {
  start: 'start',
  end: 'end',
  wait: 'wait',
  click: 'click',
  move: 'move',
  find: 'find',
  branch: 'branch',
  loop: 'loop',
  counter: 'counter',
  'set-var': 'setVar',
  'random-wait': 'randomWait',
  'random-branch': 'randomBranch',
  'stop-error': 'stopError',
  log: 'log',
  notify: 'notify',
  'wait-until-found': 'waitUntilFound',
  'wait-until-gone': 'waitUntilGone',
  scroll: 'scroll',
  keypress: 'keypress',
  hotkey: 'hotkey',
  'type-text': 'typeText',
  drag: 'drag',
  screenshot: 'screenshot',
  'read-text': 'readText',
  'focus-app': 'focusApp',
  'call-flow': 'callFlow',
};

const DSL_TO_KIND: Record<string, AutonomyNodeKind> = Object.fromEntries(
  Object.entries(KIND_TO_DSL).map(([k, v]) => [v, k as AutonomyNodeKind]),
);

// --- Formatter ---------------------------------------------------------------

export function formatFlow(flow: AutonomyFlow): string {
  const out: string[] = [];

  // Header — quote flow name and emit non-default metadata.
  out.push(`flow ${quote(flow.name)} {`);
  out.push(`  maxSteps: ${flow.maxSteps}`);
  out.push(`}`);
  out.push('');

  // Order: BFS from the start node so chains render in execution order,
  // falling back to original ordering for unreached nodes.
  const ordered = orderNodes(flow);
  const maxNameLen = ordered.reduce(
    (m, n) => Math.max(m, nodeDisplayName(n).length),
    0,
  );
  for (const node of ordered) {
    out.push(formatNodeLine(node, maxNameLen));
  }

  if (flow.edges.length > 0) {
    out.push('');
    for (const line of formatEdges(flow, ordered)) {
      out.push(line);
    }
  }

  return out.join('\n') + '\n';
}

function orderNodes(flow: AutonomyFlow): AutonomyNode[] {
  const start = flow.nodes.find((n) => n.kind === 'start');
  if (!start) return flow.nodes.slice();
  const byId = new Map(flow.nodes.map((n) => [n.id, n]));
  const outs = new Map<string, AutonomyEdge[]>();
  for (const e of flow.edges) {
    const arr = outs.get(e.fromId) ?? [];
    arr.push(e);
    outs.set(e.fromId, arr);
  }
  const seen = new Set<string>([start.id]);
  const queue: AutonomyNode[] = [start];
  const result: AutonomyNode[] = [];
  while (queue.length > 0) {
    const n = queue.shift()!;
    result.push(n);
    const next = outs.get(n.id) ?? [];
    for (const e of next) {
      if (seen.has(e.toId)) continue;
      const target = byId.get(e.toId);
      if (!target) continue;
      seen.add(e.toId);
      queue.push(target);
    }
  }
  for (const n of flow.nodes) {
    if (!seen.has(n.id)) result.push(n);
  }
  return result;
}

function formatNodeLine(node: AutonomyNode, nameWidth: number): string {
  const name = nodeDisplayName(node);
  const dsl = KIND_TO_DSL[node.kind];
  const args = formatNodeArgs(node);
  const pad = ' '.repeat(Math.max(1, nameWidth - name.length + 1));
  const pos = `  @ (${node.x}, ${node.y})`;
  return `${name}${pad}= ${dsl}(${args})${pos}`;
}

function formatNodeArgs(node: AutonomyNode): string {
  switch (node.kind) {
    case 'start':
    case 'end':
      return '';
    case 'wait':
      return kv('ms', node.ms);
    case 'random-wait':
      return join(kv('minMs', node.minMs), kv('maxMs', node.maxMs));
    case 'click':
      return join(
        kv('button', node.button),
        kv('kind', node.clickKind),
        kvRaw('target', formatClickTarget(node.target)),
      );
    case 'move':
      return join(
        kvRaw('target', formatClickTarget(node.target)),
        node.style !== undefined ? kv('style', node.style) : '',
        node.durationMs !== undefined ? kv('durationMs', node.durationMs) : '',
        node.curvature !== undefined ? kv('curvature', node.curvature) : '',
        node.jitter !== undefined ? kv('jitter', node.jitter) : '',
      );
    case 'find':
      return join(
        kvRaw('template', formatTemplateRef(node.id, node.template)),
        kv('minConfidence', node.minConfidence),
        node.searchRegion ? kvRaw('searchRegion', formatRect(node.searchRegion)) : '',
      );
    case 'branch':
      return formatBranchArgs(node);
    case 'loop':
      return join(
        kv('count', node.count),
        node.indexVar ? kv('indexVar', node.indexVar) : '',
      );
    case 'counter':
      return join(
        kv('varName', node.varName),
        kv('op', node.op),
        kv('amount', node.amount),
      );
    case 'set-var':
      return join(
        kv('varName', node.varName),
        kvRaw('source', formatSetVarSource(node.source)),
      );
    case 'random-branch':
      return kv('probability', node.probability);
    case 'stop-error':
      return kv('message', node.message);
    case 'log':
      return join(kv('message', node.message), kv('severity', node.severity));
    case 'notify':
      return join(kv('title', node.title), kv('body', node.body));
    case 'wait-until-found':
    case 'wait-until-gone':
      return join(
        kvRaw('template', formatTemplateRef(node.id, node.template)),
        kv('minConfidence', node.minConfidence),
        kv('intervalMs', node.intervalMs),
        kv('timeoutMs', node.timeoutMs),
        node.searchRegion ? kvRaw('searchRegion', formatRect(node.searchRegion)) : '',
      );
    case 'scroll':
      return join(
        kv('dx', node.dx),
        kv('dy', node.dy),
        kvRaw('target', formatClickTarget(node.target)),
      );
    case 'keypress':
      return join(
        kv('key', node.key),
        kvRaw('modifiers', formatArray(node.modifiers.map((m) => quote(m)))),
      );
    case 'hotkey':
      return kv('preset', node.preset);
    case 'type-text':
      return join(kv('text', node.text), kv('perCharDelayMs', node.perCharDelayMs));
    case 'drag':
      return join(
        kv('button', node.button),
        kvRaw('from', formatClickTarget(node.from)),
        kvRaw('to', formatClickTarget(node.to)),
        kv('steps', node.steps),
        kv('stepDelayMs', node.stepDelayMs),
      );
    case 'screenshot':
      return join(
        node.region ? kvRaw('region', formatRect(node.region)) : '',
        kv('toClipboard', node.toClipboard),
        kv('saveToDisk', node.saveToDisk),
        node.pathVar ? kv('pathVar', node.pathVar) : '',
      );
    case 'read-text':
      return join(
        node.region ? kvRaw('region', formatRect(node.region)) : '',
        kv('textVar', node.textVar),
        node.confidenceVar ? kv('confidenceVar', node.confidenceVar) : '',
        node.accurate ? kv('accurate', node.accurate) : '',
        node.lang ? kv('lang', node.lang) : '',
      );
    case 'focus-app':
      return join(
        kv('appName', node.appName),
        node.launchIfMissing ? kv('launchIfMissing', node.launchIfMissing) : '',
        node.resultVar ? kv('resultVar', node.resultVar) : '',
      );
    case 'call-flow':
      return join(
        kv('flowId', node.flowId ?? ''),
        node.argVars && node.argVars.length > 0
          ? kvRaw(
              'argVars',
              '[' + node.argVars.map((a) => `{from:${quote(a.from)},to:${quote(a.to)}}`).join(',') + ']',
            )
          : '',
        node.returnVars && node.returnVars.length > 0
          ? kvRaw(
              'returnVars',
              '[' + node.returnVars.map((v) => quote(v)).join(',') + ']',
            )
          : '',
      );
  }
}

function formatBranchArgs(node: BranchNode): string {
  const parts: string[] = [kv('condition', node.condition)];
  if (node.condition === 'pixel-color') {
    if (node.px !== undefined) parts.push(kv('px', node.px));
    if (node.py !== undefined) parts.push(kv('py', node.py));
    if (node.r !== undefined) parts.push(kv('r', node.r));
    if (node.g !== undefined) parts.push(kv('g', node.g));
    if (node.b !== undefined) parts.push(kv('b', node.b));
    if (node.tolerance !== undefined) parts.push(kv('tolerance', node.tolerance));
  } else if (node.condition === 'var-compare') {
    if (node.varName !== undefined) parts.push(kv('varName', node.varName));
    if (node.op !== undefined) parts.push(kv('op', node.op));
    if (node.compareTo !== undefined) parts.push(kv('compareTo', node.compareTo));
  } else if (node.condition === 'iteration') {
    if (node.every !== undefined) parts.push(kv('every', node.every));
  }
  return parts.filter(Boolean).join(', ');
}

function formatClickTarget(t: ClickTarget): string {
  switch (t.kind) {
    case 'fixed':
      return `point(${t.x}, ${t.y})`;
    case 'cursor':
      return `cursor()`;
    case 'last-match': {
      const args: string[] = [];
      if (t.offsetX !== undefined || t.offsetY !== undefined) {
        args.push(String(t.offsetX ?? 0));
        args.push(String(t.offsetY ?? 0));
      }
      return `lastMatch(${args.join(', ')})`;
    }
    case 'variable':
      return `variable(${quote(t.xVar)}, ${quote(t.yVar)})`;
  }
}

function formatRect(r: AutonomyRect): string {
  return `rect(${r.x}, ${r.y}, ${r.w}, ${r.h})`;
}

function formatSetVarSource(src: SetVarSource): string {
  switch (src.kind) {
    case 'literal-number':
      return `{ kind: "literal-number", value: ${src.value} }`;
    case 'literal-string':
      return `{ kind: "literal-string", value: ${quote(src.value)} }`;
    case 'random-int':
      return `{ kind: "random-int", min: ${src.min}, max: ${src.max} }`;
    default:
      return `{ kind: ${quote(src.kind)} }`;
  }
}

function formatTemplateRef(nodeId: string, tpl: AutonomyTemplate | null): string {
  if (!tpl) return 'null';
  return `$tpl_${nodeId.replace(/-/g, '_')}`;
}

function formatEdges(flow: AutonomyFlow, ordered: AutonomyNode[]): string[] {
  const lines: string[] = [];
  const visited = new Set<string>();
  const byFrom = new Map<string, AutonomyEdge[]>();
  for (const e of flow.edges) {
    const arr = byFrom.get(e.fromId) ?? [];
    arr.push(e);
    byFrom.set(e.fromId, arr);
  }
  const nameOf = (id: string): string => {
    const n = flow.nodes.find((x) => x.id === id);
    return n ? nodeDisplayName(n) : id.replace(/-/g, '_');
  };
  for (const node of ordered) {
    const outs = byFrom.get(node.id);
    if (!outs) continue;
    for (const edge of outs) {
      if (visited.has(edge.id)) continue;
      if (edge.fromPort === 'out') {
        const chain = [nameOf(edge.fromId)];
        let cur: AutonomyEdge | undefined = edge;
        while (cur && !visited.has(cur.id)) {
          visited.add(cur.id);
          chain.push(nameOf(cur.toId));
          const next = byFrom.get(cur.toId);
          if (next && next.length === 1 && next[0].fromPort === 'out') {
            cur = next[0];
          } else {
            cur = undefined;
          }
        }
        lines.push(chain.join(' -> '));
      } else {
        visited.add(edge.id);
        lines.push(
          `${nameOf(edge.fromId)}.${edge.fromPort} -> ${nameOf(edge.toId)}`,
        );
      }
    }
  }
  return lines;
}

// --- Value formatting helpers -----------------------------------------------

function kv(key: string, value: string | number | boolean): string {
  return `${key}: ${formatLiteral(value)}`;
}

// Emit a key/value where `raw` is already a DSL expression (e.g. `point(1,2)`,
// `rect(0,0,10,10)`, `[1, 2]`, `{...}`, `$tpl_foo`, `null`). Used to prevent
// double-quoting expression-shaped strings as if they were user text.
function kvRaw(key: string, raw: string): string {
  return `${key}: ${raw}`;
}

function formatLiteral(v: string | number | boolean): string {
  if (typeof v === 'string') {
    // Kind-like strings (contain hyphens or enum values) and free text both
    // round-trip through JSON quoting.
    return quote(v);
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

function formatArray(values: string[]): string {
  return `[${values.join(', ')}]`;
}

function join(...parts: string[]): string {
  return parts.filter((p) => p.length > 0).join(', ');
}

function quote(s: string): string {
  return JSON.stringify(s);
}

// --- Lexer -------------------------------------------------------------------

type TokenKind =
  | 'ident'
  | 'number'
  | 'string'
  | 'templateRef'
  | 'punct'
  | 'arrow'
  | 'eof';

interface Token {
  kind: TokenKind;
  value: string;
  line: number;
  col: number;
}

const PUNCT_CHARS = '(){}[],:=.@';

function tokenize(source: string): { tokens: Token[]; errors: ParseError[] } {
  const tokens: Token[] = [];
  const errors: ParseError[] = [];
  let i = 0;
  let line = 1;
  let col = 1;
  const push = (kind: TokenKind, value: string, startLine: number, startCol: number) => {
    tokens.push({ kind, value, line: startLine, col: startCol });
  };
  while (i < source.length) {
    const ch = source[i];
    // Newline
    if (ch === '\n') {
      i += 1;
      line += 1;
      col = 1;
      continue;
    }
    // Whitespace
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      i += 1;
      col += 1;
      continue;
    }
    // Line comment
    if (ch === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }
    const startLine = line;
    const startCol = col;
    // Arrow
    if (ch === '-' && source[i + 1] === '>') {
      push('arrow', '->', startLine, startCol);
      i += 2;
      col += 2;
      continue;
    }
    // Punctuation
    if (PUNCT_CHARS.includes(ch)) {
      push('punct', ch, startLine, startCol);
      i += 1;
      col += 1;
      continue;
    }
    // String literal
    if (ch === '"') {
      let j = i + 1;
      let value = '';
      let escaped = false;
      while (j < source.length) {
        const c = source[j];
        if (escaped) {
          switch (c) {
            case 'n':
              value += '\n';
              break;
            case 't':
              value += '\t';
              break;
            case 'r':
              value += '\r';
              break;
            case '\\':
              value += '\\';
              break;
            case '"':
              value += '"';
              break;
            default:
              value += c;
          }
          escaped = false;
          j += 1;
          continue;
        }
        if (c === '\\') {
          escaped = true;
          j += 1;
          continue;
        }
        if (c === '"') break;
        if (c === '\n') {
          errors.push({
            line: startLine,
            col: startCol,
            message: 'Unterminated string literal',
          });
          break;
        }
        value += c;
        j += 1;
      }
      if (j >= source.length || source[j] !== '"') {
        errors.push({
          line: startLine,
          col: startCol,
          message: 'Unterminated string literal',
        });
        // Best-effort: push what we have so parser keeps making progress.
        push('string', value, startLine, startCol);
        col += j - i;
        i = j;
        continue;
      }
      push('string', value, startLine, startCol);
      col += j - i + 1;
      i = j + 1;
      continue;
    }
    // Number (allow leading '-' only if not arrow, already handled)
    if (
      (ch >= '0' && ch <= '9') ||
      (ch === '-' && /[0-9]/.test(source[i + 1] ?? '')) ||
      (ch === '.' && /[0-9]/.test(source[i + 1] ?? ''))
    ) {
      let j = i;
      if (source[j] === '-') j += 1;
      while (j < source.length && /[0-9]/.test(source[j])) j += 1;
      if (source[j] === '.') {
        j += 1;
        while (j < source.length && /[0-9]/.test(source[j])) j += 1;
      }
      // Optional exponent.
      if (source[j] === 'e' || source[j] === 'E') {
        j += 1;
        if (source[j] === '+' || source[j] === '-') j += 1;
        while (j < source.length && /[0-9]/.test(source[j])) j += 1;
      }
      push('number', source.slice(i, j), startLine, startCol);
      col += j - i;
      i = j;
      continue;
    }
    // Template ref: $ident
    if (ch === '$') {
      let j = i + 1;
      while (j < source.length && /[A-Za-z0-9_]/.test(source[j])) j += 1;
      if (j === i + 1) {
        errors.push({
          line: startLine,
          col: startCol,
          message: 'Expected identifier after $',
        });
        i += 1;
        col += 1;
        continue;
      }
      push('templateRef', source.slice(i + 1, j), startLine, startCol);
      col += j - i;
      i = j;
      continue;
    }
    // Identifier (JS-style — underscore / letter start, alnum + _ body)
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < source.length && /[A-Za-z0-9_]/.test(source[j])) j += 1;
      push('ident', source.slice(i, j), startLine, startCol);
      col += j - i;
      i = j;
      continue;
    }
    // Unknown character — record and skip.
    errors.push({
      line: startLine,
      col: startCol,
      message: `Unexpected character ${JSON.stringify(ch)}`,
    });
    i += 1;
    col += 1;
  }
  push('eof', '', line, col);
  return { tokens, errors };
}

// --- Parser ------------------------------------------------------------------

type AstValue =
  | { type: 'number'; value: number }
  | { type: 'string'; value: string }
  | { type: 'boolean'; value: boolean }
  | { type: 'null' }
  | { type: 'identifier'; value: string }
  | { type: 'templateRef'; name: string }
  | { type: 'array'; items: AstValue[] }
  | { type: 'object'; entries: Array<{ key: string; value: AstValue }> }
  | { type: 'call'; name: string; args: AstValue[] };

interface AstNodeDecl {
  name: string;
  kind: AutonomyNodeKind;
  kindToken: Token;
  args: Array<{ key: string; value: AstValue; token: Token }>;
  pos: { x: number; y: number } | null;
  token: Token;
}

interface AstEdge {
  from: { name: string; port: AutonomyPort; token: Token };
  to: { name: string; token: Token };
}

interface AstProgram {
  flowName: string | null;
  maxSteps: number | null;
  nodes: AstNodeDecl[];
  edges: AstEdge[];
}

class Parser {
  private i = 0;
  errors: ParseError[] = [];
  constructor(private tokens: Token[]) {}

  private peek(offset = 0): Token {
    return this.tokens[this.i + offset] ?? this.tokens[this.tokens.length - 1];
  }

  private eat(): Token {
    const t = this.tokens[this.i];
    this.i += 1;
    return t;
  }

  private match(kind: TokenKind, value?: string): boolean {
    const t = this.peek();
    if (t.kind !== kind) return false;
    if (value !== undefined && t.value !== value) return false;
    return true;
  }

  private consume(kind: TokenKind, value?: string): Token | null {
    if (this.match(kind, value)) {
      return this.eat();
    }
    return null;
  }

  private expect(kind: TokenKind, value?: string, hint?: string): Token {
    const t = this.peek();
    if (this.match(kind, value)) return this.eat();
    const want = value !== undefined ? JSON.stringify(value) : kind;
    const got = t.value ? JSON.stringify(t.value) : t.kind;
    this.errors.push({
      line: t.line,
      col: t.col,
      message: hint ?? `Expected ${want}, got ${got}`,
    });
    return t;
  }

  private error(token: Token, message: string): void {
    this.errors.push({ line: token.line, col: token.col, message });
  }

  // Skip forward to the next line start or a recoverable boundary.
  private recover(): void {
    const startLine = this.peek().line;
    while (!this.match('eof')) {
      if (this.peek().line > startLine) return;
      this.eat();
    }
  }

  parseProgram(): AstProgram {
    const program: AstProgram = {
      flowName: null,
      maxSteps: null,
      nodes: [],
      edges: [],
    };
    if (this.match('ident', 'flow')) {
      this.parseFlowHeader(program);
    }
    while (!this.match('eof')) {
      try {
        this.parseStatement(program);
      } catch {
        this.recover();
      }
    }
    return program;
  }

  private parseFlowHeader(program: AstProgram): void {
    this.eat(); // 'flow'
    const nameTok = this.consume('string');
    if (nameTok) program.flowName = nameTok.value;
    this.expect('punct', '{', 'Expected "{" after flow header');
    while (!this.match('punct', '}') && !this.match('eof')) {
      const keyTok = this.consume('ident');
      if (!keyTok) {
        this.error(this.peek(), 'Expected key inside flow header');
        this.recover();
        break;
      }
      this.expect('punct', ':', 'Expected ":" after key');
      const value = this.parseValue();
      if (keyTok.value === 'maxSteps') {
        if (value.type === 'number') {
          program.maxSteps = Math.max(1, Math.round(value.value));
        } else {
          this.error(keyTok, 'maxSteps must be a number');
        }
      }
      this.consume('punct', ',');
    }
    this.expect('punct', '}', 'Expected "}" to close flow header');
  }

  private parseStatement(program: AstProgram): void {
    const first = this.peek();
    if (first.kind !== 'ident') {
      this.error(first, `Unexpected token ${JSON.stringify(first.value)}`);
      this.eat();
      return;
    }
    // Lookahead for decl (ident "=") vs edge (ident "->" or ident "." ident).
    const next = this.peek(1);
    if (next.kind === 'punct' && next.value === '=') {
      program.nodes.push(this.parseNodeDecl());
    } else {
      this.parseEdgeChain(program);
    }
  }

  private parseNodeDecl(): AstNodeDecl {
    const nameTok = this.eat(); // ident
    this.expect('punct', '=', 'Expected "=" after node name');
    const kindTok = this.expect('ident', undefined, 'Expected node kind');
    const kind = DSL_TO_KIND[kindTok.value];
    if (!kind) {
      this.error(kindTok, `Unknown node kind ${JSON.stringify(kindTok.value)}`);
    }
    this.expect('punct', '(', 'Expected "(" after kind');
    const args: AstNodeDecl['args'] = [];
    while (!this.match('punct', ')') && !this.match('eof')) {
      const keyTok = this.consume('ident');
      if (!keyTok) {
        this.error(this.peek(), 'Expected argument name');
        break;
      }
      this.expect('punct', ':', 'Expected ":" after argument name');
      const value = this.parseValue();
      args.push({ key: keyTok.value, value, token: keyTok });
      if (!this.consume('punct', ',')) break;
    }
    this.expect('punct', ')', 'Expected ")" to close arguments');
    // Optional layout hint: @ ( number , number )
    let pos: { x: number; y: number } | null = null;
    if (this.consume('punct', '@')) {
      this.expect('punct', '(', 'Expected "(" after @');
      const x = this.parseValue();
      this.expect('punct', ',', 'Expected "," in position hint');
      const y = this.parseValue();
      this.expect('punct', ')', 'Expected ")" to close position hint');
      if (x.type === 'number' && y.type === 'number') {
        pos = { x: x.value, y: y.value };
      } else {
        this.error(nameTok, 'Position hint must be numeric');
      }
    }
    return {
      name: nameTok.value,
      kind: kind ?? 'start',
      kindToken: kindTok,
      args,
      pos,
      token: nameTok,
    };
  }

  private parseEdgeChain(program: AstProgram): void {
    const first = this.parsePortRef();
    if (!this.match('arrow')) {
      this.error(this.peek(), 'Expected "->" in edge declaration');
      this.eat();
      return;
    }
    let fromRef = first;
    while (this.consume('arrow')) {
      const toTok = this.expect('ident', undefined, 'Expected target node name');
      if (toTok.kind !== 'ident') return;
      // Explicit port on target is not supported (targets have single input).
      if (this.match('punct', '.')) {
        const dotTok = this.eat();
        this.error(dotTok, 'Target ports are not supported; write the edge the other way');
        this.consume('ident');
      }
      program.edges.push({
        from: fromRef,
        to: { name: toTok.value, token: toTok },
      });
      // Chain continuation: reuse `toTok` as the next source with implicit `out`.
      fromRef = { name: toTok.value, port: 'out', token: toTok };
    }
  }

  private parsePortRef(): { name: string; port: AutonomyPort; token: Token } {
    const nameTok = this.expect('ident', undefined, 'Expected node name');
    let port: AutonomyPort = 'out';
    if (this.consume('punct', '.')) {
      const portTok = this.expect('ident', undefined, 'Expected port name after "."');
      port = normalizePort(portTok.value);
      if (!isValidPort(port)) {
        this.error(portTok, `Unknown port ${JSON.stringify(portTok.value)}`);
      }
    }
    return { name: nameTok.value, port, token: nameTok };
  }

  parseValue(): AstValue {
    const t = this.peek();
    if (t.kind === 'number') {
      this.eat();
      return { type: 'number', value: Number(t.value) };
    }
    if (t.kind === 'string') {
      this.eat();
      return { type: 'string', value: t.value };
    }
    if (t.kind === 'templateRef') {
      this.eat();
      return { type: 'templateRef', name: t.value };
    }
    if (t.kind === 'ident') {
      if (t.value === 'true') {
        this.eat();
        return { type: 'boolean', value: true };
      }
      if (t.value === 'false') {
        this.eat();
        return { type: 'boolean', value: false };
      }
      if (t.value === 'null') {
        this.eat();
        return { type: 'null' };
      }
      // Could be a helper call: `point(...)`, `rect(...)`, `cursor()`, etc.
      const next = this.peek(1);
      if (next.kind === 'punct' && next.value === '(') {
        this.eat();
        this.eat(); // (
        const args: AstValue[] = [];
        while (!this.match('punct', ')') && !this.match('eof')) {
          args.push(this.parseValue());
          if (!this.consume('punct', ',')) break;
        }
        this.expect('punct', ')', 'Expected ")" to close call');
        return { type: 'call', name: t.value, args };
      }
      this.eat();
      return { type: 'identifier', value: t.value };
    }
    if (t.kind === 'punct' && t.value === '[') {
      this.eat();
      const items: AstValue[] = [];
      while (!this.match('punct', ']') && !this.match('eof')) {
        items.push(this.parseValue());
        if (!this.consume('punct', ',')) break;
      }
      this.expect('punct', ']', 'Expected "]" to close array');
      return { type: 'array', items };
    }
    if (t.kind === 'punct' && t.value === '{') {
      this.eat();
      const entries: Array<{ key: string; value: AstValue }> = [];
      while (!this.match('punct', '}') && !this.match('eof')) {
        const keyTok =
          this.consume('ident') ?? this.consume('string');
        if (!keyTok) {
          this.error(this.peek(), 'Expected key inside object');
          break;
        }
        this.expect('punct', ':', 'Expected ":" after object key');
        const value = this.parseValue();
        entries.push({ key: keyTok.value, value });
        if (!this.consume('punct', ',')) break;
      }
      this.expect('punct', '}', 'Expected "}" to close object');
      return { type: 'object', entries };
    }
    this.error(t, `Unexpected token ${JSON.stringify(t.value)}`);
    this.eat();
    return { type: 'null' };
  }
}

const VALID_PORTS: AutonomyPort[] = [
  'out',
  'true',
  'false',
  'body',
  'done',
  'found',
  'timeout',
];

function normalizePort(raw: string): AutonomyPort {
  return raw as AutonomyPort;
}

function isValidPort(p: string): boolean {
  return (VALID_PORTS as string[]).includes(p);
}

// --- AST -> Flow -------------------------------------------------------------

function parseFlowImpl(
  source: string,
  prevFlow: AutonomyFlow | null | undefined,
): ParseResult {
  const { tokens, errors: lexErrors } = tokenize(source);
  const parser = new Parser(tokens);
  const program = parser.parseProgram();
  const errors: ParseError[] = [...lexErrors, ...parser.errors];

  // Build a name -> id map from the previous flow so existing nodes keep
  // their IDs (and therefore their edges / templates) across edits.
  const prevByName = new Map<string, AutonomyNode>();
  if (prevFlow) {
    for (const n of prevFlow.nodes) {
      prevByName.set(nodeDisplayName(n), n);
    }
  }

  // Collect node IDs in declaration order. Names that collide emit an error.
  const nameToId = new Map<string, string>();
  const nameToKind = new Map<string, AutonomyNodeKind>();
  const idToNode = new Map<string, AutonomyNode>();
  const usedIds = new Set<string>();

  for (const decl of program.nodes) {
    if (nameToId.has(decl.name)) {
      errors.push({
        line: decl.token.line,
        col: decl.token.col,
        message: `Duplicate node name ${JSON.stringify(decl.name)}`,
      });
      continue;
    }
    const kind = decl.kind;
    const prev = prevByName.get(decl.name);
    let id: string;
    if (prev && prev.kind === kind) {
      id = prev.id;
    } else {
      id = freshId(kind, usedIds);
    }
    usedIds.add(id);
    nameToId.set(decl.name, id);
    nameToKind.set(decl.name, kind);
    const node = buildNode(decl, id, prev && prev.kind === kind ? prev : null, errors, prevByName);
    if (node) idToNode.set(id, node);
  }

  // Build edges, preserving IDs when possible.
  const edges: AutonomyEdge[] = [];
  const portTaken = new Set<string>();
  const prevEdgeIdByKey = new Map<string, string>();
  if (prevFlow) {
    for (const e of prevFlow.edges) {
      prevEdgeIdByKey.set(`${e.fromId}|${e.fromPort}|${e.toId}`, e.id);
    }
  }
  for (const edge of program.edges) {
    const fromId = nameToId.get(edge.from.name);
    const toId = nameToId.get(edge.to.name);
    if (!fromId) {
      errors.push({
        line: edge.from.token.line,
        col: edge.from.token.col,
        message: `Unknown node ${JSON.stringify(edge.from.name)}`,
      });
      continue;
    }
    if (!toId) {
      errors.push({
        line: edge.to.token.line,
        col: edge.to.token.col,
        message: `Unknown node ${JSON.stringify(edge.to.name)}`,
      });
      continue;
    }
    if (fromId === toId) {
      errors.push({
        line: edge.from.token.line,
        col: edge.from.token.col,
        message: 'Self-edges are not allowed',
      });
      continue;
    }
    const fromKind = nameToKind.get(edge.from.name);
    if (fromKind) {
      const validPorts = portsForKind(fromKind);
      if (!validPorts.includes(edge.from.port)) {
        errors.push({
          line: edge.from.token.line,
          col: edge.from.token.col,
          message: `Node kind ${fromKind} has no port "${edge.from.port}" (valid: ${validPorts.join(', ') || 'none'})`,
        });
        continue;
      }
    }
    const portKey = `${fromId}|${edge.from.port}`;
    if (portTaken.has(portKey)) {
      errors.push({
        line: edge.from.token.line,
        col: edge.from.token.col,
        message: `Port ${edge.from.name}.${edge.from.port} is already wired`,
      });
      continue;
    }
    portTaken.add(portKey);
    const key = `${fromId}|${edge.from.port}|${toId}`;
    edges.push({
      id: prevEdgeIdByKey.get(key) ?? freshId('edge', usedIds),
      fromId,
      fromPort: edge.from.port,
      toId,
    });
  }

  // Drop edges whose source node was missing (buildNode failed) to avoid
  // dangling ids in the resulting graph.
  const nodes = Array.from(idToNode.values());
  const nodeIdSet = new Set(nodes.map((n) => n.id));
  const finalEdges = edges.filter(
    (e) => nodeIdSet.has(e.fromId) && nodeIdSet.has(e.toId),
  );

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const now = Date.now();
  const flow: AutonomyFlow = {
    id: prevFlow?.id ?? freshId('flow', usedIds),
    name: program.flowName ?? prevFlow?.name ?? 'Untitled flow',
    nodes,
    edges: finalEdges,
    createdAt: prevFlow?.createdAt ?? now,
    updatedAt: now,
    maxSteps: program.maxSteps ?? prevFlow?.maxSteps ?? 1000,
  };
  return { ok: true, flow };
}

export function parseFlow(
  source: string,
  prevFlow?: AutonomyFlow | null,
): ParseResult {
  try {
    return parseFlowImpl(source, prevFlow ?? null);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      errors: [{ line: 1, col: 1, message: `Internal parser error: ${message}` }],
    };
  }
}

function portsForKind(kind: AutonomyNodeKind): AutonomyPort[] {
  switch (kind) {
    case 'end':
    case 'stop-error':
      return [];
    case 'branch':
    case 'random-branch':
      return ['true', 'false'];
    case 'loop':
      return ['body', 'done'];
    case 'wait-until-found':
    case 'wait-until-gone':
      return ['found', 'timeout'];
    default:
      return ['out'];
  }
}

function freshId(prefix: string, used: Set<string>): string {
  const cryptoObj = (globalThis as unknown as { crypto?: { randomUUID?: () => string } })
    .crypto;
  const randChunk = (): string => {
    if (cryptoObj?.randomUUID) return cryptoObj.randomUUID().slice(0, 8);
    return Math.random().toString(36).slice(2, 10);
  };
  let candidate = `${prefix}_${randChunk()}`;
  while (used.has(candidate)) candidate = `${prefix}_${randChunk()}`;
  return candidate;
}

// --- Per-kind AST -> node conversion ----------------------------------------

function buildNode(
  decl: AstNodeDecl,
  id: string,
  prev: AutonomyNode | null,
  errors: ParseError[],
  prevByName: Map<string, AutonomyNode>,
): AutonomyNode | null {
  const args = argMap(decl.args);
  const pos = decl.pos ?? (prev ? { x: prev.x, y: prev.y } : defaultPos(decl));
  const ctx: BuildCtx = {
    decl,
    errors,
    args,
    prev,
    prevByName,
  };
  switch (decl.kind) {
    case 'start':
      return { id, kind: 'start', ...pos } as StartNode;
    case 'end':
      return { id, kind: 'end', ...pos } as EndNode;
    case 'wait':
      return {
        id,
        kind: 'wait',
        ...pos,
        ms: num(ctx, 'ms', 500, { min: 0 }),
      } as WaitNode;
    case 'random-wait':
      return {
        id,
        kind: 'random-wait',
        ...pos,
        minMs: num(ctx, 'minMs', 200, { min: 0 }),
        maxMs: num(ctx, 'maxMs', 800, { min: 0 }),
      } as RandomWaitNode;
    case 'click': {
      const target = readClickTarget(ctx, 'target') ?? { kind: 'cursor' as const };
      return {
        id,
        kind: 'click',
        ...pos,
        button: (str(ctx, 'button', 'left') as MouseButton),
        clickKind: (str(ctx, 'kind', 'single') as 'single' | 'double'),
        target,
      } as ClickNode;
    }
    case 'move': {
      const target = readClickTarget(ctx, 'target') ?? { kind: 'cursor' as const };
      const node: MoveNode = { id, kind: 'move', ...pos, target };
      if (args.has('style')) node.style = str(ctx, 'style', 'teleport') as MoveStyle;
      if (args.has('durationMs')) node.durationMs = num(ctx, 'durationMs', 400);
      if (args.has('curvature')) node.curvature = num(ctx, 'curvature', 0.3);
      if (args.has('jitter')) node.jitter = num(ctx, 'jitter', 0.2);
      return node;
    }
    case 'find': {
      return {
        id,
        kind: 'find',
        ...pos,
        template: readTemplate(ctx, 'template'),
        searchRegion: readRect(ctx, 'searchRegion') ?? null,
        minConfidence: readMinConfidence(ctx),
      } as FindNode;
    }
    case 'branch':
      return buildBranchNode(ctx, id, pos);
    case 'loop': {
      const node: LoopNode = {
        id,
        kind: 'loop',
        ...pos,
        count: num(ctx, 'count', 10, { min: 1 }),
      };
      if (args.has('indexVar')) node.indexVar = str(ctx, 'indexVar', 'i');
      return node;
    }
    case 'counter':
      return {
        id,
        kind: 'counter',
        ...pos,
        varName: str(ctx, 'varName', 'counter'),
        op: str(ctx, 'op', 'inc') as CounterOp,
        amount: num(ctx, 'amount', 1),
      } as CounterNode;
    case 'set-var': {
      const source = readSetVarSource(ctx, 'source') ?? {
        kind: 'literal-number' as const,
        value: 0,
      };
      return {
        id,
        kind: 'set-var',
        ...pos,
        varName: str(ctx, 'varName', 'x'),
        source,
      } as SetVarNode;
    }
    case 'random-branch':
      return {
        id,
        kind: 'random-branch',
        ...pos,
        probability: num(ctx, 'probability', 0.5, { min: 0, max: 1 }),
      } as RandomBranchNode;
    case 'stop-error':
      return {
        id,
        kind: 'stop-error',
        ...pos,
        message: str(ctx, 'message', 'stopped'),
      } as StopErrorNode;
    case 'log':
      return {
        id,
        kind: 'log',
        ...pos,
        message: str(ctx, 'message', ''),
        severity: str(ctx, 'severity', 'info') as LogSeverity,
      } as LogNode;
    case 'notify':
      return {
        id,
        kind: 'notify',
        ...pos,
        title: str(ctx, 'title', 'CLIK'),
        body: str(ctx, 'body', ''),
      } as NotifyNode;
    case 'wait-until-found':
      return {
        id,
        kind: 'wait-until-found',
        ...pos,
        template: readTemplate(ctx, 'template'),
        searchRegion: readRect(ctx, 'searchRegion') ?? null,
        minConfidence: readMinConfidence(ctx),
        intervalMs: num(ctx, 'intervalMs', 250, { min: 1 }),
        timeoutMs: num(ctx, 'timeoutMs', 5000, { min: 1 }),
      } as WaitUntilFoundNode;
    case 'wait-until-gone':
      return {
        id,
        kind: 'wait-until-gone',
        ...pos,
        template: readTemplate(ctx, 'template'),
        searchRegion: readRect(ctx, 'searchRegion') ?? null,
        minConfidence: readMinConfidence(ctx),
        intervalMs: num(ctx, 'intervalMs', 250, { min: 1 }),
        timeoutMs: num(ctx, 'timeoutMs', 5000, { min: 1 }),
      } as WaitUntilGoneNode;
    case 'scroll':
      return {
        id,
        kind: 'scroll',
        ...pos,
        dx: num(ctx, 'dx', 0),
        dy: num(ctx, 'dy', 0),
        target: readClickTarget(ctx, 'target') ?? { kind: 'cursor' as const },
      } as ScrollNode;
    case 'keypress':
      return {
        id,
        kind: 'keypress',
        ...pos,
        key: str(ctx, 'key', 'Enter'),
        modifiers: readModifiers(ctx, 'modifiers'),
      } as KeypressNode;
    case 'hotkey':
      return {
        id,
        kind: 'hotkey',
        ...pos,
        preset: str(ctx, 'preset', 'copy') as HotkeyPreset,
      } as HotkeyNode;
    case 'type-text':
      return {
        id,
        kind: 'type-text',
        ...pos,
        text: str(ctx, 'text', ''),
        perCharDelayMs: num(ctx, 'perCharDelayMs', 0, { min: 0 }),
      } as TypeTextNode;
    case 'drag':
      return {
        id,
        kind: 'drag',
        ...pos,
        button: str(ctx, 'button', 'left') as MouseButton,
        from: readClickTarget(ctx, 'from') ?? { kind: 'fixed' as const, x: 0, y: 0 },
        to: readClickTarget(ctx, 'to') ?? { kind: 'fixed' as const, x: 0, y: 0 },
        steps: num(ctx, 'steps', 24, { min: 1 }),
        stepDelayMs: num(ctx, 'stepDelayMs', 8, { min: 0 }),
      } as DragNode;
    case 'screenshot': {
      const node: ScreenshotNode = {
        id,
        kind: 'screenshot',
        ...pos,
        region: readRect(ctx, 'region') ?? null,
        toClipboard: bool(ctx, 'toClipboard', true),
        saveToDisk: bool(ctx, 'saveToDisk', false),
      };
      if (args.has('pathVar')) node.pathVar = str(ctx, 'pathVar', '');
      return node;
    }
    case 'read-text': {
      return {
        id,
        kind: 'read-text',
        ...pos,
        region: readRect(ctx, 'region') ?? null,
        textVar: str(ctx, 'textVar', 'text'),
        ...(args.has('confidenceVar') ? { confidenceVar: str(ctx, 'confidenceVar', '') } : {}),
        ...(args.has('accurate') ? { accurate: bool(ctx, 'accurate', false) } : {}),
        ...(args.has('lang') ? { lang: str(ctx, 'lang', 'en-US') } : {}),
      };
    }
    case 'focus-app': {
      return {
        id,
        kind: 'focus-app',
        ...pos,
        appName: str(ctx, 'appName', ''),
        ...(args.has('launchIfMissing') ? { launchIfMissing: bool(ctx, 'launchIfMissing', false) } : {}),
        ...(args.has('resultVar') ? { resultVar: str(ctx, 'resultVar', '') } : {}),
      };
    }
    case 'call-flow': {
      // `flowId` is a free-form string (empty string is treated as "not wired
      // yet"). argVars / returnVars round-trip as raw JSON-ish arrays.
      const raw = str(ctx, 'flowId', '');
      return {
        id,
        kind: 'call-flow',
        ...pos,
        flowId: raw ? raw : null,
      };
    }
  }
}

interface BuildCtx {
  decl: AstNodeDecl;
  errors: ParseError[];
  args: Map<string, { value: AstValue; token: Token }>;
  prev: AutonomyNode | null;
  prevByName: Map<string, AutonomyNode>;
}

function argMap(
  entries: AstNodeDecl['args'],
): Map<string, { value: AstValue; token: Token }> {
  const m = new Map<string, { value: AstValue; token: Token }>();
  for (const e of entries) m.set(e.key, { value: e.value, token: e.token });
  return m;
}

function defaultPos(_decl: AstNodeDecl): { x: number; y: number } {
  // Without a layout hint or prior node, drop new nodes at a safe origin; the
  // canvas can handle overlap but users should usually provide hints.
  return { x: 240, y: 240 };
}

function num(
  ctx: BuildCtx,
  key: string,
  fallback: number,
  opts?: { min?: number; max?: number },
): number {
  const entry = ctx.args.get(key);
  if (!entry) return fallback;
  if (entry.value.type !== 'number') {
    ctx.errors.push({
      line: entry.token.line,
      col: entry.token.col,
      message: `${key} must be a number`,
    });
    return fallback;
  }
  let v = entry.value.value;
  if (opts?.min !== undefined && v < opts.min) v = opts.min;
  if (opts?.max !== undefined && v > opts.max) v = opts.max;
  return v;
}

// Read `minConfidence` (0..1, higher = stricter). Falls back to a legacy
// `threshold` (0..1, lower = stricter) and flips it via 1 - threshold so old
// hand-written DSL keeps parsing with roughly the same strictness.
function readMinConfidence(ctx: BuildCtx): number {
  const entry = ctx.args.get('minConfidence');
  if (entry) return num(ctx, 'minConfidence', 0.85, { min: 0, max: 1 });
  const legacy = ctx.args.get('threshold');
  if (legacy && legacy.value.type === 'number') {
    const t = Math.max(0, Math.min(1, legacy.value.value));
    return 1 - t;
  }
  return 0.85;
}

function str(ctx: BuildCtx, key: string, fallback: string): string {
  const entry = ctx.args.get(key);
  if (!entry) return fallback;
  if (entry.value.type === 'string') return entry.value.value;
  if (entry.value.type === 'identifier') return entry.value.value;
  ctx.errors.push({
    line: entry.token.line,
    col: entry.token.col,
    message: `${key} must be a string`,
  });
  return fallback;
}

function bool(ctx: BuildCtx, key: string, fallback: boolean): boolean {
  const entry = ctx.args.get(key);
  if (!entry) return fallback;
  if (entry.value.type === 'boolean') return entry.value.value;
  ctx.errors.push({
    line: entry.token.line,
    col: entry.token.col,
    message: `${key} must be true or false`,
  });
  return fallback;
}

function readClickTarget(ctx: BuildCtx, key: string): ClickTarget | null {
  const entry = ctx.args.get(key);
  if (!entry) return null;
  const v = entry.value;
  if (v.type === 'call') {
    switch (v.name) {
      case 'point': {
        const x = expectNumArg(ctx, entry.token, v.args, 0, 'point');
        const y = expectNumArg(ctx, entry.token, v.args, 1, 'point');
        return { kind: 'fixed', x, y };
      }
      case 'cursor':
        return { kind: 'cursor' };
      case 'lastMatch': {
        const offsetX = v.args[0];
        const offsetY = v.args[1];
        const result: ClickTarget = { kind: 'last-match' };
        if (offsetX) {
          if (offsetX.type === 'number') result.offsetX = offsetX.value;
          else
            ctx.errors.push({
              line: entry.token.line,
              col: entry.token.col,
              message: 'lastMatch offsetX must be numeric',
            });
        }
        if (offsetY) {
          if (offsetY.type === 'number') result.offsetY = offsetY.value;
          else
            ctx.errors.push({
              line: entry.token.line,
              col: entry.token.col,
              message: 'lastMatch offsetY must be numeric',
            });
        }
        return result;
      }
      case 'variable': {
        const xVar = asString(v.args[0]);
        const yVar = asString(v.args[1]);
        if (xVar === null || yVar === null) {
          ctx.errors.push({
            line: entry.token.line,
            col: entry.token.col,
            message: 'variable() takes two string identifiers',
          });
          return null;
        }
        return { kind: 'variable', xVar, yVar };
      }
      default:
        ctx.errors.push({
          line: entry.token.line,
          col: entry.token.col,
          message: `Unknown target constructor ${v.name}(...)`,
        });
        return null;
    }
  }
  if (v.type === 'object') {
    // Allow raw object syntax as an escape hatch.
    const obj = objectToRecord(v);
    const kind = obj['kind'];
    if (typeof kind === 'string') {
      return obj as unknown as ClickTarget;
    }
  }
  ctx.errors.push({
    line: entry.token.line,
    col: entry.token.col,
    message: `${key} must be a target expression (point/cursor/lastMatch/variable)`,
  });
  return null;
}

function readRect(ctx: BuildCtx, key: string): AutonomyRect | null {
  const entry = ctx.args.get(key);
  if (!entry) return null;
  const v = entry.value;
  if (v.type === 'null') return null;
  if (v.type === 'call' && v.name === 'rect') {
    return {
      x: expectNumArg(ctx, entry.token, v.args, 0, 'rect'),
      y: expectNumArg(ctx, entry.token, v.args, 1, 'rect'),
      w: expectNumArg(ctx, entry.token, v.args, 2, 'rect'),
      h: expectNumArg(ctx, entry.token, v.args, 3, 'rect'),
    };
  }
  if (v.type === 'object') {
    const o = objectToRecord(v);
    if (
      typeof o.x === 'number' &&
      typeof o.y === 'number' &&
      typeof o.w === 'number' &&
      typeof o.h === 'number'
    ) {
      return { x: o.x, y: o.y, w: o.w, h: o.h };
    }
  }
  ctx.errors.push({
    line: entry.token.line,
    col: entry.token.col,
    message: `${key} must be rect(x, y, w, h) or null`,
  });
  return null;
}

function readTemplate(ctx: BuildCtx, key: string): AutonomyTemplate | null {
  const entry = ctx.args.get(key);
  if (!entry) return (ctx.prev && 'template' in ctx.prev ? (ctx.prev.template as AutonomyTemplate | null) : null);
  const v = entry.value;
  if (v.type === 'null') return null;
  if (v.type === 'templateRef') {
    // Template refs look like `tpl_<sanitizedId>`; strip the `tpl_` prefix and
    // un-sanitize underscores back to hyphens, then look the node up directly.
    const after = v.name.replace(/^tpl_/, '');
    // Try a few possible original ids by preferring longer hyphen-safe matches.
    const candidates = restoreHyphenCandidates(after);
    for (const candidate of candidates) {
      for (const [, node] of ctx.prevByName) {
        if (node.id === candidate && 'template' in node) {
          return (node as FindNode).template;
        }
      }
    }
    // Also try matching the current decl name directly (template followed this node).
    const directPrev = ctx.prevByName.get(ctx.decl.name);
    if (directPrev && 'template' in directPrev) {
      return (directPrev as FindNode).template;
    }
    return null;
  }
  ctx.errors.push({
    line: entry.token.line,
    col: entry.token.col,
    message: `${key} must be $tpl_* or null (inline templates are not supported)`,
  });
  return null;
}

function readSetVarSource(ctx: BuildCtx, key: string): SetVarSource | null {
  const entry = ctx.args.get(key);
  if (!entry) return null;
  const v = entry.value;
  if (v.type !== 'object') {
    ctx.errors.push({
      line: entry.token.line,
      col: entry.token.col,
      message: `${key} must be an object`,
    });
    return null;
  }
  const o = objectToRecord(v);
  const kind = o.kind;
  if (typeof kind !== 'string') {
    ctx.errors.push({
      line: entry.token.line,
      col: entry.token.col,
      message: `${key} is missing a "kind" field`,
    });
    return null;
  }
  switch (kind) {
    case 'literal-number':
      return { kind: 'literal-number', value: numField(o.value, 0) };
    case 'literal-string':
      return { kind: 'literal-string', value: strField(o.value, '') };
    case 'random-int':
      return {
        kind: 'random-int',
        min: numField(o.min, 0),
        max: numField(o.max, 100),
      };
    case 'last-found-score':
      return { kind: 'last-found-confidence' };
    case 'last-found-x':
    case 'last-found-y':
    case 'last-found-confidence':
    case 'elapsed-ms':
    case 'iterations':
    case 'cursor-x':
    case 'cursor-y':
      return { kind } as SetVarSource;
    default:
      ctx.errors.push({
        line: entry.token.line,
        col: entry.token.col,
        message: `Unknown set-var source kind ${JSON.stringify(kind)}`,
      });
      return null;
  }
}

function readModifiers(ctx: BuildCtx, key: string): ModifierKey[] {
  const entry = ctx.args.get(key);
  if (!entry) return [];
  const v = entry.value;
  if (v.type !== 'array') {
    ctx.errors.push({
      line: entry.token.line,
      col: entry.token.col,
      message: `${key} must be an array of modifier strings`,
    });
    return [];
  }
  const out: ModifierKey[] = [];
  for (const item of v.items) {
    const s = asString(item);
    if (s === 'cmd' || s === 'ctrl' || s === 'shift' || s === 'opt') {
      out.push(s);
    } else if (s !== null) {
      ctx.errors.push({
        line: entry.token.line,
        col: entry.token.col,
        message: `Unknown modifier ${JSON.stringify(s)}`,
      });
    }
  }
  return out;
}

function buildBranchNode(
  ctx: BuildCtx,
  id: string,
  pos: { x: number; y: number },
): BranchNode {
  const condition = (str(ctx, 'condition', 'last-found') as BranchCondition);
  const node: BranchNode = { id, kind: 'branch', ...pos, condition };
  if (condition === 'pixel-color') {
    if (ctx.args.has('px')) node.px = num(ctx, 'px', 0);
    if (ctx.args.has('py')) node.py = num(ctx, 'py', 0);
    if (ctx.args.has('r')) node.r = num(ctx, 'r', 0);
    if (ctx.args.has('g')) node.g = num(ctx, 'g', 0);
    if (ctx.args.has('b')) node.b = num(ctx, 'b', 0);
    if (ctx.args.has('tolerance')) node.tolerance = num(ctx, 'tolerance', 0);
  } else if (condition === 'var-compare') {
    if (ctx.args.has('varName')) node.varName = str(ctx, 'varName', '');
    if (ctx.args.has('op')) node.op = str(ctx, 'op', '==') as VarCompareOp;
    if (ctx.args.has('compareTo')) node.compareTo = str(ctx, 'compareTo', '');
  } else if (condition === 'iteration') {
    if (ctx.args.has('every')) node.every = num(ctx, 'every', 2, { min: 1 });
  }
  return node;
}

// --- Small value helpers -----------------------------------------------------

function objectToRecord(v: Extract<AstValue, { type: 'object' }>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const { key, value } of v.entries) {
    out[key] = astValueToPlain(value);
  }
  return out;
}

function astValueToPlain(v: AstValue): unknown {
  switch (v.type) {
    case 'number':
      return v.value;
    case 'string':
      return v.value;
    case 'boolean':
      return v.value;
    case 'null':
      return null;
    case 'identifier':
      return v.value;
    case 'templateRef':
      return { $tpl: v.name };
    case 'array':
      return v.items.map(astValueToPlain);
    case 'object': {
      const o: Record<string, unknown> = {};
      for (const { key, value } of v.entries) o[key] = astValueToPlain(value);
      return o;
    }
    case 'call':
      return { $call: v.name, args: v.args.map(astValueToPlain) };
  }
}

function asString(v: AstValue | undefined): string | null {
  if (!v) return null;
  if (v.type === 'string') return v.value;
  if (v.type === 'identifier') return v.value;
  return null;
}

function numField(v: unknown, fallback: number): number {
  return typeof v === 'number' ? v : fallback;
}

function strField(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

function expectNumArg(
  ctx: BuildCtx,
  token: Token,
  args: AstValue[],
  index: number,
  constructor: string,
): number {
  const v = args[index];
  if (!v || v.type !== 'number') {
    ctx.errors.push({
      line: token.line,
      col: token.col,
      message: `${constructor}() argument ${index + 1} must be a number`,
    });
    return 0;
  }
  return v.value;
}

// Template refs use sanitized IDs (hyphens -> underscores); when looking up a
// previous node we need to try possible hyphenations. The simple heuristic:
// return the verbatim string first, then swap underscores that align with
// known kind prefixes back to hyphens.
function restoreHyphenCandidates(sanitized: string): string[] {
  const candidates: string[] = [sanitized];
  const hyphenKinds = Object.keys(KIND_TO_DSL).filter((k) => k.includes('-'));
  for (const kind of hyphenKinds) {
    const us = kind.replace(/-/g, '_');
    if (sanitized.startsWith(us + '_')) {
      candidates.push(kind + sanitized.slice(us.length));
    }
  }
  return candidates;
}
