import { useMemo } from 'react';
import type {
  AutonomyFlow,
  AutonomyNode,
  AutonomyPort,
  PortSpec,
} from '../../../../shared/autonomy';
import { outputPortsFor } from '../../../../shared/autonomy';
import { useStore } from '../../store';
import { describeNode } from './describe';

interface TimelineProps {
  flow: AutonomyFlow;
  runningNodeId: string | null;
}

// A linearized view of the graph. We walk from Start following edges, keeping a
// visited set along the current branch to detect loops. Each branch-node's
// successors get their own copy of `visited` so the two arms don't poison each
// other's cycle detection.
type Track =
  | { type: 'linear'; node: AutonomyNode; next: Track }
  | {
      type: 'split';
      node: AutonomyNode;
      arms: Array<{ port: AutonomyPort; label: string; accent: 'default' | 'danger'; track: Track }>;
    }
  | { type: 'end'; node: AutonomyNode }
  | { type: 'loop'; targetId: string; targetLabel: string }
  | { type: 'dead-end'; fromId: string; fromPort: AutonomyPort }
  | { type: 'missing'; targetId: string }
  | { type: 'no-start' };

export function Timeline({ flow, runningNodeId }: TimelineProps) {
  const setSelectedNode = useStore((s) => s.setSelectedNode);
  const selectedNodeId = useStore((s) => s.selectedNodeId);

  const track = useMemo(() => buildTrack(flow), [flow]);

  return (
    <div
      className="h-full overflow-y-auto px-8 py-6"
      style={{ background: 'var(--color-ink)' }}
    >
      <div className="label-muted mb-4">Timeline · linearized flow from Start</div>
      <div className="flex flex-col gap-1">
        <TrackView
          track={track}
          depth={0}
          runningNodeId={runningNodeId}
          selectedNodeId={selectedNodeId}
          onSelect={setSelectedNode}
        />
      </div>
    </div>
  );
}

function TrackView({
  track,
  depth,
  runningNodeId,
  selectedNodeId,
  onSelect,
}: {
  track: Track;
  depth: number;
  runningNodeId: string | null;
  selectedNodeId: string | null;
  onSelect: (id: string) => void;
}) {
  if (track.type === 'linear') {
    return (
      <>
        <NodeRow
          node={track.node}
          depth={depth}
          running={runningNodeId === track.node.id}
          selected={selectedNodeId === track.node.id}
          onSelect={() => onSelect(track.node.id)}
        />
        <TrackView
          track={track.next}
          depth={depth}
          runningNodeId={runningNodeId}
          selectedNodeId={selectedNodeId}
          onSelect={onSelect}
        />
      </>
    );
  }

  if (track.type === 'split') {
    return (
      <>
        <NodeRow
          node={track.node}
          depth={depth}
          running={runningNodeId === track.node.id}
          selected={selectedNodeId === track.node.id}
          onSelect={() => onSelect(track.node.id)}
        />
        {track.arms.map((arm) => (
          <BranchGroup
            key={arm.port}
            label={arm.label.toUpperCase()}
            accent={arm.accent === 'danger' ? 'var(--color-danger)' : 'var(--color-accent)'}
            depth={depth}
          >
            <TrackView
              track={arm.track}
              depth={depth + 1}
              runningNodeId={runningNodeId}
              selectedNodeId={selectedNodeId}
              onSelect={onSelect}
            />
          </BranchGroup>
        ))}
      </>
    );
  }

  if (track.type === 'end') {
    return (
      <NodeRow
        node={track.node}
        depth={depth}
        running={runningNodeId === track.node.id}
        selected={selectedNodeId === track.node.id}
        onSelect={() => onSelect(track.node.id)}
      />
    );
  }

  if (track.type === 'loop') {
    return (
      <TerminalRow
        depth={depth}
        glyph="↻"
        label={`Loop to "${track.targetLabel}"`}
        tone="muted"
        onClick={() => onSelect(track.targetId)}
      />
    );
  }

  if (track.type === 'dead-end') {
    return (
      <TerminalRow
        depth={depth}
        glyph="⊘"
        label={`Dead end · ${track.fromPort} port not connected`}
        tone="danger"
      />
    );
  }

  if (track.type === 'missing') {
    return (
      <TerminalRow
        depth={depth}
        glyph="?"
        label={`Missing node (${track.targetId})`}
        tone="danger"
      />
    );
  }

  return (
    <TerminalRow
      depth={0}
      glyph="!"
      label="Flow has no Start node"
      tone="danger"
    />
  );
}

function NodeRow({
  node,
  depth,
  running,
  selected,
  onSelect,
}: {
  node: AutonomyNode;
  depth: number;
  running: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const bg = running
    ? 'color-mix(in srgb, var(--color-accent) 22%, var(--color-ink-2))'
    : selected
      ? 'var(--color-ink-3)'
      : 'var(--color-ink-2)';
  const stroke = running
    ? 'var(--color-accent)'
    : selected
      ? 'var(--color-accent)'
      : 'var(--color-line)';

  return (
    <div className="flex items-stretch" style={{ paddingLeft: depth * 24 }}>
      <IndentRail depth={depth} />
      <button
        type="button"
        onClick={onSelect}
        className="flex-1 flex items-center gap-3 px-3 py-2 text-left"
        style={{
          background: bg,
          border: `1px solid ${stroke}`,
          color: 'var(--color-cream)',
        }}
      >
        <span
          className="font-mono text-[9px] tracking-[0.18em] uppercase w-14 shrink-0"
          style={{ color: 'var(--color-muted)' }}
        >
          {node.kind}
        </span>
        <span className="font-mono text-[12px] flex-1">{describeNode(node)}</span>
        {running && (
          <span
            className="inline-block w-[7px] h-[7px] shrink-0"
            style={{
              background: 'var(--color-accent)',
              boxShadow:
                '0 0 0 3px color-mix(in srgb, var(--color-accent) 22%, transparent)',
            }}
            aria-label="Running"
          />
        )}
      </button>
    </div>
  );
}

function TerminalRow({
  depth,
  glyph,
  label,
  tone,
  onClick,
}: {
  depth: number;
  glyph: string;
  label: string;
  tone: 'muted' | 'danger';
  onClick?: () => void;
}) {
  const color = tone === 'danger' ? 'var(--color-danger)' : 'var(--color-cream-dim)';
  return (
    <div className="flex items-stretch" style={{ paddingLeft: depth * 24 }}>
      <IndentRail depth={depth} />
      <div
        onClick={onClick}
        className="flex-1 flex items-center gap-3 px-3 py-2"
        style={{
          border: `1px dashed ${color}`,
          color,
          cursor: onClick ? 'pointer' : 'default',
        }}
      >
        <span className="font-mono text-[14px] w-14 shrink-0 text-center">{glyph}</span>
        <span className="font-mono text-[12px]">{label}</span>
      </div>
    </div>
  );
}

function BranchGroup({
  label,
  accent,
  depth,
  children,
}: {
  label: string;
  accent: string;
  depth: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1" style={{ paddingLeft: depth * 24 }}>
      <div
        className="flex items-center gap-2 pl-6 pt-1 pb-0.5"
        style={{ color: accent }}
      >
        <span
          className="inline-block w-4"
          style={{ borderTop: `1px solid ${accent}` }}
        />
        <span className="font-mono text-[9px] tracking-[0.22em]">{label}</span>
      </div>
      {children}
    </div>
  );
}

// Leading rail — a thin vertical line so rows at the same depth read as a
// connected track. Pure visual sugar; no interaction.
function IndentRail({ depth }: { depth: number }) {
  if (depth === 0) return null;
  return (
    <span
      aria-hidden
      className="inline-block w-[1px] shrink-0 mr-3"
      style={{ background: 'var(--color-line)' }}
    />
  );
}

function buildTrack(flow: AutonomyFlow): Track {
  const start = flow.nodes.find((n) => n.kind === 'start');
  if (!start) return { type: 'no-start' };
  return walk(start, flow, new Set());
}

function walk(node: AutonomyNode, flow: AutonomyFlow, visited: Set<string>): Track {
  if (visited.has(node.id)) {
    return { type: 'loop', targetId: node.id, targetLabel: describeNode(node) };
  }
  const nextVisited = new Set(visited);
  nextVisited.add(node.id);

  const ports = outputPortsFor(node.kind);

  // Terminal nodes (end, stop-error) have no output ports.
  if (ports.length === 0) return { type: 'end', node };

  // Single-port nodes render as a linear step.
  if (ports.length === 1) {
    return {
      type: 'linear',
      node,
      next: follow(node, ports[0].id, flow, nextVisited),
    };
  }

  // Multi-port nodes (branch, random-branch, loop, wait-until-*) fan out.
  return {
    type: 'split',
    node,
    arms: ports.map((p: PortSpec) => ({
      port: p.id,
      label: armLabel(node, p),
      accent: p.accent ?? 'default',
      track: follow(node, p.id, flow, new Set(nextVisited)),
    })),
  };
}

function armLabel(node: AutonomyNode, port: PortSpec): string {
  if (node.kind === 'branch' || node.kind === 'random-branch') {
    if (port.id === 'true') return 'true';
    if (port.id === 'false') return 'false';
  }
  if (node.kind === 'loop') {
    if (port.id === 'body') return 'body';
    if (port.id === 'done') return 'done';
  }
  if (node.kind === 'wait-until-found' || node.kind === 'wait-until-gone') {
    if (port.id === 'found') return node.kind === 'wait-until-found' ? 'appears' : 'gone';
    if (port.id === 'timeout') return 'timeout';
  }
  return port.label || port.id;
}

function follow(
  from: AutonomyNode,
  port: AutonomyPort,
  flow: AutonomyFlow,
  visited: Set<string>,
): Track {
  const edge = flow.edges.find((e) => e.fromId === from.id && e.fromPort === port);
  if (!edge) return { type: 'dead-end', fromId: from.id, fromPort: port };
  const next = flow.nodes.find((n) => n.id === edge.toId);
  if (!next) return { type: 'missing', targetId: edge.toId };
  return walk(next, flow, visited);
}
