import { useState } from 'react';
import { Segment } from '../primitives/Segment';
import { Stepper } from '../primitives/Stepper';
import { useStore } from '../../store';
import type { MouseButton, StopCondition } from '../../../../shared/types';
import { formatClicks, formatElapsed, formatIntervalCompact } from '../../lib/format';
import { SequencePointRow } from './SequencePointRow';
import { WorkspaceHotkey } from '../Hotkeys/WorkspaceHotkey';

type StopKind = StopCondition['kind'];

interface SequencePageProps {
  onFire: () => void;
  onCancel: () => void;
}

export function SequencePage({ onFire, onCancel }: SequencePageProps) {
  const points = useStore((s) => s.sequencePoints);
  const button = useStore((s) => s.sequenceButton);
  const stop = useStore((s) => s.sequenceStop);
  const humanize = useStore((s) => s.sequenceHumanize);
  const status = useStore((s) => s.status);
  const clicks = useStore((s) => s.clicks);
  const elapsedMs = useStore((s) => s.elapsedMs);
  const lastError = useStore((s) => s.lastError);

  const addPoint = useStore((s) => s.addSequencePoint);
  const clearPoints = useStore((s) => s.clearSequencePoints);
  const setButton = useStore((s) => s.setSequenceButton);
  const setStop = useStore((s) => s.setSequenceStop);
  const toggleHumanize = useStore((s) => s.toggleSequenceHumanize);

  const running = status === 'running';
  const [pickingNew, setPickingNew] = useState(false);

  // While running, the clicker advances the index round-robin. We can't observe
  // the real index from the main process tick (it only reports count), so fall
  // back to clicks % points.length — correct as long as the user doesn't edit
  // the list mid-run (the row editors are disabled while running).
  const activeIndex = running && points.length > 0 ? clicks % points.length : -1;

  const handleAddFromPicker = async () => {
    if (pickingNew || running) return;
    setPickingNew(true);
    try {
      const res = await window.clik.startPicker();
      if (res.ok) addPoint({ x: res.x, y: res.y, dwellMs: 500 });
    } finally {
      setPickingNew(false);
    }
  };

  const totalDwellMs = points.reduce((acc, p) => acc + Math.max(1, p.dwellMs), 0);
  const canStart = points.length > 0;

  return (
    <div className="h-full overflow-y-auto px-10 pt-10 pb-6 max-w-[960px]">
      <header className="flex items-center justify-between gap-8 pb-8">
        <div className="label-muted">
          Workspace <span className="text-[var(--color-muted)]">·</span> Sequence
        </div>
        <div className="label-muted">
          {points.length} {points.length === 1 ? 'point' : 'points'}
          {points.length > 0 && (
            <>
              {' · '}
              <span className="text-[var(--color-cream-dim)]">
                {formatIntervalCompact(totalDwellMs)} / loop
              </span>
            </>
          )}
        </div>
      </header>

      <div className="flex flex-col gap-6">
        <section className="card p-5">
          <div className="flex items-center justify-between mb-5">
            <div className="label">
              <span className="text-[var(--color-muted)] mr-2">01</span>· Points
            </div>
            <div className="label-muted">Ordered list · loops forever</div>
          </div>

          {points.length === 0 ? (
            <div className="hairline p-6 text-center">
              <div className="label mb-2">No points yet</div>
              <div className="label-muted mb-5">
                Pick on screen or add a blank point to get started.
              </div>
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={handleAddFromPicker}
                  disabled={pickingNew}
                >
                  {pickingNew ? 'Pick — move pointer…' : 'Pick on screen'}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => addPoint()}
                >
                  Add blank
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {points.map((p, i) => (
                <SequencePointRow
                  key={p.id}
                  index={i}
                  point={p}
                  total={points.length}
                  active={i === activeIndex}
                  running={running}
                />
              ))}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={handleAddFromPicker}
                  disabled={pickingNew || running}
                >
                  {pickingNew ? 'Pick — move pointer…' : '+ Pick on screen'}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => addPoint()}
                  disabled={running}
                >
                  + Add blank
                </button>
                <button
                  type="button"
                  className="btn-ghost ml-auto"
                  onClick={clearPoints}
                  disabled={running}
                  style={{ color: 'var(--color-danger)' }}
                >
                  Clear
                </button>
              </div>
            </div>
          )}
        </section>

        <div className="grid grid-cols-2 gap-6">
          <section className="card p-5">
            <div className="flex items-center justify-between mb-5">
              <div className="label">
                <span className="text-[var(--color-muted)] mr-2">02</span>· Button
              </div>
              <div className="label-muted">Mouse action</div>
            </div>
            <Segment<MouseButton>
              value={button}
              onChange={setButton}
              options={[
                { value: 'left', label: 'Left' },
                { value: 'right', label: 'Right' },
                { value: 'middle', label: 'Middle' },
              ]}
            />
          </section>

          <section className="card p-5">
            <div className="flex items-center justify-between mb-5">
              <div className="label">
                <span className="text-[var(--color-muted)] mr-2">03</span>· Jitter
              </div>
              <div className="label-muted">Optional</div>
            </div>
            <div className="flex items-center justify-between">
              <span className="label-muted">Humanize dwell (±25%)</span>
              <button
                type="button"
                className="switch"
                data-on={humanize}
                onClick={toggleHumanize}
                aria-label="Toggle humanize"
              />
            </div>
          </section>
        </div>

        <section className="card p-5">
          <div className="flex items-center justify-between mb-5">
            <div className="label">
              <span className="text-[var(--color-muted)] mr-2">04</span>· Stop condition
            </div>
            <div className="label-muted">When to halt</div>
          </div>

          <div className="flex flex-col gap-4">
            <Segment<StopKind>
              value={stop.kind}
              onChange={(next) => {
                if (next === 'off') setStop({ kind: 'off' });
                else if (next === 'after-clicks')
                  setStop({
                    kind: 'after-clicks',
                    count: stop.kind === 'after-clicks' ? stop.count : 100,
                  });
                else if (next === 'after-duration')
                  setStop({
                    kind: 'after-duration',
                    ms: stop.kind === 'after-duration' ? stop.ms : 60_000,
                  });
              }}
              options={[
                { value: 'off', label: 'Manual' },
                { value: 'after-clicks', label: 'After N' },
                { value: 'after-duration', label: 'After time' },
              ]}
            />

            {stop.kind === 'off' && (
              <div className="hairline p-3 text-[var(--color-cream-dim)]">
                <span className="label-muted">Runs until you cancel — ESC or Stop</span>
              </div>
            )}
            {stop.kind === 'after-clicks' && (
              <label className="flex items-center gap-4">
                <span className="label-muted">Clicks</span>
                <Stepper
                  value={stop.count}
                  onChange={(count) => setStop({ kind: 'after-clicks', count })}
                  min={1}
                  max={1_000_000}
                  step={10}
                />
              </label>
            )}
            {stop.kind === 'after-duration' && (
              <label className="flex items-center gap-4">
                <span className="label-muted">Seconds</span>
                <Stepper
                  value={Math.round(stop.ms / 1000)}
                  onChange={(sec) => setStop({ kind: 'after-duration', ms: sec * 1000 })}
                  min={1}
                  max={60 * 60 * 24}
                  step={5}
                />
              </label>
            )}
          </div>
        </section>

        <button
          type="button"
          onClick={running ? onCancel : onFire}
          disabled={!running && !canStart}
          className="no-drag relative flex items-center justify-center px-6 h-14 w-full border border-[var(--color-cream)] disabled:opacity-40"
          style={{
            background: running ? 'var(--color-danger)' : 'var(--color-cream)',
            color: 'var(--color-ink)',
          }}
        >
          <span className="font-display text-[26px] leading-none uppercase">
            {running ? 'Stop' : canStart ? 'Run sequence' : 'Add points to run'}
          </span>
          <span
            className="label-muted absolute right-6 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--color-ink)', opacity: 0.6 }}
          >
            {running ? 'ESC' : '⏎'}
          </span>
        </button>

        <div className="grid grid-cols-4 gap-10 pt-1">
          <Stat
            label="Points"
            value={points.length === 0 ? '—' : points.length.toString()}
          />
          <Stat
            label="Loop"
            value={points.length === 0 ? '—' : formatIntervalCompact(totalDwellMs)}
          />
          <Stat label="Clicks" value={formatClicks(clicks)} />
          <Stat label="Elapsed" value={formatElapsed(elapsedMs)} />
        </div>

        {lastError && !running && (
          <div
            className="hairline p-3"
            style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}
          >
            <span className="label-muted" style={{ color: 'var(--color-danger)' }}>
              {explainError(lastError)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="label-muted">{label}</span>
      <span className="font-mono text-[18px] tracking-[0.02em] text-[var(--color-cream)]">
        {value}
      </span>
    </div>
  );
}

function explainError(err: string): string {
  if (err === 'empty-sequence') return 'Add at least one point before running.';
  if (err === 'kill-zone') return 'Stopped: click landed in a kill zone.';
  if (err === 'grant-accessibility') return 'Grant Accessibility permission in System Settings.';
  return err;
}
