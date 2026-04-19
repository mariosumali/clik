import { useEffect, useMemo, useState } from 'react';
import type { AutonomyNodeKind } from '../../../../shared/autonomy';
import { useStore } from '../../store';
import { formatElapsed } from '../../lib/format';
import { Segment } from '../primitives/Segment';
import { CodeEditor } from './CodeEditor';
import { NodeCanvas } from './NodeCanvas';
import { NodeInspector } from './NodeInspector';
import { Timeline } from './Timeline';
import { WorkspaceHotkey } from '../Hotkeys/WorkspaceHotkey';

type ViewMode = 'graph' | 'timeline' | 'code';

interface PaletteEntry {
  value: AutonomyNodeKind;
  label: string;
  hint: string;
}

interface PaletteGroup {
  label: string;
  nodes: PaletteEntry[];
}

const NODE_GROUPS: PaletteGroup[] = [
  {
    label: 'Flow',
    nodes: [
      { value: 'wait', label: 'Wait', hint: 'Pause for N ms' },
      { value: 'random-wait', label: 'Random wait', hint: 'Pause for a random interval' },
      { value: 'loop', label: 'Loop', hint: 'Repeat body N times' },
      { value: 'branch', label: 'Branch', hint: 'Split based on a condition' },
      { value: 'random-branch', label: 'Random branch', hint: 'True/false by probability' },
      { value: 'end', label: 'End', hint: 'Terminate the flow' },
      { value: 'stop-error', label: 'Stop error', hint: 'Terminate with a custom error' },
    ],
  },
  {
    label: 'Input',
    nodes: [
      { value: 'click', label: 'Click', hint: 'Send a mouse click' },
      { value: 'move', label: 'Move', hint: 'Move the cursor' },
      { value: 'drag', label: 'Drag', hint: 'Click-and-drag between points' },
      { value: 'scroll', label: 'Scroll', hint: 'Wheel scroll by dx/dy' },
      { value: 'keypress', label: 'Keypress', hint: 'Press a key with modifiers' },
      { value: 'hotkey', label: 'Hotkey', hint: 'Preset combos (copy, paste, …)' },
      { value: 'type-text', label: 'Type text', hint: 'Type a literal string' },
    ],
  },
  {
    label: 'Vision',
    nodes: [
      { value: 'find', label: 'Find', hint: 'Locate a template on screen' },
      { value: 'wait-until-found', label: 'Wait until found', hint: 'Poll until template appears' },
      { value: 'wait-until-gone', label: 'Wait until gone', hint: 'Poll until template disappears' },
      { value: 'screenshot', label: 'Screenshot', hint: 'Capture region to clipboard / disk' },
    ],
  },
  {
    label: 'Data',
    nodes: [
      { value: 'set-var', label: 'Set variable', hint: 'Assign a value to a named var' },
      { value: 'counter', label: 'Counter', hint: 'Increment / decrement / reset a var' },
      { value: 'log', label: 'Log', hint: 'Append to the Run Log' },
      { value: 'notify', label: 'Notify', hint: 'Show a desktop notification' },
    ],
  },
];

export function AutonomyPage() {
  const flows = useStore((s) => s.autonomyFlows);
  const activeFlowId = useStore((s) => s.activeFlowId);
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const createFlow = useStore((s) => s.createFlow);
  const renameFlow = useStore((s) => s.renameFlow);
  const deleteFlow = useStore((s) => s.deleteFlow);
  const setActiveFlow = useStore((s) => s.setActiveFlow);
  const addNode = useStore((s) => s.addAutonomyNode);
  const applyAutonomyTick = useStore((s) => s.applyAutonomyTick);
  const autonomyStatus = useStore((s) => s.autonomyStatus);
  const autonomyCurrentNode = useStore((s) => s.autonomyCurrentNode);
  const autonomyIterations = useStore((s) => s.autonomyIterations);
  const autonomyElapsedMs = useStore((s) => s.autonomyElapsedMs);
  const autonomyLastError = useStore((s) => s.autonomyLastError);
  const autonomyLastFound = useStore((s) => s.autonomyLastFound);
  const undoAutonomy = useStore((s) => s.undoAutonomy);
  const redoAutonomy = useStore((s) => s.redoAutonomy);
  const copySel = useStore((s) => s.copyAutonomySelection);
  const cutSel = useStore((s) => s.cutAutonomySelection);
  const pasteSel = useStore((s) => s.pasteAutonomy);
  const duplicateSel = useStore((s) => s.duplicateAutonomySelection);
  const canUndo = useStore((s) => s.autonomyPast.length > 0);
  const canRedo = useStore((s) => s.autonomyFuture.length > 0);
  const canPaste = useStore(
    (s) => (s.autonomyClipboard?.nodes.length ?? 0) > 0,
  );

  const activeFlow = useMemo(
    () => flows.find((f) => f.id === activeFlowId) ?? null,
    [flows, activeFlowId],
  );

  const selectedNode = useMemo(
    () => activeFlow?.nodes.find((n) => n.id === selectedNodeId) ?? null,
    [activeFlow, selectedNodeId],
  );

  const running = autonomyStatus === 'running';
  const [viewMode, setViewMode] = useState<ViewMode>('graph');

  // Start is the singular entry point — it can't be copied, cut, or duplicated.
  const canCopySelection = !!selectedNode && selectedNode.kind !== 'start';

  // Subscribe to tick stream from the main process.
  useEffect(() => {
    const off = window.clik.onAutonomyTick((t) => applyAutonomyTick(t));
    return off;
  }, [applyAutonomyTick]);

  // Create a starter flow on first visit so the canvas isn't empty.
  useEffect(() => {
    if (flows.length === 0) createFlow('First flow');
  }, [flows.length, createFlow]);

  // Global editor shortcuts. We ignore keydowns that originate from form
  // controls so the user's native undo / copy still works while typing in the
  // flow-name field or a Stepper input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
      ) {
        return;
      }
      // Don't mutate while the runner is live — an undo mid-run would race
      // the main-process state machine.
      if (running) return;
      const key = e.key.toLowerCase();
      switch (key) {
        case 'z':
          e.preventDefault();
          if (e.shiftKey) redoAutonomy();
          else undoAutonomy();
          break;
        case 'y':
          e.preventDefault();
          redoAutonomy();
          break;
        case 'c':
          e.preventDefault();
          copySel();
          break;
        case 'x':
          e.preventDefault();
          cutSel();
          break;
        case 'v':
          e.preventDefault();
          pasteSel();
          break;
        case 'd':
          e.preventDefault();
          duplicateSel();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running, undoAutonomy, redoAutonomy, copySel, cutSel, pasteSel, duplicateSel]);

  const handleRun = async () => {
    if (!activeFlow || running) return;
    const perm = await window.clik.checkPermission();
    if (!perm.trusted) {
      applyAutonomyTick({
        status: 'error',
        currentNodeId: null,
        iterations: 0,
        elapsedMs: 0,
        lastError: 'grant-accessibility',
      });
      return;
    }
    const res = await window.clik.autonomyStart(activeFlow, flows);
    if (!res.ok) {
      applyAutonomyTick({
        status: 'error',
        currentNodeId: null,
        iterations: 0,
        elapsedMs: 0,
        lastError: res.err ?? 'start-failed',
      });
    }
  };

  const handleStop = () => {
    void window.clik.autonomyStop();
  };

  return (
    <div className="h-full flex flex-col">
      <FlowBar
        flows={flows}
        activeFlowId={activeFlowId}
        running={running}
        viewMode={viewMode}
        onViewMode={setViewMode}
        onSelect={setActiveFlow}
        onCreate={() => createFlow()}
        onRename={renameFlow}
        onDelete={deleteFlow}
        canUndo={canUndo}
        canRedo={canRedo}
        canPaste={canPaste}
        canCopy={canCopySelection}
        onUndo={undoAutonomy}
        onRedo={redoAutonomy}
        onCopy={copySel}
        onCut={cutSel}
        onPaste={pasteSel}
        onDuplicate={duplicateSel}
      />

      <div className="flex flex-1 min-h-0">
        <aside
          className="w-[220px] shrink-0 h-full flex flex-col gap-4 p-4 border-r border-[var(--color-line)] overflow-y-auto"
          style={{ background: 'var(--color-ink-2)' }}
        >
          <div className="label-muted">Palette</div>
          {NODE_GROUPS.map((group) => (
            <div key={group.label} className="flex flex-col gap-2">
              <div
                className="label-muted"
                style={{ letterSpacing: '0.14em' }}
              >
                {group.label}
              </div>
              {group.nodes.map((n) => (
                <button
                  key={n.value}
                  type="button"
                  className="btn-ghost flex flex-col items-start gap-1 py-2 px-2"
                  onClick={() => addNode(n.value)}
                  disabled={!activeFlow || running}
                  title={n.hint}
                >
                  <span className="font-mono text-[11px] tracking-[0.12em] uppercase">{n.label}</span>
                  <span className="label-muted text-left" style={{ fontSize: 10 }}>
                    {n.hint}
                  </span>
                </button>
              ))}
            </div>
          ))}
          <div className="mt-auto label-muted">
            Drag output dot → input dot to wire nodes. Delete key removes selection.
          </div>
        </aside>

        <div className="flex-1 min-w-0 min-h-0 relative">
          {activeFlow ? (
            viewMode === 'graph' ? (
              <NodeCanvas flow={activeFlow} runningNodeId={autonomyCurrentNode} />
            ) : viewMode === 'timeline' ? (
              <Timeline flow={activeFlow} runningNodeId={autonomyCurrentNode} />
            ) : (
              <CodeEditor flow={activeFlow} running={running} />
            )
          ) : (
            <div className="h-full flex items-center justify-center label-muted">
              Create a flow to begin.
            </div>
          )}
        </div>

        {viewMode !== 'code' && (
          <aside
            className="w-[300px] shrink-0 h-full overflow-y-auto p-4 flex flex-col gap-4 border-l border-[var(--color-line)]"
            style={{ background: 'var(--color-ink-2)' }}
          >
            {selectedNode ? (
              <NodeInspector node={selectedNode} running={running} />
            ) : (
              <div className="label-muted">
                Select a node to edit its parameters.
              </div>
            )}
          </aside>
        )}
      </div>

      <RunBar
        canRun={!!activeFlow}
        running={running}
        iterations={autonomyIterations}
        elapsedMs={autonomyElapsedMs}
        lastError={autonomyLastError}
        lastFound={autonomyLastFound}
        onRun={handleRun}
        onStop={handleStop}
      />
    </div>
  );
}

interface FlowBarProps {
  flows: ReturnType<typeof useStore.getState>['autonomyFlows'];
  activeFlowId: string | null;
  running: boolean;
  viewMode: ViewMode;
  onViewMode: (v: ViewMode) => void;
  onSelect: (id: string) => void;
  onCreate: () => string;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  canPaste: boolean;
  canCopy: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
}

// macOS uses ⌘; everyone else uses Ctrl. Detected once per mount since the
// shortcut hint is a purely cosmetic tooltip detail.
const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = IS_MAC ? '⌘' : 'Ctrl+';

function FlowBar({
  flows,
  activeFlowId,
  running,
  viewMode,
  onViewMode,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  canUndo,
  canRedo,
  canPaste,
  canCopy,
  onUndo,
  onRedo,
  onCopy,
  onCut,
  onPaste,
  onDuplicate,
}: FlowBarProps) {
  const active = flows.find((f) => f.id === activeFlowId) ?? null;
  const [editingName, setEditingName] = useState<string | null>(null);

  return (
    <div
      className="h-[52px] shrink-0 flex items-center gap-3 px-6 border-b border-[var(--color-line)]"
      style={{ background: 'var(--color-ink-2)' }}
    >
      <div className="label-muted">Flow</div>
      <select
        className="bg-[var(--color-ink)] border border-[var(--color-line)] px-3 py-1 font-mono text-[12px] text-[var(--color-cream)]"
        value={activeFlowId ?? ''}
        onChange={(e) => onSelect(e.target.value)}
        disabled={running}
      >
        {flows.length === 0 && <option value="">—</option>}
        {flows.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
      {active && (
        <input
          type="text"
          value={editingName ?? active.name}
          onChange={(e) => setEditingName(e.target.value)}
          onBlur={(e) => {
            const next = e.target.value.trim();
            if (next && next !== active.name) onRename(active.id, next);
            setEditingName(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          className="bg-transparent border border-[var(--color-line)] px-3 py-1 font-mono text-[12px] text-[var(--color-cream)] flex-1 max-w-[260px]"
          placeholder="Flow name"
          disabled={running}
        />
      )}
      <button type="button" className="btn-ghost" onClick={() => onCreate()} disabled={running}>
        + New flow
      </button>
      {active && (
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            if (window.confirm(`Delete "${active.name}"?`)) onDelete(active.id);
          }}
          disabled={running || flows.length <= 1}
          style={{ color: 'var(--color-danger)' }}
        >
          Delete
        </button>
      )}

      <div className="ml-auto flex items-center gap-4">
        <div className="flex items-center">
          <EditBtn
            label="Undo"
            shortcut={`${MOD}Z`}
            glyph="↶"
            disabled={!canUndo || running}
            onClick={onUndo}
          />
          <EditBtn
            label="Redo"
            shortcut={`${MOD}⇧Z`}
            glyph="↷"
            disabled={!canRedo || running}
            onClick={onRedo}
          />
          <Separator />
          <EditBtn
            label="Cut"
            shortcut={`${MOD}X`}
            glyph="✂"
            disabled={!canCopy || running}
            onClick={onCut}
          />
          <EditBtn
            label="Copy"
            shortcut={`${MOD}C`}
            glyph="⧉"
            disabled={!canCopy || running}
            onClick={onCopy}
          />
          <EditBtn
            label="Paste"
            shortcut={`${MOD}V`}
            glyph="⎘"
            disabled={!canPaste || running}
            onClick={onPaste}
          />
          <EditBtn
            label="Duplicate"
            shortcut={`${MOD}D`}
            glyph="⧉+"
            disabled={!canCopy || running}
            onClick={onDuplicate}
          />
        </div>
        <Segment<ViewMode>
          value={viewMode}
          onChange={onViewMode}
          options={[
            { value: 'graph', label: 'Graph' },
            { value: 'timeline', label: 'Timeline' },
            { value: 'code', label: 'Code' },
          ]}
        />
        <WorkspaceHotkey target="autonomy" />
      </div>
    </div>
  );
}

function EditBtn({
  label,
  shortcut,
  glyph,
  disabled,
  onClick,
}: {
  label: string;
  shortcut: string;
  glyph: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={`${label} (${shortcut})`}
      aria-label={label}
      className="no-drag h-8 w-8 flex items-center justify-center text-[var(--color-cream-dim)] hover:text-[var(--color-cream)] hover:bg-[var(--color-ink)] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--color-cream-dim)] disabled:cursor-not-allowed"
      style={{ fontFamily: 'var(--font-mono)', fontSize: 14, lineHeight: 1 }}
    >
      {glyph}
    </button>
  );
}

function Separator() {
  return (
    <span
      aria-hidden
      className="mx-1 h-4 w-px"
      style={{ background: 'var(--color-line)' }}
    />
  );
}

interface RunBarProps {
  canRun: boolean;
  running: boolean;
  iterations: number;
  elapsedMs: number;
  lastError?: string;
  lastFound: { x: number; y: number; confidence: number } | null;
  onRun: () => void;
  onStop: () => void;
}

function RunBar({
  canRun,
  running,
  iterations,
  elapsedMs,
  lastError,
  lastFound,
  onRun,
  onStop,
}: RunBarProps) {
  return (
    <div
      className="h-[72px] shrink-0 flex items-center gap-6 px-6 border-t border-[var(--color-line)]"
      style={{ background: 'var(--color-ink-2)' }}
    >
      <button
        type="button"
        className="no-drag flex items-center justify-center px-6 h-10 border border-[var(--color-cream)] disabled:opacity-40"
        onClick={running ? onStop : onRun}
        disabled={!canRun}
        style={{
          background: running ? 'var(--color-danger)' : 'var(--color-cream)',
          color: 'var(--color-ink)',
          minWidth: 160,
        }}
      >
        <span className="font-display text-[18px] leading-none uppercase">
          {running ? 'Stop' : 'Run flow'}
        </span>
      </button>

      <div className="flex items-center gap-8 flex-1">
        <Metric label="Iterations" value={iterations.toString()} />
        <Metric label="Elapsed" value={formatElapsed(elapsedMs)} />
        <Metric
          label="Last match"
          value={
            lastFound
              ? `${lastFound.x}, ${lastFound.y} · ${lastFound.confidence.toFixed(2)}`
              : '—'
          }
        />
      </div>

      {lastError && !running && (
        <div
          className="hairline p-2"
          style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}
        >
          <span className="label-muted" style={{ color: 'var(--color-danger)' }}>
            {explainError(lastError)}
          </span>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="label-muted">{label}</span>
      <span className="font-mono text-[14px] text-[var(--color-cream)]">{value}</span>
    </div>
  );
}

function explainError(err: string): string {
  if (err === 'no-start-node') return 'Flow has no Start node.';
  if (err === 'missing-node') return 'Edge points to a removed node.';
  if (err === 'dead-end') return 'Flow ended without reaching an End node.';
  if (err === 'max-steps') return 'Hit the safety step limit — check for infinite loops.';
  if (err === 'grant-accessibility') return 'Grant Accessibility permission in System Settings.';
  if (err === 'no-template') return 'Find node needs a template — capture one.';
  return err;
}
