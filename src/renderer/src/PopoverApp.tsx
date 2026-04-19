import { useCallback, useEffect } from 'react';
import { useStore } from './store';
import { Stepper } from './components/primitives/Stepper';
import { Segment } from './components/primitives/Segment';
import { formatAccelerator } from './lib/hotkey';
import { formatCps, formatElapsed, cadenceToMs } from './lib/format';
import type { MouseButton } from '../../shared/types';

export function PopoverApp() {
  const cadence = useStore((s) => s.cadence);
  const setCadence = useStore((s) => s.setCadence);
  const button = useStore((s) => s.button);
  const setButton = useStore((s) => s.setButton);
  const status = useStore((s) => s.status);
  const clicks = useStore((s) => s.clicks);
  const elapsedMs = useStore((s) => s.elapsedMs);
  const target = useStore((s) => s.target);
  const applyTick = useStore((s) => s.applyTick);
  const startStopHotkey = useStore((s) => s.startStopHotkey);
  const setStartStopHotkey = useStore((s) => s.setStartStopHotkey);

  const intervalMs = Math.max(1, cadenceToMs(cadence));

  const fire = useCallback(async () => {
    const state = useStore.getState();
    if (state.status === 'running') return;
    const perm = await window.clik.checkPermission();
    if (!perm.trusted) {
      applyTick({ status: 'idle', clicks: 0, elapsedMs: 0, intervalMs: 0, lastError: 'grant-accessibility' });
      return;
    }
    await window.clik.start(state.getConfig());
  }, [applyTick]);

  const cancel = useCallback(() => {
    window.clik.stop();
  }, []);

  useEffect(() => {
    const offTick = window.clik.onTick((t) => applyTick(t));
    const offHotkey = window.clik.onHotkey((n) => {
      if (n === 'fire') fire();
      if (n === 'cancel') cancel();
    });
    const offStatus = window.clik.onHotkeyStatus((reg) => {
      if (reg.ok && reg.accelerator && reg.accelerator !== useStore.getState().startStopHotkey) {
        setStartStopHotkey(reg.accelerator);
      }
    });
    return () => { offTick(); offHotkey(); offStatus(); };
  }, [applyTick, fire, cancel, setStartStopHotkey]);

  // Ensure the main process registration mirrors the persisted value on popover open.
  useEffect(() => {
    window.clik.setStartStopHotkey(startStopHotkey).catch(() => undefined);
  }, [startStopHotkey]);

  useEffect(() => {
    if (status !== 'running') return;
    const id = setInterval(() => {
      const st = useStore.getState();
      if (st.status !== 'running') return;
      useStore.setState({ elapsedMs: st.elapsedMs + 100 });
    }, 100);
    return () => clearInterval(id);
  }, [status]);

  // Esc closes the popover; Enter toggles fire/stop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && ['INPUT', 'TEXTAREA'].includes(t.tagName)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        window.clik.hidePopover();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (status === 'running') cancel();
        else fire();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [status, fire, cancel]);

  const running = status === 'running';

  return (
    <div
      className="flex flex-col h-screen w-screen select-none"
      style={{
        background: 'var(--color-ink)',
        border: '1px solid var(--color-line)',
        color: 'var(--color-cream)',
      }}
    >
      <header className="px-4 pt-4 pb-3 flex items-center justify-between border-b border-[var(--color-line)]">
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-[7px] h-[7px]"
            style={{ background: running ? 'var(--color-accent)' : 'var(--color-cream-dim)' }}
          />
          <span className="label">{running ? 'Running' : 'Idle'}</span>
        </div>
        <button
          type="button"
          className="label-muted hover:text-[var(--color-cream)]"
          onClick={() => window.clik.showMainWindow()}
        >
          Open full app ↗
        </button>
      </header>

      <section className="px-4 py-3">
        <div className="label-muted mb-1">Interval</div>
        <div className="grid grid-cols-[1fr_auto] items-center gap-3">
          <div className="flex items-center gap-2">
            <Stepper
              value={cadence.millis + cadence.seconds * 1000}
              min={1}
              max={60 * 60 * 1000}
              step={10}
              onChange={(ms) => {
                const sec = Math.floor(ms / 1000);
                const millis = ms - sec * 1000;
                setCadence({ seconds: sec, millis });
              }}
            />
            <span className="label-muted">ms</span>
          </div>
          <div className="text-right">
            <div className="font-display text-[22px] leading-none">{formatCps(intervalMs)}</div>
            <div className="label-muted">cps</div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-3">
        <div className="label-muted mb-1">Button</div>
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

      <section className="px-4 pb-3">
        <button
          type="button"
          onClick={running ? cancel : fire}
          className="w-full py-3 font-mono tracking-[0.1em]"
          style={{
            background: running ? 'var(--color-danger)' : 'var(--color-cream)',
            color: running ? 'var(--color-cream)' : 'var(--color-ink)',
            border: 'none',
          }}
        >
          {running ? '■ STOP' : '● START'}
        </button>
      </section>

      <footer className="mt-auto px-4 py-3 border-t border-[var(--color-line)] grid grid-cols-3 gap-3">
        <Stat label="Clicks" value={clicks.toLocaleString('en-US')} />
        <Stat label="Elapsed" value={formatElapsed(elapsedMs)} />
        <Stat
          label="Hotkey"
          value={formatAccelerator(startStopHotkey)}
          title={startStopHotkey}
        />
      </footer>

      {target.kind !== 'cursor' && (
        <div className="absolute top-2 right-2 label-muted">target: {target.kind}</div>
      )}
    </div>
  );
}

function Stat({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div>
      <div className="label-muted mb-1">{label}</div>
      <div
        className="font-mono text-[12px] leading-none tracking-[0.04em] text-[var(--color-cream)]"
        title={title}
        style={{ wordBreak: 'keep-all', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {value}
      </div>
    </div>
  );
}
