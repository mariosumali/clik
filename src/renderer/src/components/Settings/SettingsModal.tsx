import { useEffect } from 'react';
import { useStore } from '../../store';
import { HotkeyRecorder } from '../Hotkeys/HotkeyRecorder';

const DEFAULT_HOTKEY = 'Alt+Shift+C';

export function SettingsModal() {
  const open = useStore((s) => s.settingsOpen);
  const close = useStore((s) => s.closeSettings);

  const hotkey = useStore((s) => s.startStopHotkey);
  const setHotkey = useStore((s) => s.setStartStopHotkey);
  const launchAtLogin = useStore((s) => s.launchAtLogin);
  const setLaunchAtLogin = useStore((s) => s.setLaunchAtLogin);
  const alwaysOnTop = useStore((s) => s.alwaysOnTop);
  const setAlwaysOnTop = useStore((s) => s.setAlwaysOnTop);
  const humanize = useStore((s) => s.humanize);
  const toggleHumanize = useStore((s) => s.toggleHumanize);
  const resetSettings = useStore((s) => s.resetSettings);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;

  const validateHotkey = async (accelerator: string) => {
    const res = await window.clik.setStartStopHotkey(accelerator);
    return { ok: res.ok, err: res.err };
  };

  const toggleLaunchAtLogin = async () => {
    const next = !launchAtLogin;
    setLaunchAtLogin(next);
    await window.clik.setLaunchAtLogin(next).catch(() => undefined);
  };

  const toggleAlwaysOnTop = async () => {
    const next = !alwaysOnTop;
    setAlwaysOnTop(next);
    await window.clik.setAlwaysOnTop(next).catch(() => undefined);
  };

  const handleReset = async () => {
    resetSettings();
    // Mirror the reset to the OS-level side effects so the real world matches state.
    await Promise.all([
      window.clik.setLaunchAtLogin(false).catch(() => undefined),
      window.clik.setAlwaysOnTop(false).catch(() => undefined),
      window.clik.setStartStopHotkey(DEFAULT_HOTKEY).catch(() => undefined),
    ]);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center no-drag"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className="card"
        style={{ width: 520, maxWidth: 'calc(100vw - 48px)', background: 'var(--color-ink)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-line)]">
          <div>
            <div className="label-muted">Preferences</div>
            <div className="font-display" style={{ fontSize: 22, lineHeight: 1 }}>
              Settings
            </div>
          </div>
          <button type="button" aria-label="Close settings" className="icon-btn" onClick={close}>
            <CloseGlyph />
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-5">
          <Row
            title="Global hotkey"
            hint="Starts and stops clicking from any app."
          >
            <HotkeyRecorder
              value={hotkey}
              defaultValue={DEFAULT_HOTKEY}
              onChange={setHotkey}
              onValidate={validateHotkey}
            />
          </Row>

          <Divider />

          <Row
            title="Launch at login"
            hint="Open CLIK automatically when you sign in to macOS."
          >
            <Switch on={launchAtLogin} onToggle={toggleLaunchAtLogin} label="Launch at login" />
          </Row>

          <Row
            title="Always on top"
            hint="Keep the CLIK window above other apps while it's visible."
          >
            <Switch on={alwaysOnTop} onToggle={toggleAlwaysOnTop} label="Always on top" />
          </Row>

          <Row
            title="Humanize clicks"
            hint="Add tiny jitter to cadence so clicks look less mechanical."
          >
            <Switch on={humanize} onToggle={toggleHumanize} label="Humanize clicks" />
          </Row>
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--color-line)]">
          <button type="button" className="btn-ghost" onClick={handleReset}>
            Reset to defaults
          </button>
          <button type="button" className="btn-ghost" onClick={close}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="min-w-0">
        <div className="label mb-1">{title}</div>
        <div className="label-muted" style={{ textTransform: 'none', letterSpacing: '0.04em' }}>
          {hint}
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Divider() {
  return <div style={{ borderTop: '1px solid var(--color-line)' }} />;
}

function Switch({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className="switch"
      data-on={on}
      onClick={onToggle}
    />
  );
}

function CloseGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <path
        d="M2 2 L10 10 M10 2 L2 10"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="square"
      />
    </svg>
  );
}
