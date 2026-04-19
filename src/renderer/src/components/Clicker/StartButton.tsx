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
      className="no-drag relative flex items-center justify-center px-6 h-14 w-full border border-[var(--color-cream)]"
      style={{
        background: running ? 'var(--color-danger)' : 'var(--color-cream)',
        color: 'var(--color-ink)',
      }}
    >
      <span className="font-display text-[26px] leading-none uppercase">{running ? 'Stop' : 'Start'}</span>
      <span
        className="label-muted absolute right-6"
        style={{ color: 'var(--color-ink)', opacity: 0.6 }}
      >
        {running ? 'ESC' : '⇧⌘K'}
      </span>
    </button>
  );
}
