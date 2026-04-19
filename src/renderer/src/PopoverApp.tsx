import { useCallback, useEffect, useState } from 'react';
import { useStore } from './store';
import { Stepper } from './components/primitives/Stepper';
import { Segment } from './components/primitives/Segment';
import { formatAccelerator } from './lib/hotkey';
import { formatCps, formatElapsed, cadenceToMs } from './lib/format';
import type { ClickKind, MouseButton, StopCondition, Target } from '../../shared/types';

type StopKind = StopCondition['kind'];
type TargetKind = Target['kind'];

export function PopoverApp() {
  const cadence = useStore((s) => s.cadence);
  const setCadence = useStore((s) => s.setCadence);
  const button = useStore((s) => s.button);
  const setButton = useStore((s) => s.setButton);
  const kind = useStore((s) => s.kind);
  const setKind = useStore((s) => s.setKind);
  const target = useStore((s) => s.target);
  const setTarget = useStore((s) => s.setTarget);
  const stop = useStore((s) => s.stop);
  const setStop = useStore((s) => s.setStop);
  const humanize = useStore((s) => s.humanize);
  const toggleHumanize = useStore((s) => s.toggleHumanize);
  const status = useStore((s) => s.status);
  const clicks = useStore((s) => s.clicks);
  const elapsedMs = useStore((s) => s.elapsedMs);
  const lastError = useStore((s) => s.lastError);
  const applyTick = useStore((s) => s.applyTick);
  // The popover only ever drives the clicker workspace, so it shows the clicker
  // slot of the per-workspace hotkey map.
  const clickerHotkey = useStore((s) => s.hotkeys.clicker);
  const hotkeys = useStore((s) => s.hotkeys);
  const setHotkey = useStore((s) => s.setHotkey);
  const lastRun = useStore((s) => s.runLog[0]);
  // Appearance preferences — mirrored from the full-window App so the popover
  // picks up the exact same theme, accent, density, and reduced-motion state
  // the user has configured in Settings. Without these, the popover would
  // always render with the built-in dark defaults regardless of user choice.
  const accent = useStore((s) => s.accent);
  const density = useStore((s) => s.density);
  const reduceMotion = useStore((s) => s.reduceMotion);
  const theme = useStore((s) => s.theme);

  const [picking, setPicking] = useState(false);

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
    // The popover cares about the clicker slot only — sequence / autonomy fire
    // events would have no config to start from here. The main process stops
    // runners itself, so we never see a 'cancel' action.
    const offHotkey = window.clik.onHotkey(({ target, action }) => {
      if (action !== 'fire') return;
      if (target === 'clicker') fire();
    });
    const offStatus = window.clik.onHotkeyStatus((reg) => {
      if (!reg.ok) return;
      const persisted = useStore.getState().hotkeys[reg.target];
      if (reg.accelerator && reg.accelerator !== persisted) {
        setHotkey(reg.target, reg.accelerator);
      }
    });
    return () => { offTick(); offHotkey(); offStatus(); };
  }, [applyTick, fire, setHotkey]);

  // Re-register every slot with main on popover open. The popover and main
  // window share the same store, so registering here is idempotent.
  useEffect(() => {
    (Object.entries(hotkeys) as Array<['clicker' | 'sequence' | 'autonomy', string]>).forEach(
      ([target, accel]) => {
        window.clik.setHotkey(target, accel).catch(() => undefined);
      },
    );
  }, [hotkeys]);

  // Mirror App.tsx's appearance wiring so opening the popover yields the same
  // palette, accent, density, and motion behavior as the main window — the two
  // windows each have their own DOM, so each has to apply the CSS variables
  // and data-attributes independently.
  useEffect(() => {
    document.documentElement.style.setProperty('--color-accent', accent);
  }, [accent]);

  useEffect(() => {
    document.body.dataset.density = density;
  }, [density]);

  useEffect(() => {
    document.body.dataset.reduceMotion = reduceMotion ? 'true' : 'false';
  }, [reduceMotion]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const apply = () => {
      const resolved =
        theme === 'system' ? (media.matches ? 'light' : 'dark') : theme;
      document.body.dataset.theme = resolved;
    };
    apply();
    if (theme !== 'system') return;
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

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

  const handlePick = useCallback(async () => {
    if (picking) return;
    setPicking(true);
    try {
      // Hide popover during the pick so it doesn't swallow the click.
      await window.clik.hidePopover();
      const res = await window.clik.startPicker();
      if (res.ok) setTarget({ kind: 'fixed', x: res.x, y: res.y });
    } finally {
      setPicking(false);
    }
  }, [picking, setTarget]);

  const running = status === 'running';

  return (
    <div
      className="flex flex-col h-screen w-screen select-none overflow-hidden"
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
            style={{
              background:
                status === 'error'
                  ? 'var(--color-danger)'
                  : running
                    ? 'var(--color-accent)'
                    : 'var(--color-cream-dim)',
            }}
          />
          <span className="label">{running ? 'Running' : status === 'error' ? 'Error' : 'Idle'}</span>
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
              size="sm"
              onChange={(ms) => {
                const sec = Math.floor(ms / 1000);
                const millis = ms - sec * 1000;
                setCadence({ seconds: sec, millis });
              }}
            />
            <span className="label-muted">ms</span>
          </div>
          <div className="text-right">
            <div className="font-display text-[20px] leading-none">{formatCps(intervalMs)}</div>
            <div className="label-muted">cps</div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-2">
        <div className="label-muted mb-1">Mouse</div>
        <div className="flex flex-col gap-2">
          <Segment<MouseButton>
            value={button}
            onChange={setButton}
            options={[
              { value: 'left', label: 'Left' },
              { value: 'right', label: 'Right' },
              { value: 'middle', label: 'Middle' },
            ]}
          />
          <Segment<ClickKind>
            value={kind}
            onChange={setKind}
            options={[
              { value: 'single', label: 'Single' },
              { value: 'double', label: 'Double' },
              { value: 'hold', label: 'Hold' },
            ]}
          />
        </div>
      </section>

      <section className="px-4 pb-2">
        <div className="flex items-center justify-between mb-1">
          <span className="label-muted">Target</span>
          <button
            type="button"
            className="label-muted hover:text-[var(--color-cream)] disabled:opacity-50"
            onClick={handlePick}
            disabled={picking}
            title="Pick a point on screen"
          >
            {picking ? 'Picking…' : 'Pick ↗'}
          </button>
        </div>
        <Segment<TargetKind>
          value={target.kind}
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
            { value: 'sequence', label: `Seq${target.kind === 'sequence' ? ` (${target.points.length})` : ''}`, disabled: target.kind !== 'sequence' },
          ]}
        />
        <div className="mt-1 label-muted text-[var(--color-cream-dim)] truncate">
          {target.kind === 'cursor' && 'Follows cursor'}
          {target.kind === 'fixed' && `${target.x}, ${target.y}`}
          {target.kind === 'sequence' && `${target.points.length} points · configured in full app`}
        </div>
      </section>

      <section className="px-4 pb-2">
        <div className="label-muted mb-1">Stop</div>
        <Segment<StopKind>
          value={stop.kind}
          onChange={(next) => {
            if (next === 'off') setStop({ kind: 'off' });
            else if (next === 'after-clicks')
              setStop({ kind: 'after-clicks', count: stop.kind === 'after-clicks' ? stop.count : 100 });
            else if (next === 'after-duration')
              setStop({ kind: 'after-duration', ms: stop.kind === 'after-duration' ? stop.ms : 60_000 });
          }}
          options={[
            { value: 'off', label: 'Manual' },
            { value: 'after-clicks', label: 'Clicks' },
            { value: 'after-duration', label: 'Time' },
          ]}
        />
        {stop.kind === 'after-clicks' && (
          <div className="mt-2 flex items-center gap-3">
            <span className="label-muted">After</span>
            <Stepper
              value={stop.count}
              onChange={(count) => setStop({ kind: 'after-clicks', count })}
              min={1}
              max={1_000_000}
              step={10}
              size="sm"
            />
            <span className="label-muted">clicks</span>
          </div>
        )}
        {stop.kind === 'after-duration' && (
          <div className="mt-2 flex items-center gap-3">
            <span className="label-muted">After</span>
            <Stepper
              value={Math.round(stop.ms / 1000)}
              onChange={(sec) => setStop({ kind: 'after-duration', ms: sec * 1000 })}
              min={1}
              max={60 * 60 * 24}
              step={5}
              size="sm"
            />
            <span className="label-muted">sec</span>
          </div>
        )}
      </section>

      <section className="px-4 pb-3">
        <button
          type="button"
          className="w-full flex items-center justify-between"
          onClick={toggleHumanize}
          title="Add small random jitter to timing and position"
        >
          <span className="label-muted">Humanize</span>
          <span className="switch" data-on={humanize ? 'true' : 'false'} />
        </button>
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

      <footer className="mt-auto border-t border-[var(--color-line)]">
        <div className="px-4 py-3 grid grid-cols-3 gap-3">
          <Stat label="Clicks" value={clicks.toLocaleString('en-US')} />
          <Stat label="Elapsed" value={formatElapsed(elapsedMs)} />
          <Stat
            label="Hotkey"
            value={formatAccelerator(clickerHotkey)}
            title={clickerHotkey}
          />
        </div>
        {lastError && lastError !== 'hotkey-toggle' && (
          <div
            className="px-4 pb-3 label-muted"
            style={{ color: 'var(--color-danger)' }}
            title={lastError}
          >
            {describeError(lastError)}
          </div>
        )}
        {!lastError && lastRun && !running && (
          <div className="px-4 pb-3 label-muted text-[var(--color-cream-dim)] truncate" title={new Date(lastRun.endedAt).toLocaleString()}>
            Last: {lastRun.clicks.toLocaleString('en-US')} clicks · {formatElapsed(lastRun.elapsedMs)} · {lastRun.outcome}
          </div>
        )}
      </footer>
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

function describeError(code: string): string {
  switch (code) {
    case 'grant-accessibility':
      return 'Grant accessibility in System Settings';
    case 'helper-failed':
      return 'Helper failed to start';
    case 'empty-sequence':
      return 'Sequence has no points';
    case 'kill-zone':
      return 'Stopped: kill zone reached';
    case 'not-ready':
      return 'Clicker not ready';
    case 'start-failed':
      return 'Could not start clicker';
    default:
      return code;
  }
}
