import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AutonomyEdge,
  AutonomyFlow,
  AutonomyNode,
  AutonomyPort,
  PortSpec,
} from '../../../../shared/autonomy';
import { outputPortsFor } from '../../../../shared/autonomy';
import { useStore } from '../../store';
import { describeNode } from './describe';

interface NodeCanvasProps {
  flow: AutonomyFlow;
  runningNodeId: string | null;
}

// Visual sizes in SVG user-space; the canvas renders at 1:1 pixel scale.
const NODE_W = 168;
const NODE_H = 64;
const PORT_R = 5;

export function NodeCanvas({ flow, runningNodeId }: NodeCanvasProps) {
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const setSelectedNode = useStore((s) => s.setSelectedNode);
  const moveAutonomyNode = useStore((s) => s.moveAutonomyNode);
  const removeAutonomyNode = useStore((s) => s.removeAutonomyNode);
  const addAutonomyEdge = useStore((s) => s.addAutonomyEdge);
  const removeAutonomyEdge = useStore((s) => s.removeAutonomyEdge);
  const beginAutonomyDrag = useStore((s) => s.beginAutonomyDrag);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<{
    id: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [pending, setPending] = useState<{
    fromId: string;
    fromPort: AutonomyPort;
    cursorX: number;
    cursorY: number;
  } | null>(null);

  // Delete selected node on Delete / Backspace when the canvas has focus
  // (i.e. user is not typing in an input).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
      if (!selectedNodeId) return;
      const node = flow.nodes.find((n) => n.id === selectedNodeId);
      if (!node || node.kind === 'start') return;
      e.preventDefault();
      removeAutonomyNode(selectedNodeId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedNodeId, flow.nodes, removeAutonomyNode]);

  const toSvg = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: clientX, y: clientY };
    const rect = svg.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  useEffect(() => {
    if (!drag && !pending) return;
    const onMove = (e: MouseEvent) => {
      const p = toSvg(e.clientX, e.clientY);
      if (drag) {
        moveAutonomyNode(drag.id, Math.round(p.x - drag.offsetX), Math.round(p.y - drag.offsetY));
      }
      if (pending) {
        setPending({ ...pending, cursorX: p.x, cursorY: p.y });
      }
    };
    const onUp = () => {
      if (drag) setDrag(null);
      // If the user released over nothing, cancel the pending edge.
      if (pending) setPending(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [drag, pending, moveAutonomyNode, toSvg]);

  const startDrag = (e: React.MouseEvent, node: AutonomyNode) => {
    if (e.button !== 0) return;
    const p = toSvg(e.clientX, e.clientY);
    // Snapshot once before the drag begins; subsequent mousemoves mutate in
    // place so the whole drag is a single undo step.
    beginAutonomyDrag(node.id);
    setDrag({ id: node.id, offsetX: p.x - node.x, offsetY: p.y - node.y });
    setSelectedNode(node.id);
  };

  const beginEdge = (e: React.MouseEvent, node: AutonomyNode, port: AutonomyPort) => {
    e.stopPropagation();
    const p = toSvg(e.clientX, e.clientY);
    setPending({ fromId: node.id, fromPort: port, cursorX: p.x, cursorY: p.y });
  };

  const completeEdge = (e: React.MouseEvent, toNode: AutonomyNode) => {
    if (!pending) return;
    e.stopPropagation();
    if (pending.fromId === toNode.id) {
      setPending(null);
      return;
    }
    addAutonomyEdge(pending.fromId, pending.fromPort, toNode.id);
    setPending(null);
  };

  // Remember the output anchor for a given (nodeId, port) so edges land on the
  // exact same port dot they started from.
  const outputAnchor = useCallback((node: AutonomyNode, port: AutonomyPort) => {
    const ports = outputPortsFor(node.kind);
    const idx = ports.findIndex((p) => p.id === port);
    if (idx < 0 || ports.length === 0) {
      return { x: node.x + NODE_W, y: node.y + NODE_H / 2 };
    }
    return { x: node.x + NODE_W, y: node.y + portY(ports.length, idx) };
  }, []);

  const inputAnchor = (node: AutonomyNode) => ({
    x: node.x,
    y: node.y + NODE_H / 2,
  });

  const paths = useMemo(() => {
    return flow.edges.map((edge) => {
      const from = flow.nodes.find((n) => n.id === edge.fromId);
      const to = flow.nodes.find((n) => n.id === edge.toId);
      if (!from || !to) return null;
      const start = outputAnchor(from, edge.fromPort);
      const end = inputAnchor(to);
      return { id: edge.id, d: curve(start, end), edge };
    });
  }, [flow.edges, flow.nodes, outputAnchor]);

  return (
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      onMouseDown={() => {
        setSelectedNode(null);
        if (pending) setPending(null);
      }}
      style={{
        display: 'block',
        background:
          'radial-gradient(circle, rgba(239,234,221,0.06) 1px, transparent 1px) 0 0 / 20px 20px, var(--color-ink)',
        userSelect: 'none',
      }}
    >
      {paths.map(
        (p) =>
          p && (
            <EdgePath
              key={p.id}
              d={p.d}
              edge={p.edge}
              onRemove={() => removeAutonomyEdge(p.edge.id)}
            />
          ),
      )}

      {pending && (
        <path
          d={curve(
            outputAnchor(
              flow.nodes.find((n) => n.id === pending.fromId)!,
              pending.fromPort,
            ),
            { x: pending.cursorX, y: pending.cursorY },
          )}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={1.4}
          strokeDasharray="4 4"
          pointerEvents="none"
        />
      )}

      {flow.nodes.map((node) => (
        <NodeShape
          key={node.id}
          node={node}
          selected={selectedNodeId === node.id}
          running={runningNodeId === node.id}
          pending={pending !== null}
          onMouseDown={(e) => startDrag(e, node)}
          onPortDown={(e, port) => beginEdge(e, node, port)}
          onPortUp={(e) => completeEdge(e, node)}
        />
      ))}
    </svg>
  );
}

interface NodeShapeProps {
  node: AutonomyNode;
  selected: boolean;
  running: boolean;
  pending: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onPortDown: (e: React.MouseEvent, port: AutonomyPort) => void;
  onPortUp: (e: React.MouseEvent) => void;
}

function NodeShape({
  node,
  selected,
  running,
  pending,
  onMouseDown,
  onPortDown,
  onPortUp,
}: NodeShapeProps) {
  const hasInput = node.kind !== 'start';
  const ports: PortSpec[] = outputPortsFor(node.kind);

  const bg = running ? 'color-mix(in srgb, var(--color-accent) 22%, var(--color-ink-2))' : 'var(--color-ink-2)';
  const stroke = selected
    ? 'var(--color-accent)'
    : running
      ? 'var(--color-accent)'
      : 'var(--color-line-2)';

  return (
    <g
      transform={`translate(${node.x}, ${node.y})`}
      onMouseDown={(e) => {
        e.stopPropagation();
        onMouseDown(e);
      }}
      style={{ cursor: 'grab' }}
    >
      <rect
        x={0}
        y={0}
        width={NODE_W}
        height={NODE_H}
        rx={6}
        ry={6}
        fill={bg}
        stroke={stroke}
        strokeWidth={selected ? 1.5 : 1}
      />
      <text
        x={12}
        y={22}
        fill="var(--color-muted)"
        fontFamily="var(--font-mono)"
        fontSize={9}
        letterSpacing="0.16em"
      >
        {node.kind.toUpperCase()}
      </text>
      <text
        x={12}
        y={44}
        fill="var(--color-cream)"
        fontFamily="var(--font-mono)"
        fontSize={12}
      >
        {describeNode(node)}
      </text>

      {/* Input port — click target for pending edges.
          NOTE: Do not call stopPropagation here — the window-level mouseup
          listener is the one that clears the drag state. Eating the event
          at the port would leave the node pinned to the cursor. */}
      {hasInput && (
        <circle
          cx={0}
          cy={NODE_H / 2}
          r={PORT_R}
          fill="var(--color-ink)"
          stroke="var(--color-cream-dim)"
          strokeWidth={1}
          onMouseUp={(e) => onPortUp(e)}
          style={{ cursor: pending ? 'crosshair' : 'default', pointerEvents: 'all' }}
        />
      )}

      {/* Output port(s) — rendered from outputPortsFor() so new N-port kinds
          (loop, wait-until-*, random-branch, …) wire up automatically. */}
      {ports.map((p, idx) => {
        const cy = portY(ports.length, idx);
        const fill = p.accent === 'danger' ? 'var(--color-danger)' : 'var(--color-accent)';
        return (
          <g key={p.id}>
            <circle
              cx={NODE_W}
              cy={cy}
              r={PORT_R}
              fill={fill}
              stroke="var(--color-cream)"
              strokeWidth={1}
              onMouseDown={(e) => {
                e.stopPropagation();
                onPortDown(e, p.id);
              }}
              style={{ cursor: 'crosshair' }}
            />
            {p.label && (
              <text
                x={NODE_W + 10}
                y={cy + 3}
                fill="var(--color-muted)"
                fontFamily="var(--font-mono)"
                fontSize={9}
              >
                {p.label}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

// Distribute N ports evenly along the right edge of the node. For a single
// port this returns exactly NODE_H / 2; for two ports it matches the old
// branch layout (1/3, 2/3); larger counts add evenly-spaced slots.
function portY(total: number, idx: number): number {
  if (total <= 1) return NODE_H / 2;
  const step = NODE_H / (total + 1);
  return step * (idx + 1);
}

function EdgePath({
  d,
  edge,
  onRemove,
}: {
  d: string;
  edge: AutonomyEdge;
  onRemove: () => void;
}) {
  return (
    <g>
      <path d={d} fill="none" stroke="var(--color-line-2)" strokeWidth={1.4} />
      {/* Wider invisible hit path so short edges are still clickable. */}
      <path
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth={10}
        onClick={() => onRemove()}
        style={{ cursor: 'pointer' }}
      >
        <title>{`Edge ${edge.fromPort} — click to remove`}</title>
      </path>
    </g>
  );
}

function curve(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}

