import { useStore } from '../store';
import { formatAccelerator } from '../lib/hotkey';
import type { HotkeyTarget } from '../../../shared/types';

export function StatusBar() {
  const status = useStore((s) => s.status);
  const button = useStore((s) => s.button);
  const target = useStore((s) => s.target);
  const lastError = useStore((s) => s.lastError);
  const route = useStore((s) => s.route);
  const hotkeys = useStore((s) => s.hotkeys);

  // Surface the hotkey for the workspace the user is looking at; the run log
  // is informational so we fall back to the clicker slot there.
  const activeTarget: HotkeyTarget =
    route === 'sequence' ? 'sequence' : route === 'autonomy' ? 'autonomy' : 'clicker';
  const hotkey = hotkeys[activeTarget];

  const buttonLabel = `${button}-click`.toUpperCase();
  const targetLabel = target.kind === 'cursor' ? 'CURSOR' : target.kind === 'fixed' ? `(${target.x}, ${target.y})` : 'SEQ';

  return (
    <footer className="h-[36px] border-t border-[var(--color-line)] flex items-center px-5 text-[10px] tracking-[0.2em] uppercase text-[var(--color-muted)]">
      <div className="flex items-center gap-3 text-[var(--color-cream-dim)]">
        <span
          className="inline-block w-[6px] h-[6px]"
          style={{
            background: status === 'running' ? 'var(--color-accent)' : 'var(--color-cream-dim)',
          }}
        />
        <span>{status === 'running' ? 'Firing' : 'Ready'}</span>
        <span className="text-[var(--color-muted)]">·</span>
        <span>{buttonLabel}</span>
        <span className="text-[var(--color-muted)]">·</span>
        <span>{targetLabel}</span>
        {lastError && (
          <>
            <span className="text-[var(--color-muted)]">·</span>
            <span style={{ color: 'var(--color-danger)' }}>{lastError}</span>
          </>
        )}
      </div>
      <div className="ml-auto flex items-center gap-4">
        <span title="Global start/stop hotkey">{formatAccelerator(hotkey)} Toggle</span>
        <span>·</span>
        <span>⏎ Fire</span>
        <span>·</span>
        <span>Esc Cancel</span>
      </div>
    </footer>
  );
}
