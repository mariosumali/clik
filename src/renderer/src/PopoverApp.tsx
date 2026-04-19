import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  POPOVER_MODULE_CATALOG,
  ACCENT_PRESETS,
  useStore,
  type PopoverModuleId,
} from './store';
import { Stepper } from './components/primitives/Stepper';
import { Segment } from './components/primitives/Segment';
import { formatAccelerator } from './lib/hotkey';
import { formatCps, formatElapsed, cadenceToMs } from './lib/format';
import type { ClickKind, MouseButton, StopCondition, Target } from '../../shared/types';

type StopKind = StopCondition['kind'];
type TargetKind = Target['kind'];

// Theme cycling order matches Settings -> Appearance so the quick-cycle
// affordance in the popover feels like a subset of the same control.
const CYCLE_THEMES = [
  'system',
  'dark',
  'light',
  'phosphor',
  'amber',
  'paper',
  'solar-dark',
  'dracula',
  'hi-contrast',
] as const;

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
  const clickerHotkey = useStore((s) => s.hotkeys.clicker);
  const hotkeys = useStore((s) => s.hotkeys);
  const setHotkey = useStore((s) => s.setHotkey);
  const lastRun = useStore((s) => s.runLog[0]);
  const accent = useStore((s) => s.accent);
  const setAccent = useStore((s) => s.setAccent);
  const density = useStore((s) => s.density);
  const reduceMotion = useStore((s) => s.reduceMotion);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);

  // Module configuration — the user picks which sections appear in the tray
  // popover and in what order, via the gear-icon settings panel.
  const modules = useStore((s) => s.popoverModules);
  const togglePopoverModule = useStore((s) => s.togglePopoverModule);
  const movePopoverModule = useStore((s) => s.movePopoverModule);
  const resetPopoverModules = useStore((s) => s.resetPopoverModules);

  const [picking, setPicking] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

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

  useEffect(() => {
    (Object.entries(hotkeys) as Array<['clicker' | 'sequence' | 'autonomy', string]>).forEach(
      ([target, accel]) => {
        window.clik.setHotkey(target, accel).catch(() => undefined);
      },
    );
  }, [hotkeys]);

  // Appearance mirroring — the popover's DOM is independent of the main
  // window, so each reactive preference has to be applied to this body.
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

  // Esc closes settings first, then the popover. Enter toggles fire/stop
  // only when settings are closed (otherwise it would swallow form input).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && ['INPUT', 'TEXTAREA'].includes(t.tagName)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        if (settingsOpen) setSettingsOpen(false);
        else window.clik.hidePopover();
      } else if (e.key === 'Enter' && !settingsOpen) {
        e.preventDefault();
        if (status === 'running') cancel();
        else fire();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [status, fire, cancel, settingsOpen]);

  const handlePick = useCallback(async () => {
    if (picking) return;
    setPicking(true);
    try {
      await window.clik.hidePopover();
      const res = await window.clik.startPicker();
      if (res.ok) setTarget({ kind: 'fixed', x: res.x, y: res.y });
    } finally {
      setPicking(false);
    }
  }, [picking, setTarget]);

  const cycleTheme = useCallback(() => {
    const idx = CYCLE_THEMES.indexOf(theme as (typeof CYCLE_THEMES)[number]);
    const next = CYCLE_THEMES[(idx + 1) % CYCLE_THEMES.length];
    setTheme(next);
  }, [theme, setTheme]);

  const running = status === 'running';

  // Map each module id to its render function. Adding a new module is a
  // two-step change: add it to POPOVER_MODULE_CATALOG and add a case here.
  const renderers = useMemo<Record<PopoverModuleId, () => ReactElement | null>>(
    () => ({
      status: () => (
        <header
          key="status"
          className="px-4 pt-4 pb-3 flex items-center justify-between border-b border-[var(--color-line)]"
        >
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
            <span className="label">
              {running ? 'Running' : status === 'error' ? 'Error' : 'Idle'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="label-muted hover:text-[var(--color-cream)]"
              onClick={() => setSettingsOpen((v) => !v)}
              title="Modules & appearance"
            >
              {settingsOpen ? 'Done' : '⚙'}
            </button>
            <button
              type="button"
              className="label-muted hover:text-[var(--color-cream)]"
              onClick={() => window.clik.showMainWindow()}
            >
              Open full app ↗
            </button>
          </div>
        </header>
      ),
      interval: () => (
        <section key="interval" className="px-4 py-3">
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
      ),
      mouse: () => (
        <section key="mouse" className="px-4 pb-2">
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
      ),
      target: () => (
        <section key="target" className="px-4 pb-2">
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
              {
                value: 'sequence',
                label: `Seq${target.kind === 'sequence' ? ` (${target.points.length})` : ''}`,
                disabled: target.kind !== 'sequence',
              },
            ]}
          />
          <div className="mt-1 label-muted text-[var(--color-cream-dim)] truncate">
            {target.kind === 'cursor' && 'Follows cursor'}
            {target.kind === 'fixed' && `${target.x}, ${target.y}`}
            {target.kind === 'sequence' &&
              `${target.points.length} points · configured in full app`}
          </div>
        </section>
      ),
      stop: () => (
        <section key="stop" className="px-4 pb-2">
          <div className="label-muted mb-1">Stop</div>
          <Segment<StopKind>
            value={stop.kind}
            onChange={(next) => {
              if (next === 'off') setStop({ kind: 'off' });
              else if (next === 'after-clicks')
                setStop({
                  kind: 'after-clicks',
                  count: stop.kind === 'after-clicks' ? stop.count : 100,
                });
              else if (next === 'after-duration')
                setStop({
                  kind: 'after-duration',
                  ms: stop.kind === 'after-duration' ? stop.ms : 60_000,
                });
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
      ),
      humanize: () => (
        <section key="humanize" className="px-4 pb-3">
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
      ),
      theme: () => (
        <section key="theme" className="px-4 pb-2">
          <button
            type="button"
            className="w-full flex items-center justify-between"
            onClick={cycleTheme}
            title="Cycle theme preset"
          >
            <span className="label-muted">Theme</span>
            <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--color-cream)]">
              {theme}
            </span>
          </button>
        </section>
      ),
      accent: () => (
        <section key="accent" className="px-4 pb-2">
          <div className="label-muted mb-1">Accent</div>
          <div className="flex items-center gap-2">
            {ACCENT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="swatch"
                data-active={accent === preset.value ? 'true' : 'false'}
                style={{ background: preset.value }}
                title={preset.label}
                onClick={() => setAccent(preset.value)}
              />
            ))}
          </div>
        </section>
      ),
      hotkey: () => (
        <section key="hotkey" className="px-4 pb-2 flex items-center justify-between">
          <span className="label-muted">Hotkey</span>
          <span
            className="font-mono text-[11px] tracking-[0.04em] text-[var(--color-cream)]"
            title={clickerHotkey}
          >
            {formatAccelerator(clickerHotkey)}
          </span>
        </section>
      ),
      start: () => (
        <section key="start" className="px-4 pb-3">
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
      ),
      stats: () => (
        <footer key="stats" className="mt-auto border-t border-[var(--color-line)]">
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
            <div
              className="px-4 pb-3 label-muted text-[var(--color-cream-dim)] truncate"
              title={new Date(lastRun.endedAt).toLocaleString()}
            >
              Last:{' '}
              {lastRun.clicks.toLocaleString('en-US')} clicks ·{' '}
              {formatElapsed(lastRun.elapsedMs)} · {lastRun.outcome}
            </div>
          )}
        </footer>
      ),
    }),
    [
      accent,
      button,
      cadence,
      cancel,
      clicks,
      clickerHotkey,
      cycleTheme,
      elapsedMs,
      fire,
      handlePick,
      humanize,
      kind,
      lastError,
      lastRun,
      picking,
      running,
      setAccent,
      setButton,
      setCadence,
      setKind,
      setStop,
      setTarget,
      settingsOpen,
      status,
      stop,
      target,
      theme,
      toggleHumanize,
    ],
  );

  // Always render the Status header (contains the settings toggle) and Start
  // button; every other slot is user-configurable. Required modules that
  // somehow got dropped from the list are re-injected at the end so the
  // popover never ends up in an unusable state.
  const orderedIds = useMemo<PopoverModuleId[]>(() => {
    const present = new Set(modules);
    const result = [...modules];
    for (const meta of POPOVER_MODULE_CATALOG) {
      if (meta.required && !present.has(meta.id)) result.push(meta.id);
    }
    return result;
  }, [modules]);

  return (
    <div
      className="flex flex-col h-screen w-screen select-none overflow-hidden"
      style={{
        background: 'var(--color-ink)',
        border: '1px solid var(--color-line)',
        color: 'var(--color-cream)',
      }}
    >
      {renderers.status()}

      {settingsOpen ? (
        <ModuleManager
          modules={modules}
          onToggle={togglePopoverModule}
          onMove={movePopoverModule}
          onReset={resetPopoverModules}
        />
      ) : (
        <div className="flex-1 flex flex-col overflow-y-auto no-scrollbar">
          {orderedIds
            .filter((id) => id !== 'status')
            .map((id) => renderers[id]())}
        </div>
      )}
    </div>
  );
}

interface ModuleManagerProps {
  modules: PopoverModuleId[];
  onToggle: (id: PopoverModuleId) => void;
  onMove: (id: PopoverModuleId, dir: -1 | 1) => void;
  onReset: () => void;
}

// Gear-icon settings view. Lists every module in the catalog (not just the
// currently-enabled ones) so the user can add modules back; enabled modules
// expose up/down arrows that reorder the live array. Required modules are
// locked on (greyed-out checkbox) to prevent the user from hiding the Start
// button.
function ModuleManager({ modules, onToggle, onMove, onReset }: ModuleManagerProps): ReactElement {
  const enabled = new Set(modules);
  return (
    <div className="flex-1 flex flex-col overflow-y-auto">
      <div className="px-4 py-3 border-b border-[var(--color-line)] flex items-center justify-between">
        <span className="label">Modules</span>
        <button
          type="button"
          className="label-muted hover:text-[var(--color-cream)]"
          onClick={onReset}
          title="Restore default module layout"
        >
          Reset
        </button>
      </div>

      <div className="px-2 py-2 flex-1">
        {POPOVER_MODULE_CATALOG.map((meta) => {
          const isEnabled = enabled.has(meta.id);
          const orderIdx = modules.indexOf(meta.id);
          const canMoveUp = isEnabled && orderIdx > 0;
          const canMoveDown = isEnabled && orderIdx !== -1 && orderIdx < modules.length - 1;
          return (
            <div
              key={meta.id}
              className="flex items-center gap-2 px-2 py-2 border-b border-[var(--color-line)]"
            >
              <button
                type="button"
                className="switch shrink-0"
                data-on={isEnabled ? 'true' : 'false'}
                onClick={() => onToggle(meta.id)}
                disabled={meta.required}
                title={meta.required ? 'Required module' : isEnabled ? 'Disable' : 'Enable'}
                style={{ opacity: meta.required ? 0.55 : 1 }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-[12px] tracking-[0.04em] text-[var(--color-cream)] truncate">
                  {meta.label}
                  {meta.required && (
                    <span className="label-muted ml-2">·&nbsp;required</span>
                  )}
                </div>
                <div className="label-muted text-[var(--color-cream-dim)] truncate">
                  {meta.description}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  className="icon-btn"
                  disabled={!canMoveUp}
                  onClick={() => onMove(meta.id, -1)}
                  style={{ opacity: canMoveUp ? 1 : 0.3 }}
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  disabled={!canMoveDown}
                  onClick={() => onMove(meta.id, 1)}
                  style={{ opacity: canMoveDown ? 1 : 0.3 }}
                  title="Move down"
                >
                  ↓
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-4 py-3 border-t border-[var(--color-line)] label-muted text-[var(--color-cream-dim)]">
        Changes sync to every open CLIK window in real time.
      </div>
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
