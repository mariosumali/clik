import { useCallback, useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { StatusBar } from './components/StatusBar';
import { ClickerPage } from './components/Clicker/ClickerPage';
import { SequencePage } from './components/Sequence/SequencePage';
import { AutonomyPage } from './components/Autonomy/AutonomyPage';
import { RunLogPage } from './components/RunLog/RunLogPage';
import { SettingsModal } from './components/Settings/SettingsModal';
import { playBeep, showNotification } from './lib/feedback';
import { useStore, type RunLogEntry, type RunOutcome } from './store';
import type {
  ClickerConfig,
  ClickerTick,
  HotkeyTarget,
  StopCondition,
} from '../../shared/types';

function newRunId(): string {
  const cryptoObj = (globalThis as unknown as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
  return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// "completed" = stop condition satisfied by the run itself.
// "stopped"   = user / hotkey cancelled before the condition fired.
// "error"     = the helper reported a failure ('helper-failed', 'empty-sequence', ...).
function classifyOutcome(args: {
  stop: StopCondition;
  clicks: number;
  elapsedMs: number;
  reason?: string;
}): RunOutcome {
  const { stop, clicks, elapsedMs, reason } = args;
  if (reason && reason !== 'hotkey-toggle') return 'error';
  if (stop.kind === 'after-clicks' && clicks >= stop.count) return 'completed';
  if (stop.kind === 'after-duration' && elapsedMs >= stop.ms) return 'completed';
  return 'stopped';
}

export function App() {
  const route = useStore((s) => s.route);
  const applyTick = useStore((s) => s.applyTick);
  const applyAutonomyTick = useStore((s) => s.applyAutonomyTick);
  const status = useStore((s) => s.status);
  const hotkeys = useStore((s) => s.hotkeys);
  const setHotkey = useStore((s) => s.setHotkey);
  const launchAtLogin = useStore((s) => s.launchAtLogin);
  const alwaysOnTop = useStore((s) => s.alwaysOnTop);
  const dockVisible = useStore((s) => s.dockVisible);
  const closeToTray = useStore((s) => s.closeToTray);
  const popoverAutoHide = useStore((s) => s.popoverAutoHide);
  const preventSleep = useStore((s) => s.preventSleep);
  const accent = useStore((s) => s.accent);
  const density = useStore((s) => s.density);
  const reduceMotion = useStore((s) => s.reduceMotion);
  const theme = useStore((s) => s.theme);
  const soundOnEvents = useStore((s) => s.soundOnEvents);
  const notifyOnComplete = useStore((s) => s.notifyOnComplete);
  const confirmBeforeStop = useStore((s) => s.confirmBeforeStop);

  const prevStatusRef = useRef(status);

  // Fire the active runner for a specific workspace. Stops are handled directly
  // in the main process — the only thing the renderer owns on the fire path is
  // which config to send (clicker / sequence / autonomy flow).
  const fireTarget = useCallback(
    async (target: HotkeyTarget) => {
      const state = useStore.getState();
      const perm = await window.clik.checkPermission();

      if (target === 'autonomy') {
        if (state.autonomyStatus === 'running') return;
        const activeFlow = state.autonomyFlows.find((f) => f.id === state.activeFlowId) ?? null;
        if (!activeFlow) return;
        if (!perm.trusted) {
          applyAutonomyTick({
            status: 'error',
            currentNodeId: null,
            iterations: 0,
            elapsedMs: 0,
            lastError: 'grant-accessibility',
          });
          return;
        }
        const res = await window.clik.autonomyStart(activeFlow);
        if (!res.ok) {
          applyAutonomyTick({
            status: 'error',
            currentNodeId: null,
            iterations: 0,
            elapsedMs: 0,
            lastError: res.err ?? 'start-failed',
          });
        }
        return;
      }

      // Clicker + Sequence share the clicker runtime; they only differ in the
      // config payload. We pick by target so the hotkey always fires the right
      // workspace regardless of which page is currently on-screen.
      if (state.status === 'running') return;
      if (!perm.trusted) {
        applyTick({
          status: 'idle',
          clicks: 0,
          elapsedMs: 0,
          intervalMs: 0,
          lastError: 'grant-accessibility',
        });
        return;
      }
      const config = target === 'sequence' ? state.getSequenceConfig() : state.getConfig();
      const res = await window.clik.start(config);
      if (!res.ok) {
        applyTick({
          status: 'idle',
          clicks: 0,
          elapsedMs: 0,
          intervalMs: 0,
          lastError: res.err ?? 'start-failed',
        });
      }
    },
    [applyTick, applyAutonomyTick],
  );

  // Thin wrappers for the in-window Enter/Escape shortcuts and page buttons —
  // these follow the *current* route (unlike the global hotkey, which is
  // always workspace-scoped).
  const fire = useCallback(() => {
    const current = useStore.getState().route;
    const target: HotkeyTarget =
      current === 'sequence' ? 'sequence' : current === 'autonomy' ? 'autonomy' : 'clicker';
    return fireTarget(target);
  }, [fireTarget]);

  const cancel = useCallback(() => {
    const st = useStore.getState();
    if (st.route === 'autonomy') {
      if (st.autonomyStatus !== 'running') return;
      if (st.confirmBeforeStop && !window.confirm('Stop the running session?')) return;
      void window.clik.autonomyStop();
      return;
    }
    if (st.status === 'running' && st.confirmBeforeStop) {
      if (!window.confirm('Stop the running session?')) return;
    }
    window.clik.stop();
  }, []);

  // Renderer wiring for tick + fire events from the global hotkey. The main
  // process handles stop on its own (so hotkeys work with windows hidden), so
  // we only see 'fire' payloads here.
  useEffect(() => {
    const offTick = window.clik.onTick((t) => applyTick(t));
    const offHotkey = window.clik.onHotkey(({ target, action }) => {
      if (action === 'fire') fireTarget(target);
    });
    return () => {
      offTick();
      offHotkey();
    };
  }, [applyTick, fireTarget]);

  // Run-log capture — observe tick transitions directly so we can read the final
  // click count before `applyTick` folds it into the store (the terminal idle
  // tick from the helper also zeroes elapsedMs, so we compute it from wall clock).
  // Guarded to the full window to avoid the popover racing the same localStorage.
  useEffect(() => {
    if (window.clik.mode !== 'full') return;
    const pending: {
      ref: {
        id: string;
        startedAt: number;
        workspace: 'clicker' | 'sequence';
        config: ClickerConfig;
      } | null;
      lastRunningClicks: number;
    } = { ref: null, lastRunningClicks: 0 };
    let prevStatus: ClickerTick['status'] = 'idle';

    const off = window.clik.onTick((t) => {
      // idle → running: snapshot the config used for this run.
      if (prevStatus !== 'running' && t.status === 'running') {
        const state = useStore.getState();
        const workspace: 'clicker' | 'sequence' = state.route === 'sequence' ? 'sequence' : 'clicker';
        const config = workspace === 'sequence' ? state.getSequenceConfig() : state.getConfig();
        pending.ref = {
          id: newRunId(),
          startedAt: Date.now(),
          workspace,
          config,
        };
        pending.lastRunningClicks = 0;
      }

      // Running ticks carry the authoritative clicks counter; the terminal idle
      // tick has clicks preserved too, but we fall back to the last-known value
      // for safety in case the helper ever changes.
      if (t.status === 'running') {
        pending.lastRunningClicks = t.clicks;
      }

      // running → idle: finalize the entry.
      if (prevStatus === 'running' && t.status !== 'running' && pending.ref) {
        const start = pending.ref;
        pending.ref = null;
        const finalClicks = t.clicks || pending.lastRunningClicks;
        const elapsedMs = Math.max(0, Date.now() - start.startedAt);
        const outcome = classifyOutcome({
          stop: start.config.stop,
          clicks: finalClicks,
          elapsedMs,
          reason: t.lastError,
        });
        const entry: RunLogEntry = {
          id: start.id,
          startedAt: start.startedAt,
          endedAt: Date.now(),
          workspace: start.workspace,
          intervalMs: start.config.intervalMs,
          button: start.config.button,
          kind: start.config.kind,
          targetKind: start.config.target.kind,
          pointCount:
            start.config.target.kind === 'sequence' ? start.config.target.points.length : undefined,
          stop: start.config.stop,
          humanize: start.config.humanize,
          clicks: finalClicks,
          elapsedMs,
          outcome,
          reason: t.lastError,
        };
        useStore.getState().appendRunLog(entry);
      }

      prevStatus = t.status;
    });
    return off;
  }, []);

  // Register every persisted global hotkey with the main process whenever the
  // map changes. Registering is idempotent — the main process unregisters the
  // previous binding for the same slot before wiring the new accelerator.
  useEffect(() => {
    (Object.entries(hotkeys) as Array<[HotkeyTarget, string]>).forEach(([target, accel]) => {
      window.clik.setHotkey(target, accel).catch(() => undefined);
    });
  }, [hotkeys]);

  // Apply persisted OS-level preferences to the main process whenever they change.
  useEffect(() => {
    window.clik.setLaunchAtLogin(launchAtLogin).catch(() => undefined);
  }, [launchAtLogin]);

  useEffect(() => {
    window.clik.setAlwaysOnTop(alwaysOnTop).catch(() => undefined);
  }, [alwaysOnTop]);

  useEffect(() => {
    window.clik.setDockVisible(dockVisible).catch(() => undefined);
  }, [dockVisible]);

  useEffect(() => {
    window.clik.setCloseToTray(closeToTray).catch(() => undefined);
  }, [closeToTray]);

  useEffect(() => {
    window.clik.setPopoverAutoHide(popoverAutoHide).catch(() => undefined);
  }, [popoverAutoHide]);

  useEffect(() => {
    window.clik.setPreventSleep(preventSleep).catch(() => undefined);
  }, [preventSleep]);

  // Appearance: drive CSS variables + data-attributes from the persisted store
  // so the whole renderer picks up the user's chosen accent, density, and
  // reduced-motion preference without component-level wiring.
  useEffect(() => {
    document.documentElement.style.setProperty('--color-accent', accent);
  }, [accent]);

  useEffect(() => {
    document.body.dataset.density = density;
  }, [density]);

  useEffect(() => {
    document.body.dataset.reduceMotion = reduceMotion ? 'true' : 'false';
  }, [reduceMotion]);

  // Resolve the theme preference to a concrete 'dark' | 'light' value. When the
  // user picks "system", we track the OS-level preference and update live.
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const apply = () => {
      const resolved: 'dark' | 'light' =
        theme === 'system' ? (media.matches ? 'light' : 'dark') : theme;
      document.body.dataset.theme = resolved;
    };
    apply();
    if (theme !== 'system') return;
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  // Feedback: trigger sound + notification on run-state transitions.
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (prev === status) return;
    if (status === 'running' && soundOnEvents) playBeep('start');
    if (prev === 'running' && status === 'idle') {
      if (soundOnEvents) playBeep('stop');
      if (notifyOnComplete) {
        showNotification('CLIK — run finished', 'The clicker has stopped.');
      }
    }
  }, [status, soundOnEvents, notifyOnComplete]);

  // Sync hotkeys across windows if changed from elsewhere (the full window and
  // the popover both persist the same store, but each registers with main so
  // the authoritative accelerator lives there).
  useEffect(() => {
    return window.clik.onHotkeyStatus((reg) => {
      if (!reg.ok) return;
      const persisted = useStore.getState().hotkeys[reg.target];
      if (reg.accelerator && reg.accelerator !== persisted) {
        setHotkey(reg.target, reg.accelerator);
      }
    });
  }, [setHotkey]);

  // In-window keyboard shortcuts: Escape cancels, Enter fires (only when window has focus).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Skip when the user is typing in an input.
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        fire();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fire, cancel]);

  // Tick elapsedMs smoothly client-side so the counter does not feel laggy between helper responses.
  useEffect(() => {
    if (status !== 'running') return;
    const id = setInterval(() => {
      const st = useStore.getState();
      if (st.status !== 'running') return;
      useStore.setState({ elapsedMs: st.elapsedMs + 100 });
    }, 100);
    return () => clearInterval(id);
  }, [status]);

  return (
    <div className="flex h-screen w-screen bg-[var(--color-ink)]">
      <Sidebar />
      <main className="flex flex-col flex-1 min-w-0">
        <div className="drag-region h-[28px]" />
        <div className="flex-1 min-h-0">
          {route === 'clicker' && <ClickerPage onFire={fire} onCancel={cancel} />}
          {route === 'sequence' && <SequencePage onFire={fire} onCancel={cancel} />}
          {route === 'autonomy' && <AutonomyPage />}
          {route === 'run-log' && <RunLogPage />}
        </div>
        <StatusBar />
      </main>
      <SettingsModal />
    </div>
  );
}
