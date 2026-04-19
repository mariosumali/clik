import { useCallback, useEffect, useRef, useState } from 'react';
import { acceleratorFromEvent, formatAccelerator, isValidAccelerator } from '../../lib/hotkey';

interface HotkeyRecorderProps {
  value: string;
  onChange: (accelerator: string) => void;
  onValidate?: (accelerator: string) => Promise<{ ok: boolean; err?: string }>;
  defaultValue?: string;
}

export function HotkeyRecorder({ value, onChange, onValidate, defaultValue }: HotkeyRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const stopRecording = useCallback(() => setRecording(false), []);

  const commit = useCallback(async (accelerator: string) => {
    if (!isValidAccelerator(accelerator)) {
      setErr('Add at least one modifier');
      return;
    }
    setErr(null);
    if (onValidate) {
      const res = await onValidate(accelerator);
      if (!res.ok) {
        setErr(res.err ?? 'Could not register');
        return;
      }
    }
    onChange(accelerator);
    setPending(null);
    setRecording(false);
  }, [onChange, onValidate]);

  useEffect(() => {
    if (!recording) return;

    const onKeyDown = (e: KeyboardEvent) => {
      // Show what would-be-saved while the user is still holding keys.
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setPending(null);
        setRecording(false);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const accel = acceleratorFromEvent(e);
      if (accel) setPending(accel);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      // Commit on release of any non-modifier key.
      const isNonModifier = !['Shift', 'Control', 'Alt', 'Meta', 'OS'].includes(e.key);
      if (isNonModifier && pending) {
        e.preventDefault();
        e.stopPropagation();
        commit(pending);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    };
  }, [recording, pending, commit]);

  const displayed = recording ? pending ?? 'Press a combo…' : formatAccelerator(value);

  return (
    <div className="flex items-center gap-3">
      <button
        ref={buttonRef}
        type="button"
        className="no-drag px-4 py-2 font-mono text-[13px] tracking-[0.08em]"
        onClick={() => {
          setPending(null);
          setErr(null);
          setRecording((r) => !r);
        }}
        onBlur={stopRecording}
        style={{
          minWidth: 160,
          border: `1px solid ${recording ? 'var(--color-accent)' : 'var(--color-cream)'}`,
          background: recording ? 'var(--color-ink-2)' : 'var(--color-ink)',
          color: 'var(--color-cream)',
        }}
      >
        {recording && pending ? formatAccelerator(pending) : displayed}
      </button>
      {recording && (
        <span className="label-muted">Esc to cancel · release to save</span>
      )}
      {!recording && defaultValue && value !== defaultValue && (
        <button
          type="button"
          className="btn-ghost no-drag"
          onClick={() => commit(defaultValue)}
        >
          Reset
        </button>
      )}
      {err && (
        <span className="label-muted" style={{ color: 'var(--color-danger)' }}>
          {err}
        </span>
      )}
    </div>
  );
}
