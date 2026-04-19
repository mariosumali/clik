import { useState } from 'react';
import { Stepper } from '../primitives/Stepper';
import { useStore, type SequencePoint } from '../../store';

interface SequencePointRowProps {
  index: number;
  point: SequencePoint;
  total: number;
  active: boolean;
  running: boolean;
}

export function SequencePointRow({ index, point, total, active, running }: SequencePointRowProps) {
  const update = useStore((s) => s.updateSequencePoint);
  const remove = useStore((s) => s.removeSequencePoint);
  const move = useStore((s) => s.moveSequencePoint);
  const [picking, setPicking] = useState(false);

  const handlePick = async () => {
    if (picking || running) return;
    setPicking(true);
    try {
      const res = await window.clik.startPicker();
      if (res.ok) update(point.id, { x: res.x, y: res.y });
    } finally {
      setPicking(false);
    }
  };

  return (
    <div
      className="grid items-center gap-3 hairline px-3 py-3"
      style={{
        gridTemplateColumns: '38px 1fr 1fr 1fr auto auto',
        background: active ? 'var(--color-ink-2)' : undefined,
        borderColor: active ? 'var(--color-cream-dim)' : undefined,
      }}
    >
      <div className="flex flex-col items-center gap-0.5">
        <span className="font-mono text-[13px] text-[var(--color-cream)]">
          {(index + 1).toString().padStart(2, '0')}
        </span>
        <div className="flex flex-col gap-[1px]">
          <button
            type="button"
            className="icon-btn"
            style={{ width: 18, height: 14 }}
            aria-label="Move up"
            disabled={running || index === 0}
            onClick={() => move(point.id, -1)}
            title="Move up"
          >
            <Caret dir="up" />
          </button>
          <button
            type="button"
            className="icon-btn"
            style={{ width: 18, height: 14 }}
            aria-label="Move down"
            disabled={running || index === total - 1}
            onClick={() => move(point.id, 1)}
            title="Move down"
          >
            <Caret dir="down" />
          </button>
        </div>
      </div>

      <label className="flex flex-col gap-1">
        <span className="label-muted">X</span>
        <Stepper
          value={point.x}
          onChange={(x) => update(point.id, { x })}
          min={0}
          max={10_000}
          step={10}
          size="sm"
          disabled={running}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="label-muted">Y</span>
        <Stepper
          value={point.y}
          onChange={(y) => update(point.id, { y })}
          min={0}
          max={10_000}
          step={10}
          size="sm"
          disabled={running}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="label-muted">Dwell (ms)</span>
        <Stepper
          value={point.dwellMs}
          onChange={(dwellMs) => update(point.id, { dwellMs })}
          min={1}
          max={600_000}
          step={50}
          size="sm"
          disabled={running}
        />
      </label>

      <button
        type="button"
        className="btn-ghost"
        onClick={handlePick}
        disabled={running || picking}
        title="Pick this point's position on screen"
      >
        {picking ? 'Pick…' : 'Pick'}
      </button>

      <button
        type="button"
        className="icon-btn"
        onClick={() => remove(point.id)}
        disabled={running}
        aria-label="Remove point"
        title="Remove point"
      >
        <Cross />
      </button>
    </div>
  );
}

function Caret({ dir }: { dir: 'up' | 'down' }) {
  return (
    <svg width="8" height="5" viewBox="0 0 8 5" aria-hidden>
      <path
        d={dir === 'up' ? 'M1 4 L4 1 L7 4' : 'M1 1 L4 4 L7 1'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function Cross() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      <path d="M1 1 L9 9 M9 1 L1 9" stroke="currentColor" strokeWidth="1.2" fill="none" />
    </svg>
  );
}
