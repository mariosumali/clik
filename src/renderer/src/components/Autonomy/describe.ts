import type { AutonomyNode, ClickTarget } from '../../../../shared/autonomy';

export function describeNode(node: AutonomyNode): string {
  switch (node.kind) {
    case 'start':
      return 'Start';
    case 'end':
      return 'End';
    case 'wait':
      return `Wait ${node.ms} ms`;
    case 'random-wait':
      return `Rand wait ${node.minMs}–${node.maxMs} ms`;
    case 'loop':
      return node.indexVar
        ? `Loop ×${node.count} → {${node.indexVar}}`
        : `Loop ×${node.count}`;
    case 'counter':
      return `${node.op} ${node.varName}${
        node.op === 'inc' || node.op === 'dec' || node.op === 'set'
          ? ` ${node.amount}`
          : ''
      }`;
    case 'set-var':
      return `${node.varName} = ${describeSetVarSource(node.source)}`;
    case 'log':
      return `log[${node.severity}] "${ellipsize(node.message, 20)}"`;
    case 'notify':
      return `Notify "${ellipsize(node.title || node.body, 20)}"`;
    case 'stop-error':
      return `Stop: "${ellipsize(node.message, 18)}"`;
    case 'random-branch':
      return `Random ${(node.probability * 100).toFixed(0)}% → T`;
    case 'click':
      return `${node.clickKind} · ${node.button} · ${formatTarget(node.target)}`;
    case 'move': {
      const style = node.style ?? 'teleport';
      const suffix =
        style === 'teleport' ? 'teleport' : `${style} · ${node.durationMs ?? 400}ms`;
      return `Move · ${formatTarget(node.target)} · ${suffix}`;
    }
    case 'drag':
      return `Drag · ${formatTarget(node.from)} → ${formatTarget(node.to)}`;
    case 'scroll':
      return `Scroll dx${node.dx} dy${node.dy} @ ${formatTarget(node.target)}`;
    case 'keypress': {
      const mods = node.modifiers.length ? `${node.modifiers.join('+')}+` : '';
      return `Press ${mods}${node.key}`;
    }
    case 'hotkey':
      return `Hotkey · ${node.preset}`;
    case 'type-text':
      return `Type "${ellipsize(node.text, 18)}"`;
    case 'screenshot':
      return node.toClipboard ? 'Screenshot → clipboard' : 'Screenshot';
    case 'find':
      return node.template
        ? `Find (≥ ${node.minConfidence.toFixed(2)})`
        : 'Find · no template';
    case 'wait-until-found':
      return node.template
        ? `Wait-found ${Math.round(node.timeoutMs / 1000)}s`
        : 'Wait-found · no template';
    case 'wait-until-gone':
      return node.template
        ? `Wait-gone ${Math.round(node.timeoutMs / 1000)}s`
        : 'Wait-gone · no template';
    case 'branch': {
      switch (node.condition) {
        case 'last-found':
          return 'If last match found';
        case 'pixel-color':
          return 'If pixel matches';
        case 'var-compare':
          return `If ${node.varName ?? '?'} ${node.op ?? '=='} ${node.compareTo ?? ''}`;
        case 'iteration':
          return `Every ${node.every ?? 1} iter`;
      }
      return 'Branch';
    }
    case 'read-text':
      return `Read text → ${node.textVar}`;
    case 'focus-app':
      return `Focus ${ellipsize(node.appName || '?', 18)}`;
    case 'call-flow':
      return node.flowId ? `Call flow ${ellipsize(node.flowId, 14)}` : 'Call flow · none';
  }
}

export function formatTarget(t: ClickTarget): string {
  if (t.kind === 'fixed') return `${t.x}, ${t.y}`;
  if (t.kind === 'cursor') return 'cursor';
  if (t.kind === 'last-match') {
    const hasOffset = (t.offsetX ?? 0) !== 0 || (t.offsetY ?? 0) !== 0;
    return hasOffset
      ? `last ± (${t.offsetX ?? 0}, ${t.offsetY ?? 0})`
      : 'last match';
  }
  return `{${t.xVar}}, {${t.yVar}}`;
}

function describeSetVarSource(src: import('../../../../shared/autonomy').SetVarSource): string {
  switch (src.kind) {
    case 'literal-number':
      return String(src.value);
    case 'literal-string':
      return `"${ellipsize(src.value, 14)}"`;
    case 'last-found-x':
      return 'match.x';
    case 'last-found-y':
      return 'match.y';
    case 'last-found-confidence':
      return 'match.confidence';
    case 'elapsed-ms':
      return 'elapsedMs';
    case 'iterations':
      return 'iterations';
    case 'cursor-x':
      return 'cursor.x';
    case 'cursor-y':
      return 'cursor.y';
    case 'random-int':
      return `rand[${src.min}–${src.max}]`;
  }
}

function ellipsize(s: string, n: number): string {
  if (!s) return '';
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}
