import { useStore } from '../../store';

interface StartButtonProps {
  onFire: () => void;
  onCancel: () => void;
}

export function StartButton({ onFire, onCancel }: StartButtonProps) {
  const status = useStore((s) => s.status);
  const running = status === 'running';

  return (
    <button
      type="button"
      onClick={running ? onCancel : onFire}
      className="no-drag flex items-center justify-between gap-6 px-6 h-14 w-full border border-[var(--color-cream)]"
      style={{
        background: running ? 'var(--color-danger)' : 'var(--color-cream)',
        color: 'var(--color-ink)',
      }}
    >
      <span className="flex items-center gap-3">
        <span
          className="inline-block rounded-full"
          style={{
            width: 14,
            height: 14,
            background: 'var(--color-ink)',
            boxShadow: running ? '0 0 0 3px rgba(0,0,0,0.15)' : undefined,
          }}
        />
        <span className="font-display text-[26px] leading-none">{running ? 'Stop' : 'Start'}</span>
      </span>
      <span className="label-muted" style={{ color: 'var(--color-ink)', opacity: 0.6 }}>
        {running ? 'ESC' : '⇧⌘K'}
      </span>
    </button>
  );
}
