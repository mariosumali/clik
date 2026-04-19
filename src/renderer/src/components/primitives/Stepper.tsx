import { useState, type ChangeEvent } from 'react';

interface StepperProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  pad?: number;
  decimals?: number;
  className?: string;
  disabled?: boolean;
  size?: 'md' | 'sm';
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  pad,
  decimals = 0,
  className,
  disabled,
  size = 'md',
}: StepperProps) {
  const [draft, setDraft] = useState<string | null>(null);

  const round = (n: number) => {
    if (decimals <= 0) return Math.floor(n);
    const f = 10 ** decimals;
    return Math.round(n * f) / f;
  };
  const clamp = (n: number) => Math.max(min, Math.min(max, round(n)));

  const format = (n: number) => (decimals > 0 ? n.toFixed(decimals) : n.toString());
  const display = draft ?? (pad ? format(value).padStart(pad, '0') : format(value));

  const commit = (raw: string) => {
    const n = decimals > 0 ? Number.parseFloat(raw) : Number.parseInt(raw, 10);
    if (Number.isFinite(n)) onChange(clamp(n));
    else onChange(clamp(value));
    setDraft(null);
  };

  return (
    <div className={`stepper ${size === 'sm' ? 'stepper--sm' : ''} ${className ?? ''}`}>
      <button
        type="button"
        aria-label="decrement"
        disabled={disabled || value <= min}
        onClick={() => onChange(clamp(value - step))}
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={display}
        disabled={disabled}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          const allowed = decimals > 0 ? /[^\d.-]/g : /[^\d-]/g;
          const v = e.target.value.replace(allowed, '');
          setDraft(v);
        }}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            onChange(clamp(value + step));
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            onChange(clamp(value - step));
          }
        }}
      />
      <button
        type="button"
        aria-label="increment"
        disabled={disabled || value >= max}
        onClick={() => onChange(clamp(value + step))}
      >
        +
      </button>
    </div>
  );
}
