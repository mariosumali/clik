import { useState } from 'react';
import type {
  AutonomyNode,
  AutonomyRect,
  AutonomyTemplate,
  BranchNode,
  ClickNode,
  ClickTarget,
  CounterNode,
  DragNode,
  FindNode,
  HotkeyNode,
  HotkeyPreset,
  KeypressNode,
  LogNode,
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
  StopErrorNode,
  TypeTextNode,
  VarCompareOp,
  WaitNode,
  WaitUntilFoundNode,
  WaitUntilGoneNode,
} from '../../../../shared/autonomy';
import type { MouseButton } from '../../../../shared/types';
import { Segment } from '../primitives/Segment';
import { Stepper } from '../primitives/Stepper';
import { useStore } from '../../store';

interface NodeInspectorProps {
  node: AutonomyNode;
  running: boolean;
}

export function NodeInspector({ node, running }: NodeInspectorProps) {
  const update = useStore((s) => s.updateAutonomyNode);
  const remove = useStore((s) => s.removeAutonomyNode);
  const patch = (p: Partial<AutonomyNode>) => update(node.id, p);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="label-muted">Node · {node.kind}</div>
        {node.kind !== 'start' && (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => remove(node.id)}
            disabled={running}
            style={{ color: 'var(--color-danger)' }}
          >
            Delete
          </button>
        )}
      </div>

      {node.kind === 'wait' && <WaitEditor node={node} onPatch={patch} disabled={running} />}
      {node.kind === 'random-wait' && <RandomWaitEditor node={node} onPatch={patch} disabled={running} />}
      {node.kind === 'loop' && <LoopEditor node={node} onPatch={patch} disabled={running} />}
      {node.kind === 'counter' && <CounterEditor node={node} onPatch={patch} disabled={running} />}
      {node.kind === 'set-var' && <SetVarEditor node={node} onPatch={patch} disabled={running} />}
      {node.kind === 'random-branch' && <RandomBranchEditor node={node} onPatch={patch} disabled={running} />}
      {node.kind === 'stop-error' && <StopErrorEditor node={node} onPatch={patch} disabled={running} />}
      {node.kind === 'log' && <LogEditor node={node} onPatch={patch} disabled={running} />}
      {node.kind === 'notify' && <NotifyEditor node={node} onPatch={patch} disabled={running} />}

      {node.kind === 'click' && <ClickEditor node={node} onPatch={patch} disabled={running} />}
      {node.kind === 'move' && <MoveEditor node={node} onPatch={patch} disabled={running} />}
      {node.kind === 'drag' && <DragEditor node={node} onPatch={patch} disabled={running} />}
      {node.kind === 'scroll' && <ScrollEditor node={node} onPatch={patch} disabled={running} />}
      {node.kind === 'keypress' && <KeypressEditor node={node} onPatch={patch} disabled={running} />}
      {node.kind === 'hotkey' && <HotkeyEditor node={node} onPatch={patch} disabled={running} />}
      {node.kind === 'type-text' && <TypeTextEditor node={node} onPatch={patch} disabled={running} />}

      {node.kind === 'find' && <FindEditor node={node} onPatch={patch} disabled={running} />}
      {node.kind === 'wait-until-found' && (
        <WaitUntilEditor node={node} onPatch={patch} disabled={running} label="appear" />
      )}
      {node.kind === 'wait-until-gone' && (
        <WaitUntilEditor node={node} onPatch={patch} disabled={running} label="disappear" />
      )}
      {node.kind === 'screenshot' && <ScreenshotEditor node={node} onPatch={patch} disabled={running} />}

      {node.kind === 'branch' && <BranchEditor node={node} onPatch={patch} disabled={running} />}

      {node.kind === 'start' && (
        <div className="hairline p-3 label-muted">
          Flows begin here. Connect this node's output port to the first step of your workflow.
        </div>
      )}
      {node.kind === 'end' && (
        <div className="hairline p-3 label-muted">
          Reaching this node terminates the run.
        </div>
      )}
    </div>
  );
}

// --- Small primitives -------------------------------------------------------

function VarNameInput({
  value,
  onChange,
  disabled,
  label = 'Variable',
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  label?: string;
}) {
  return (
    <label className="flex items-center justify-between gap-4">
      <span className="label-muted">{label}</span>
      <input
        type="text"
        className="bg-[var(--color-ink)] border border-[var(--color-line)] px-2 py-1 font-mono text-[12px] text-[var(--color-cream)] w-[160px]"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^A-Za-z0-9_]/g, ''))}
        placeholder="name"
        disabled={disabled}
      />
    </label>
  );
}

function TextInputRow({
  label,
  value,
  onChange,
  disabled,
  placeholder,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="label-muted">{label}</span>
      {multiline ? (
        <textarea
          className="bg-[var(--color-ink)] border border-[var(--color-line)] px-2 py-2 font-mono text-[12px] text-[var(--color-cream)] w-full min-h-[70px]"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
      ) : (
        <input
          type="text"
          className="bg-[var(--color-ink)] border border-[var(--color-line)] px-2 py-1 font-mono text-[12px] text-[var(--color-cream)] w-full"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
      )}
    </div>
  );
}

// --- Editors ----------------------------------------------------------------

function WaitEditor({
  node,
  onPatch,
  disabled,
}: {
  node: WaitNode;
  onPatch: (p: Partial<WaitNode>) => void;
  disabled: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-4">
      <span className="label-muted">Duration (ms)</span>
      <Stepper
        value={node.ms}
        onChange={(ms) => onPatch({ ms })}
        min={0}
        max={600_000}
        step={100}
        disabled={disabled}
      />
    </label>
  );
}

function RandomWaitEditor({
  node,
  onPatch,
  disabled,
}: {
  node: RandomWaitNode;
  onPatch: (p: Partial<RandomWaitNode>) => void;
  disabled: boolean;
}) {
  return (
    <>
      <label className="flex items-center justify-between gap-4">
        <span className="label-muted">Min (ms)</span>
        <Stepper
          value={node.minMs}
          onChange={(minMs) => onPatch({ minMs })}
          min={0}
          max={600_000}
          step={50}
          disabled={disabled}
        />
      </label>
      <label className="flex items-center justify-between gap-4">
        <span className="label-muted">Max (ms)</span>
        <Stepper
          value={node.maxMs}
          onChange={(maxMs) => onPatch({ maxMs })}
          min={0}
          max={600_000}
          step={50}
          disabled={disabled}
        />
      </label>
      <div className="hairline p-3 label-muted">
        Sleeps for a uniformly-random duration between the two bounds.
      </div>
    </>
  );
}

function LoopEditor({
  node,
  onPatch,
  disabled,
}: {
  node: LoopNode;
  onPatch: (p: Partial<LoopNode>) => void;
  disabled: boolean;
}) {
  return (
    <>
      <label className="flex items-center justify-between gap-4">
        <span className="label-muted">Iterations</span>
        <Stepper
          value={node.count}
          onChange={(count) => onPatch({ count })}
          min={1}
          max={100_000}
          step={1}
          disabled={disabled}
        />
      </label>
      <VarNameInput
        label="Index var (optional)"
        value={node.indexVar ?? ''}
        onChange={(v) => onPatch({ indexVar: v || undefined })}
        disabled={disabled}
      />
      <div className="hairline p-3 label-muted">
        Emits the <strong>body</strong> port while iterations remain, then emits <strong>done</strong>.
        Exposes the 0-based index as <code>{'{'}{node.indexVar || 'name'}{'}'}</code> if set.
      </div>
    </>
  );
}

function CounterEditor({
  node,
  onPatch,
  disabled,
}: {
  node: CounterNode;
  onPatch: (p: Partial<CounterNode>) => void;
  disabled: boolean;
}) {
  const needsAmount = node.op === 'inc' || node.op === 'dec' || node.op === 'set';
  return (
    <>
      <VarNameInput
        value={node.varName}
        onChange={(v) => onPatch({ varName: v })}
        disabled={disabled}
      />
      <div className="flex flex-col gap-2">
        <span className="label-muted">Operation</span>
        <Segment<CounterNode['op']>
          value={node.op}
          onChange={(op) => onPatch({ op })}
          options={[
            { value: 'inc', label: '+' },
            { value: 'dec', label: '−' },
            { value: 'set', label: '=' },
            { value: 'reset', label: '0' },
          ]}
        />
      </div>
      {needsAmount && (
        <label className="flex items-center justify-between gap-4">
          <span className="label-muted">Amount</span>
          <Stepper
            value={node.amount}
            onChange={(amount) => onPatch({ amount })}
            min={-1_000_000}
            max={1_000_000}
            step={1}
            disabled={disabled}
          />
        </label>
      )}
    </>
  );
}

function SetVarEditor({
  node,
  onPatch,
  disabled,
}: {
  node: SetVarNode;
  onPatch: (p: Partial<SetVarNode>) => void;
  disabled: boolean;
}) {
  const src = node.source;
  const kind = src.kind;
  return (
    <>
      <VarNameInput
        value={node.varName}
        onChange={(v) => onPatch({ varName: v })}
        disabled={disabled}
      />
      <div className="flex flex-col gap-2">
        <span className="label-muted">Source</span>
        <select
          className="bg-[var(--color-ink)] border border-[var(--color-line)] px-3 py-2 font-mono text-[12px] text-[var(--color-cream)] w-full"
          value={kind}
          onChange={(e) => {
            const next = e.target.value as SetVarSource['kind'];
            onPatch({ source: defaultSetVarSource(next) });
          }}
          disabled={disabled}
        >
          <option value="literal-number">Literal number</option>
          <option value="literal-string">Literal string</option>
          <option value="last-found-x">Last match X</option>
          <option value="last-found-y">Last match Y</option>
          <option value="last-found-score">Last match score</option>
          <option value="elapsed-ms">Elapsed ms</option>
          <option value="iterations">Iterations</option>
          <option value="cursor-x">Cursor X</option>
          <option value="cursor-y">Cursor Y</option>
          <option value="random-int">Random int</option>
        </select>
      </div>
      {src.kind === 'literal-number' && (
        <label className="flex items-center justify-between gap-4">
          <span className="label-muted">Value</span>
          <Stepper
            value={src.value}
            onChange={(value) => onPatch({ source: { kind: 'literal-number', value } })}
            min={-1_000_000}
            max={1_000_000}
            step={1}
            disabled={disabled}
          />
        </label>
      )}
      {src.kind === 'literal-string' && (
        <TextInputRow
          label="Value"
          value={src.value}
          onChange={(value) => onPatch({ source: { kind: 'literal-string', value } })}
          disabled={disabled}
          placeholder="supports {var}"
        />
      )}
      {src.kind === 'random-int' && (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <span className="label-muted">Min</span>
            <Stepper
              value={src.min}
              onChange={(min) => onPatch({ source: { kind: 'random-int', min, max: src.max } })}
              min={-1_000_000}
              max={1_000_000}
              step={1}
              disabled={disabled}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="label-muted">Max</span>
            <Stepper
              value={src.max}
              onChange={(max) => onPatch({ source: { kind: 'random-int', min: src.min, max } })}
              min={-1_000_000}
              max={1_000_000}
              step={1}
              disabled={disabled}
            />
          </div>
        </div>
      )}
    </>
  );
}

function defaultSetVarSource(kind: SetVarSource['kind']): SetVarSource {
  switch (kind) {
    case 'literal-number':
      return { kind: 'literal-number', value: 0 };
    case 'literal-string':
      return { kind: 'literal-string', value: '' };
    case 'random-int':
      return { kind: 'random-int', min: 0, max: 100 };
    default:
      return { kind } as SetVarSource;
  }
}

function RandomBranchEditor({
  node,
  onPatch,
  disabled,
}: {
  node: RandomBranchNode;
  onPatch: (p: Partial<RandomBranchNode>) => void;
  disabled: boolean;
}) {
  return (
    <>
      <label className="flex items-center justify-between gap-4">
        <span className="label-muted">P(true)</span>
        <Stepper
          value={node.probability}
          onChange={(probability) => onPatch({ probability })}
          min={0}
          max={1}
          step={0.05}
          decimals={2}
          disabled={disabled}
        />
      </label>
      <div className="hairline p-3 label-muted">
        Routes to the <strong>true</strong> port with the given probability on each pass.
      </div>
    </>
  );
}

function StopErrorEditor({
  node,
  onPatch,
  disabled,
}: {
  node: StopErrorNode;
  onPatch: (p: Partial<StopErrorNode>) => void;
  disabled: boolean;
}) {
  return (
    <TextInputRow
      label="Error message"
      value={node.message}
      onChange={(message) => onPatch({ message })}
      disabled={disabled}
      placeholder="stopped-on-error"
    />
  );
}

function LogEditor({
  node,
  onPatch,
  disabled,
}: {
  node: LogNode;
  onPatch: (p: Partial<LogNode>) => void;
  disabled: boolean;
}) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <span className="label-muted">Severity</span>
        <Segment<LogNode['severity']>
          value={node.severity}
          onChange={(severity) => onPatch({ severity })}
          options={[
            { value: 'info', label: 'Info' },
            { value: 'warn', label: 'Warn' },
            { value: 'error', label: 'Error' },
          ]}
        />
      </div>
      <TextInputRow
        label="Message"
        value={node.message}
        onChange={(message) => onPatch({ message })}
        disabled={disabled}
        placeholder="e.g. iter={iterations}"
        multiline
      />
      <div className="hairline p-3 label-muted">
        Supports templating: <code>{'{iterations}'}</code>, <code>{'{elapsedMs}'}</code>,
        <code>{'{lastFound.x}'}</code>, <code>{'{var}'}</code>.
      </div>
    </>
  );
}

function NotifyEditor({
  node,
  onPatch,
  disabled,
}: {
  node: NotifyNode;
  onPatch: (p: Partial<NotifyNode>) => void;
  disabled: boolean;
}) {
  return (
    <>
      <TextInputRow
        label="Title"
        value={node.title}
        onChange={(title) => onPatch({ title })}
        disabled={disabled}
        placeholder="CLIK"
      />
      <TextInputRow
        label="Body"
        value={node.body}
        onChange={(body) => onPatch({ body })}
        disabled={disabled}
        placeholder="flow reached step {iterations}"
        multiline
      />
    </>
  );
}

function ClickEditor({
  node,
  onPatch,
  disabled,
}: {
  node: ClickNode;
  onPatch: (p: Partial<ClickNode>) => void;
  disabled: boolean;
}) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <span className="label-muted">Button</span>
        <Segment<MouseButton>
          value={node.button}
          onChange={(button) => onPatch({ button })}
          options={[
            { value: 'left', label: 'Left' },
            { value: 'right', label: 'Right' },
            { value: 'middle', label: 'Middle' },
          ]}
        />
      </div>
      <div className="flex flex-col gap-2">
        <span className="label-muted">Click kind</span>
        <Segment<'single' | 'double'>
          value={node.clickKind}
          onChange={(clickKind) => onPatch({ clickKind })}
          options={[
            { value: 'single', label: 'Single' },
            { value: 'double', label: 'Double' },
          ]}
        />
      </div>
      <TargetEditor
        target={node.target}
        onChange={(target) => onPatch({ target })}
        disabled={disabled}
      />
    </>
  );
}

function MoveEditor({
  node,
  onPatch,
  disabled,
}: {
  node: MoveNode;
  onPatch: (p: Partial<MoveNode>) => void;
  disabled: boolean;
}) {
  const migrated: ClickTarget =
    node.target.kind === 'cursor' ? { kind: 'fixed', x: 200, y: 200 } : node.target;

  const style: MoveStyle = node.style ?? 'teleport';
  const durationMs = node.durationMs ?? 400;
  const curvature = node.curvature ?? 0.3;
  const jitter = node.jitter ?? 0.2;
  const showDuration = style !== 'teleport';
  const showCurvature = style === 'bezier' || style === 'human';
  const showJitter = style === 'human';

  const styleHint: Record<MoveStyle, string> = {
    teleport: 'Cursor snaps to the target in a single event. Fastest, zero animation.',
    linear: 'Ease-in-out straight line from the current cursor to the target.',
    bezier: 'Cubic bezier arc — curvature controls how pronounced the bow is.',
    human: 'Bezier path with micro-jitter, randomised side, and a decelerating approach.',
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="hairline p-3 label-muted">
        Physically repositions the cursor before the next step. Pair with a Click node set to
        "Cursor" to click wherever Move lands.
      </div>

      <TargetEditor
        target={migrated}
        onChange={(target) => onPatch({ target })}
        disabled={disabled}
        allowCursor={false}
      />

      <div className="flex flex-col gap-2">
        <span className="label-muted">Motion</span>
        <select
          className="bg-[var(--color-ink)] border border-[var(--color-line)] px-3 py-2 font-mono text-[12px] text-[var(--color-cream)] w-full"
          value={style}
          onChange={(e) => onPatch({ style: e.target.value as MoveStyle })}
          disabled={disabled}
        >
          <option value="teleport">Teleport</option>
          <option value="linear">Linear travel</option>
          <option value="bezier">Bezier curve</option>
          <option value="human">Human motion</option>
        </select>
        <div className="hairline p-3 label-muted">{styleHint[style]}</div>
      </div>

      {showDuration && (
        <label className="flex items-center justify-between gap-4">
          <span className="label-muted">Duration (ms)</span>
          <Stepper
            value={durationMs}
            onChange={(next) => onPatch({ durationMs: next })}
            min={20}
            max={10_000}
            step={50}
            disabled={disabled}
          />
        </label>
      )}

      {showCurvature && (
        <label className="flex items-center justify-between gap-4">
          <span className="label-muted">Curvature</span>
          <Stepper
            value={curvature}
            onChange={(next) => onPatch({ curvature: next })}
            min={0}
            max={1}
            step={0.05}
            decimals={2}
            disabled={disabled}
          />
        </label>
      )}

      {showJitter && (
        <label className="flex items-center justify-between gap-4">
          <span className="label-muted">Jitter</span>
          <Stepper
            value={jitter}
            onChange={(next) => onPatch({ jitter: next })}
            min={0}
            max={1}
            step={0.05}
            decimals={2}
            disabled={disabled}
          />
        </label>
      )}
    </div>
  );
}

function DragEditor({
  node,
  onPatch,
  disabled,
}: {
  node: DragNode;
  onPatch: (p: Partial<DragNode>) => void;
  disabled: boolean;
}) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <span className="label-muted">Button</span>
        <Segment<MouseButton>
          value={node.button}
          onChange={(button) => onPatch({ button })}
          options={[
            { value: 'left', label: 'Left' },
            { value: 'right', label: 'Right' },
            { value: 'middle', label: 'Middle' },
          ]}
        />
      </div>
      <div className="flex flex-col gap-2">
        <span className="label-muted">From</span>
        <TargetEditor
          target={node.from}
          onChange={(from) => onPatch({ from })}
          disabled={disabled}
          allowCursor={false}
        />
      </div>
      <div className="flex flex-col gap-2">
        <span className="label-muted">To</span>
        <TargetEditor
          target={node.to}
          onChange={(to) => onPatch({ to })}
          disabled={disabled}
          allowCursor={false}
        />
      </div>
      <label className="flex items-center justify-between gap-4">
        <span className="label-muted">Steps</span>
        <Stepper
          value={node.steps}
          onChange={(steps) => onPatch({ steps })}
          min={2}
          max={500}
          step={1}
          disabled={disabled}
        />
      </label>
      <label className="flex items-center justify-between gap-4">
        <span className="label-muted">Step delay (ms)</span>
        <Stepper
          value={node.stepDelayMs}
          onChange={(stepDelayMs) => onPatch({ stepDelayMs })}
          min={0}
          max={500}
          step={1}
          disabled={disabled}
        />
      </label>
    </>
  );
}

function ScrollEditor({
  node,
  onPatch,
  disabled,
}: {
  node: ScrollNode;
  onPatch: (p: Partial<ScrollNode>) => void;
  disabled: boolean;
}) {
  return (
    <>
      <label className="flex items-center justify-between gap-4">
        <span className="label-muted">Δ X (lines)</span>
        <Stepper
          value={node.dx}
          onChange={(dx) => onPatch({ dx })}
          min={-100}
          max={100}
          step={1}
          disabled={disabled}
        />
      </label>
      <label className="flex items-center justify-between gap-4">
        <span className="label-muted">Δ Y (lines)</span>
        <Stepper
          value={node.dy}
          onChange={(dy) => onPatch({ dy })}
          min={-100}
          max={100}
          step={1}
          disabled={disabled}
        />
      </label>
      <TargetEditor
        target={node.target}
        onChange={(target) => onPatch({ target })}
        disabled={disabled}
      />
      <div className="hairline p-3 label-muted">
        Positive Δ Y scrolls up, positive Δ X scrolls right.
      </div>
    </>
  );
}

const MODIFIER_KEYS: ModifierKey[] = ['cmd', 'ctrl', 'shift', 'opt'];

function KeypressEditor({
  node,
  onPatch,
  disabled,
}: {
  node: KeypressNode;
  onPatch: (p: Partial<KeypressNode>) => void;
  disabled: boolean;
}) {
  const toggleMod = (m: ModifierKey) => {
    const has = node.modifiers.includes(m);
    const next = has ? node.modifiers.filter((x) => x !== m) : [...node.modifiers, m];
    onPatch({ modifiers: next });
  };

  return (
    <>
      <div className="flex flex-col gap-2">
        <span className="label-muted">Modifiers</span>
        <div className="flex flex-wrap gap-2">
          {MODIFIER_KEYS.map((m) => {
            const on = node.modifiers.includes(m);
            return (
              <button
                key={m}
                type="button"
                className="btn-ghost"
                onClick={() => toggleMod(m)}
                disabled={disabled}
                style={{
                  background: on ? 'var(--color-cream)' : undefined,
                  color: on ? 'var(--color-ink)' : undefined,
                }}
              >
                {m}
              </button>
            );
          })}
        </div>
      </div>
      <TextInputRow
        label="Key"
        value={node.key}
        onChange={(key) => onPatch({ key })}
        disabled={disabled}
        placeholder="Enter | a | 1 | ArrowUp | F2"
      />
      <div className="hairline p-3 label-muted">
        Letters / digits use the US virtual-key table; named keys cover Enter, Tab, Escape,
        arrows, function keys, and page navigation.
      </div>
    </>
  );
}

const HOTKEY_PRESETS: Array<{ value: HotkeyPreset; label: string }> = [
  { value: 'copy', label: 'Copy (⌘C)' },
  { value: 'paste', label: 'Paste (⌘V)' },
  { value: 'cut', label: 'Cut (⌘X)' },
  { value: 'undo', label: 'Undo (⌘Z)' },
  { value: 'redo', label: 'Redo (⌘⇧Z)' },
  { value: 'select-all', label: 'Select all (⌘A)' },
  { value: 'save', label: 'Save (⌘S)' },
  { value: 'screenshot-region', label: 'Screenshot region (⌘⇧4)' },
  { value: 'screenshot-full', label: 'Screenshot full (⌘⇧3)' },
];

function HotkeyEditor({
  node,
  onPatch,
  disabled,
}: {
  node: HotkeyNode;
  onPatch: (p: Partial<HotkeyNode>) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="label-muted">Preset</span>
      <select
        className="bg-[var(--color-ink)] border border-[var(--color-line)] px-3 py-2 font-mono text-[12px] text-[var(--color-cream)] w-full"
        value={node.preset}
        onChange={(e) => onPatch({ preset: e.target.value as HotkeyPreset })}
        disabled={disabled}
      >
        {HOTKEY_PRESETS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function TypeTextEditor({
  node,
  onPatch,
  disabled,
}: {
  node: TypeTextNode;
  onPatch: (p: Partial<TypeTextNode>) => void;
  disabled: boolean;
}) {
  return (
    <>
      <TextInputRow
        label="Text"
        value={node.text}
        onChange={(text) => onPatch({ text })}
        disabled={disabled}
        placeholder="Hello {iterations}"
        multiline
      />
      <label className="flex items-center justify-between gap-4">
        <span className="label-muted">Per-char delay (ms)</span>
        <Stepper
          value={node.perCharDelayMs}
          onChange={(perCharDelayMs) => onPatch({ perCharDelayMs })}
          min={0}
          max={500}
          step={1}
          disabled={disabled}
        />
      </label>
      <div className="hairline p-3 label-muted">
        Types the literal string via Unicode events — supports templating like{' '}
        <code>{'{varName}'}</code>.
      </div>
    </>
  );
}

function ScreenshotEditor({
  node,
  onPatch,
  disabled,
}: {
  node: ScreenshotNode;
  onPatch: (p: Partial<ScreenshotNode>) => void;
  disabled: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const pick = async () => {
    if (picking || disabled) return;
    setPicking(true);
    try {
      const res = await window.clik.startRegionPicker();
      if (res.ok && res.rect) onPatch({ region: res.rect });
    } finally {
      setPicking(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-2">
        <span className="label-muted">Region</span>
        {node.region ? (
          <div className="font-mono text-[12px] text-[var(--color-cream)]">
            {node.region.w}×{node.region.h} pt · origin {node.region.x}, {node.region.y}
          </div>
        ) : (
          <div className="label-muted">Whole primary display</div>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            className="btn-ghost"
            onClick={pick}
            disabled={picking || disabled}
          >
            {picking ? 'Pick…' : 'Pick region'}
          </button>
          {node.region && (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => onPatch({ region: null })}
              disabled={disabled}
            >
              Use whole display
            </button>
          )}
        </div>
      </div>
      <label className="flex items-center justify-between gap-4">
        <span className="label-muted">Copy to clipboard</span>
        <input
          type="checkbox"
          checked={node.toClipboard}
          onChange={(e) => onPatch({ toClipboard: e.target.checked })}
          disabled={disabled}
        />
      </label>
      <label className="flex items-center justify-between gap-4">
        <span className="label-muted">Save to disk</span>
        <input
          type="checkbox"
          checked={node.saveToDisk}
          onChange={(e) => onPatch({ saveToDisk: e.target.checked })}
          disabled={disabled}
        />
      </label>
      {node.saveToDisk && (
        <VarNameInput
          label="Path var"
          value={node.pathVar ?? ''}
          onChange={(v) => onPatch({ pathVar: v || undefined })}
          disabled={disabled}
        />
      )}
    </>
  );
}

function TargetEditor({
  target,
  onChange,
  disabled,
  allowCursor = true,
}: {
  target: ClickTarget;
  onChange: (t: ClickTarget) => void;
  disabled: boolean;
  allowCursor?: boolean;
}) {
  const [picking, setPicking] = useState(false);

  const pickFixed = async () => {
    if (picking || disabled) return;
    setPicking(true);
    try {
      const res = await window.clik.startPicker();
      if (res.ok) onChange({ kind: 'fixed', x: res.x, y: res.y });
    } finally {
      setPicking(false);
    }
  };

  const options: Array<{ value: ClickTarget['kind']; label: string }> = [
    { value: 'fixed', label: 'Fixed' },
    ...(allowCursor ? [{ value: 'cursor' as const, label: 'Cursor' }] : []),
    { value: 'last-match', label: 'Last match' },
    { value: 'variable', label: 'Vars' },
  ];

  return (
    <div className="flex flex-col gap-3">
      <span className="label-muted">Target</span>
      <Segment<ClickTarget['kind']>
        value={target.kind}
        onChange={(kind) => {
          if (kind === 'fixed') {
            onChange({
              kind: 'fixed',
              x: target.kind === 'fixed' ? target.x : 200,
              y: target.kind === 'fixed' ? target.y : 200,
            });
          } else if (kind === 'cursor') {
            onChange({ kind: 'cursor' });
          } else if (kind === 'last-match') {
            onChange({
              kind: 'last-match',
              offsetX: target.kind === 'last-match' ? target.offsetX : 0,
              offsetY: target.kind === 'last-match' ? target.offsetY : 0,
            });
          } else {
            onChange({
              kind: 'variable',
              xVar: target.kind === 'variable' ? target.xVar : 'x',
              yVar: target.kind === 'variable' ? target.yVar : 'y',
            });
          }
        }}
        options={options}
      />

      {target.kind === 'fixed' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <span className="label-muted">X</span>
            <Stepper
              value={target.x}
              onChange={(x) => onChange({ kind: 'fixed', x, y: target.y })}
              min={-4000}
              max={8000}
              step={1}
              disabled={disabled}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="label-muted">Y</span>
            <Stepper
              value={target.y}
              onChange={(y) => onChange({ kind: 'fixed', x: target.x, y })}
              min={-4000}
              max={8000}
              step={1}
              disabled={disabled}
            />
          </div>
          <button
            type="button"
            className="btn-ghost"
            onClick={pickFixed}
            disabled={picking || disabled}
          >
            {picking ? 'Pick — move pointer…' : 'Pick on screen'}
          </button>
        </div>
      )}

      {target.kind === 'last-match' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <span className="label-muted">Offset X</span>
            <Stepper
              value={target.offsetX ?? 0}
              onChange={(offsetX) =>
                onChange({ kind: 'last-match', offsetX, offsetY: target.offsetY ?? 0 })
              }
              min={-500}
              max={500}
              step={1}
              disabled={disabled}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="label-muted">Offset Y</span>
            <Stepper
              value={target.offsetY ?? 0}
              onChange={(offsetY) =>
                onChange({ kind: 'last-match', offsetX: target.offsetX ?? 0, offsetY })
              }
              min={-500}
              max={500}
              step={1}
              disabled={disabled}
            />
          </div>
        </div>
      )}

      {target.kind === 'variable' && (
        <div className="grid grid-cols-2 gap-3">
          <VarNameInput
            label="X var"
            value={target.xVar}
            onChange={(xVar) =>
              onChange({ kind: 'variable', xVar, yVar: target.yVar })
            }
            disabled={disabled}
          />
          <VarNameInput
            label="Y var"
            value={target.yVar}
            onChange={(yVar) =>
              onChange({ kind: 'variable', xVar: target.xVar, yVar })
            }
            disabled={disabled}
          />
        </div>
      )}

      {target.kind === 'cursor' && (
        <div className="hairline p-3 label-muted">
          Uses the live cursor location at the moment the click fires.
        </div>
      )}
    </div>
  );
}

function FindEditor({
  node,
  onPatch,
  disabled,
}: {
  node: FindNode;
  onPatch: (p: Partial<FindNode>) => void;
  disabled: boolean;
}) {
  return (
    <TemplateSearchEditor
      template={node.template}
      searchRegion={node.searchRegion}
      threshold={node.threshold}
      onTemplate={(template) => onPatch({ template })}
      onRegion={(searchRegion) => onPatch({ searchRegion })}
      onThreshold={(threshold) => onPatch({ threshold })}
      disabled={disabled}
    />
  );
}

function WaitUntilEditor({
  node,
  onPatch,
  disabled,
  label,
}: {
  node: WaitUntilFoundNode | WaitUntilGoneNode;
  onPatch: (p: Partial<WaitUntilFoundNode | WaitUntilGoneNode>) => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <>
      <TemplateSearchEditor
        template={node.template}
        searchRegion={node.searchRegion}
        threshold={node.threshold}
        onTemplate={(template) => onPatch({ template })}
        onRegion={(searchRegion) => onPatch({ searchRegion })}
        onThreshold={(threshold) => onPatch({ threshold })}
        disabled={disabled}
      />
      <label className="flex items-center justify-between gap-4">
        <span className="label-muted">Poll (ms)</span>
        <Stepper
          value={node.intervalMs}
          onChange={(intervalMs) => onPatch({ intervalMs })}
          min={10}
          max={60_000}
          step={50}
          disabled={disabled}
        />
      </label>
      <label className="flex items-center justify-between gap-4">
        <span className="label-muted">Timeout (ms)</span>
        <Stepper
          value={node.timeoutMs}
          onChange={(timeoutMs) => onPatch({ timeoutMs })}
          min={100}
          max={10 * 60_000}
          step={500}
          disabled={disabled}
        />
      </label>
      <div className="hairline p-3 label-muted">
        Polls the search region until the template {label === 'appear' ? 'appears' : 'disappears'}{' '}
        or the timeout elapses.
      </div>
    </>
  );
}

function TemplateSearchEditor({
  template,
  searchRegion,
  threshold,
  onTemplate,
  onRegion,
  onThreshold,
  disabled,
}: {
  template: AutonomyTemplate | null;
  searchRegion: AutonomyRect | null;
  threshold: number;
  onTemplate: (t: AutonomyTemplate | null) => void;
  onRegion: (r: AutonomyRect | null) => void;
  onThreshold: (n: number) => void;
  disabled: boolean;
}) {
  const [capturing, setCapturing] = useState(false);
  const [pickingRegion, setPickingRegion] = useState(false);

  const captureTemplate = async () => {
    if (capturing || disabled) return;
    setCapturing(true);
    try {
      const region = await window.clik.startRegionPicker();
      if (!region.ok || !region.rect) return;
      const cap = await window.clik.autonomyCapture(region.rect);
      if (!cap.ok || !cap.png) return;
      const next: AutonomyTemplate = {
        png: cap.png,
        widthPoints: cap.widthPoints ?? region.rect.w,
        heightPoints: cap.heightPoints ?? region.rect.h,
        widthPx: cap.widthPx ?? region.rect.w,
        heightPx: cap.heightPx ?? region.rect.h,
      };
      onTemplate(next);
    } finally {
      setCapturing(false);
    }
  };

  const pickSearchRegion = async () => {
    if (pickingRegion || disabled) return;
    setPickingRegion(true);
    try {
      const region = await window.clik.startRegionPicker();
      if (region.ok && region.rect) onRegion(region.rect);
    } finally {
      setPickingRegion(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-3">
        <span className="label-muted">Template</span>
        {template ? (
          <div className="hairline p-3 flex items-center gap-3">
            <img
              src={`data:image/png;base64,${template.png}`}
              alt="Template"
              style={{
                maxWidth: 96,
                maxHeight: 64,
                border: '1px solid var(--color-line)',
                imageRendering: 'pixelated',
              }}
            />
            <div className="flex-1 min-w-0">
              <div className="font-mono text-[12px] text-[var(--color-cream)]">
                {template.widthPoints}×{template.heightPoints} pt
              </div>
              <div className="label-muted">
                {template.widthPx}×{template.heightPx} px
              </div>
            </div>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => onTemplate(null)}
              disabled={disabled}
            >
              Clear
            </button>
          </div>
        ) : (
          <div className="hairline p-3 label-muted">
            No template. Capture a region to teach the flow what to look for.
          </div>
        )}
        <button
          type="button"
          className="btn-ghost"
          onClick={captureTemplate}
          disabled={capturing || disabled}
        >
          {capturing ? 'Pick a region…' : 'Capture template'}
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <span className="label-muted">Search region</span>
        {searchRegion ? (
          <div className="font-mono text-[12px] text-[var(--color-cream)]">
            {searchRegion.w}×{searchRegion.h} pt · origin {searchRegion.x}, {searchRegion.y}
          </div>
        ) : (
          <div className="label-muted">Whole primary display</div>
        )}
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="btn-ghost"
            onClick={pickSearchRegion}
            disabled={pickingRegion || disabled}
          >
            {pickingRegion ? 'Pick a region…' : 'Pick search region'}
          </button>
          {searchRegion && (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => onRegion(null)}
              disabled={disabled}
            >
              Use whole display
            </button>
          )}
        </div>
      </div>

      <label className="flex items-center justify-between gap-4">
        <span className="label-muted">Threshold</span>
        <Stepper
          value={threshold}
          onChange={onThreshold}
          min={0}
          max={1}
          step={0.05}
          decimals={2}
          disabled={disabled}
        />
      </label>
    </>
  );
}

function BranchEditor({
  node,
  onPatch,
  disabled,
}: {
  node: BranchNode;
  onPatch: (p: Partial<BranchNode>) => void;
  disabled: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const [sampling, setSampling] = useState(false);

  const pickPixel = async () => {
    if (picking || disabled) return;
    setPicking(true);
    try {
      const res = await window.clik.startPicker();
      if (res.ok) onPatch({ px: res.x, py: res.y });
    } finally {
      setPicking(false);
    }
  };

  const samplePixel = async () => {
    if (sampling || disabled || node.px === undefined || node.py === undefined) return;
    setSampling(true);
    try {
      const res = await window.clik.autonomySample({ x: node.px, y: node.py });
      if (res.ok) onPatch({ r: res.r, g: res.g, b: res.b });
    } finally {
      setSampling(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-2">
        <span className="label-muted">Condition</span>
        <select
          className="bg-[var(--color-ink)] border border-[var(--color-line)] px-3 py-2 font-mono text-[12px] text-[var(--color-cream)] w-full"
          value={node.condition}
          onChange={(e) =>
            onPatch({ condition: e.target.value as BranchNode['condition'] })
          }
          disabled={disabled}
        >
          <option value="last-found">Last match</option>
          <option value="pixel-color">Pixel color</option>
          <option value="var-compare">Var compare</option>
          <option value="iteration">Iteration</option>
        </select>
      </div>

      {node.condition === 'last-found' && (
        <div className="hairline p-3 label-muted">
          Goes down the "True" port if the most recent Find node matched, "False" otherwise.
        </div>
      )}

      {node.condition === 'pixel-color' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <span className="label-muted">Point</span>
            <div className="font-mono text-[12px] text-[var(--color-cream)]">
              {node.px !== undefined && node.py !== undefined ? `${node.px}, ${node.py}` : '—'}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="btn-ghost"
              onClick={pickPixel}
              disabled={picking || disabled}
            >
              {picking ? 'Pick…' : 'Pick pixel'}
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={samplePixel}
              disabled={
                sampling ||
                disabled ||
                node.px === undefined ||
                node.py === undefined
              }
            >
              {sampling ? 'Sampling…' : 'Sample color'}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <ColorStepper
              label="R"
              value={node.r ?? 0}
              onChange={(r) => onPatch({ r })}
              disabled={disabled}
            />
            <ColorStepper
              label="G"
              value={node.g ?? 0}
              onChange={(g) => onPatch({ g })}
              disabled={disabled}
            />
            <ColorStepper
              label="B"
              value={node.b ?? 0}
              onChange={(b) => onPatch({ b })}
              disabled={disabled}
            />
          </div>

          <div className="flex items-center gap-3">
            <span
              className="inline-block w-5 h-5 border border-[var(--color-line)]"
              style={{
                background: `rgb(${node.r ?? 0}, ${node.g ?? 0}, ${node.b ?? 0})`,
              }}
            />
            <span className="label-muted">
              rgb({node.r ?? 0}, {node.g ?? 0}, {node.b ?? 0})
            </span>
          </div>

          <label className="flex items-center justify-between gap-4">
            <span className="label-muted">Tolerance</span>
            <Stepper
              value={node.tolerance ?? 16}
              onChange={(tolerance) => onPatch({ tolerance })}
              min={0}
              max={128}
              step={1}
              disabled={disabled}
            />
          </label>
        </div>
      )}

      {node.condition === 'var-compare' && (
        <div className="flex flex-col gap-3">
          <VarNameInput
            value={node.varName ?? ''}
            onChange={(varName) => onPatch({ varName })}
            disabled={disabled}
          />
          <div className="flex flex-col gap-2">
            <span className="label-muted">Operator</span>
            <Segment<VarCompareOp>
              value={node.op ?? '=='}
              onChange={(op) => onPatch({ op })}
              options={[
                { value: '==', label: '==' },
                { value: '!=', label: '≠' },
                { value: '<', label: '<' },
                { value: '<=', label: '≤' },
                { value: '>', label: '>' },
                { value: '>=', label: '≥' },
              ]}
            />
          </div>
          <TextInputRow
            label="Compare to"
            value={node.compareTo ?? ''}
            onChange={(compareTo) => onPatch({ compareTo })}
            disabled={disabled}
            placeholder="number or string"
          />
        </div>
      )}

      {node.condition === 'iteration' && (
        <>
          <label className="flex items-center justify-between gap-4">
            <span className="label-muted">Every N</span>
            <Stepper
              value={node.every ?? 1}
              onChange={(every) => onPatch({ every })}
              min={1}
              max={10_000}
              step={1}
              disabled={disabled}
            />
          </label>
          <div className="hairline p-3 label-muted">
            Routes to <strong>true</strong> when iteration count is a multiple of N.
          </div>
        </>
      )}
    </>
  );
}

function ColorStepper({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="label-muted">{label}</span>
      <Stepper
        value={value}
        onChange={onChange}
        min={0}
        max={255}
        step={1}
        disabled={disabled}
        size="sm"
      />
    </div>
  );
}
