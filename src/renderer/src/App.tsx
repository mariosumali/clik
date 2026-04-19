import { useCallback, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { StatusBar } from './components/StatusBar';
import { ClickerPage } from './components/Clicker/ClickerPage';
import { StubPage } from './components/StubPage';
import { HotkeysPage } from './components/Hotkeys/HotkeysPage';
import { SettingsModal } from './components/Settings/SettingsModal';
import { useStore } from './store';

export function App() {
  const route = useStore((s) => s.route);
  const applyTick = useStore((s) => s.applyTick);
  const status = useStore((s) => s.status);
  const startStopHotkey = useStore((s) => s.startStopHotkey);
  const setStartStopHotkey = useStore((s) => s.setStartStopHotkey);
  const launchAtLogin = useStore((s) => s.launchAtLogin);
  const alwaysOnTop = useStore((s) => s.alwaysOnTop);

  const fire = useCallback(async () => {
    const state = useStore.getState();
    if (state.status === 'running') return;
    const perm = await window.clik.checkPermission();
    if (!perm.trusted) {
      // Helper also triggers the Accessibility prompt; surface a hint in the status bar so
      // the user knows why nothing fired.
      applyTick({
        status: 'idle',
        clicks: 0,
        elapsedMs: 0,
        intervalMs: 0,
        lastError: 'grant-accessibility',
      });
      return;
    }
    const res = await window.clik.start(state.getConfig());
    if (!res.ok) {
      applyTick({
        status: 'idle',
        clicks: 0,
        elapsedMs: 0,
        intervalMs: 0,
        lastError: res.err ?? 'start-failed',
      });
    }
  }, [applyTick]);

  const cancel = useCallback(() => {
    window.clik.stop();
  }, []);

  // Renderer wiring for tick + fire/cancel events from the global hotkey.
  useEffect(() => {
    const offTick = window.clik.onTick((t) => applyTick(t));
    const offHotkey = window.clik.onHotkey((name) => {
      if (name === 'fire') fire();
      if (name === 'cancel') cancel();
    });
    return () => {
      offTick();
      offHotkey();
    };
  }, [applyTick, fire, cancel]);

  // Register the persisted global hotkey with the main process; re-register on change.
  useEffect(() => {
    window.clik.setStartStopHotkey(startStopHotkey).catch(() => undefined);
  }, [startStopHotkey]);

  // Sync hotkey across windows if changed from elsewhere.
  useEffect(() => {
    return window.clik.onHotkeyStatus((reg) => {
      if (reg.ok && reg.accelerator && reg.accelerator !== useStore.getState().startStopHotkey) {
        setStartStopHotkey(reg.accelerator);
      }
    });
  }, [setStartStopHotkey]);

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
          {route === 'sequence' && <StubPage title="Record. Replay." subtitle="Sequence" />}
          {route === 'hotkeys' && <HotkeysPage />}
          {route === 'run-log' && <StubPage title="Every click, logged." subtitle="Run log" />}
        </div>
        <StatusBar />
      </main>
    </div>
  );
}
