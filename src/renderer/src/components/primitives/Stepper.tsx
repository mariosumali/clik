import { useState, type ChangeEvent } from 'react';

interface StepperProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  pad?: number;
  className?: string;
  disabled?: boolean;
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  pad,
  className,
  disabled,
}: StepperProps) {
  const [draft, setDraft] = useState<string | null>(null);

  const clamp = (n: number) => Math.max(min, Math.min(max, Math.floor(n)));

  const display = draft ?? (pad ? value.toString().padStart(pad, '0') : value.toString());

  const commit = (raw: string) => {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n)) onChange(clamp(n));
    else onChange(clamp(value));
    setDraft(null);
  };

  return (
    <div className={`stepper ${className ?? ''}`}>
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
          const v = e.target.value.replace(/[^\d-]/g, '');
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
