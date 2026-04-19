import { useState } from 'react';
import { Segment } from '../primitives/Segment';
import { Stepper } from '../primitives/Stepper';
import { useStore } from '../../store';

type TargetKind = 'cursor' | 'fixed' | 'sequence';

export function TargetCard() {
  const target = useStore((s) => s.target);
  const setTarget = useStore((s) => s.setTarget);
  const [picking, setPicking] = useState(false);

  const kind: TargetKind = target.kind;

  async function handlePick() {
    if (picking) return;
    setPicking(true);
    try {
      const res = await window.clik.startPicker();
      if (res.ok) setTarget({ kind: 'fixed', x: res.x, y: res.y });
    } finally {
      setPicking(false);
    }
  }

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between mb-5">
        <div className="label">
          <span className="text-[var(--color-muted)] mr-2">03</span>· Target
        </div>
        <div className="label-muted">Where to click</div>
      </div>

      <div className="flex flex-col gap-4">
        <Segment<TargetKind>
          value={kind}
          onChange={(next) => {
            if (next === 'cursor') setTarget({ kind: 'cursor' });
            else if (next === 'fixed')
              setTarget({
                kind: 'fixed',
                x: target.kind === 'fixed' ? target.x : 200,
                y: target.kind === 'fixed' ? target.y : 200,
              });
          }}
          options={[
            { value: 'cursor', label: 'Cursor' },
            { value: 'fixed', label: 'Fixed' },
            { value: 'sequence', label: 'Sequence', disabled: true },
          ]}
        />

        {kind === 'cursor' && (
          <div className="hairline p-3 text-[var(--color-cream-dim)]">
            <span className="label-muted">Follows cursor position</span>
          </div>
        )}

        {kind === 'fixed' && target.kind === 'fixed' && (
          <>
            <div className="grid grid-cols-2 gap-6">
              <label className="flex flex-col gap-2">
                <span className="label-muted">X</span>
                <Stepper
                  value={target.x}
                  onChange={(x) => setTarget({ kind: 'fixed', x, y: target.y })}
                  min={0}
                  max={10_000}
                  step={10}
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="label-muted">Y</span>
                <Stepper
                  value={target.y}
                  onChange={(y) => setTarget({ kind: 'fixed', x: target.x, y })}
                  min={0}
                  max={10_000}
                  step={10}
                />
              </label>
            </div>
            <button
              type="button"
              className="btn-ghost"
              onClick={handlePick}
              disabled={picking}
            >
              {picking ? 'Pick — move pointer…' : 'Pick on screen'}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
