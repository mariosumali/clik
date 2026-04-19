import { useEffect, useState } from 'react';
import { ACCENT_PRESETS, type Density, type ThemeMode, useStore } from '../../store';
import { Stepper } from '../primitives/Stepper';
import type { KillZone } from '../../../../shared/types';

export function SettingsModal() {
  const open = useStore((s) => s.settingsOpen);
  const close = useStore((s) => s.closeSettings);

  const accent = useStore((s) => s.accent);
  const setAccent = useStore((s) => s.setAccent);
  const density = useStore((s) => s.density);
  const setDensity = useStore((s) => s.setDensity);
  const reduceMotion = useStore((s) => s.reduceMotion);
  const setReduceMotion = useStore((s) => s.setReduceMotion);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);

  const launchAtLogin = useStore((s) => s.launchAtLogin);
  const setLaunchAtLogin = useStore((s) => s.setLaunchAtLogin);
  const alwaysOnTop = useStore((s) => s.alwaysOnTop);
  const setAlwaysOnTop = useStore((s) => s.setAlwaysOnTop);
  const dockVisible = useStore((s) => s.dockVisible);
  const setDockVisible = useStore((s) => s.setDockVisible);
  const closeToTray = useStore((s) => s.closeToTray);
  const setCloseToTray = useStore((s) => s.setCloseToTray);

  const popoverAutoHide = useStore((s) => s.popoverAutoHide);
  const setPopoverAutoHide = useStore((s) => s.setPopoverAutoHide);

  const soundOnEvents = useStore((s) => s.soundOnEvents);
  const setSoundOnEvents = useStore((s) => s.setSoundOnEvents);
  const notifyOnComplete = useStore((s) => s.notifyOnComplete);
  const setNotifyOnComplete = useStore((s) => s.setNotifyOnComplete);
  const confirmBeforeStop = useStore((s) => s.confirmBeforeStop);
  const setConfirmBeforeStop = useStore((s) => s.setConfirmBeforeStop);

  const preventSleep = useStore((s) => s.preventSleep);
  const setPreventSleep = useStore((s) => s.setPreventSleep);

  const killZonesEnabled = useStore((s) => s.killZonesEnabled);
  const toggleKillZonesEnabled = useStore((s) => s.toggleKillZonesEnabled);
  const killZones = useStore((s) => s.killZones);
  const addKillZoneRect = useStore((s) => s.addKillZoneRect);
  const updateKillZone = useStore((s) => s.updateKillZone);
  const removeKillZone = useStore((s) => s.removeKillZone);

  const edgesZone = killZones.find((z) => z.id === 'preset-edges' && z.kind === 'edges') as
    | Extract<KillZone, { kind: 'edges' }>
    | undefined;
  const cornersZone = killZones.find((z) => z.id === 'preset-corners' && z.kind === 'corners') as
    | Extract<KillZone, { kind: 'corners' }>
    | undefined;
  const customZones = killZones.filter((z) => z.kind === 'rect') as Array<
    Extract<KillZone, { kind: 'rect' }>
  >;

  const [drawingZone, setDrawingZone] = useState(false);

  const drawKillZone = async () => {
    if (drawingZone) return;
    setDrawingZone(true);
    try {
      const res = await window.clik.startRegionPicker();
      if (res.ok && res.rect) addKillZoneRect(res.rect);
    } finally {
      setDrawingZone(false);
    }
  };

  const resetPreferences = useStore((s) => s.resetPreferences);

  const [a11yTrusted, setA11yTrusted] = useState<boolean | null>(null);

  useEffect(() => {
    if (!open) {
      setA11yTrusted(null);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    window.clik.checkPermission().then((p) => setA11yTrusted(p.trusted)).catch(() => undefined);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;

  const requestNotificationPermission = async () => {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch { /* ignore */ }
    }
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
        className="card flex flex-col"
        style={{
          width: 560,
          maxWidth: 'calc(100vw - 48px)',
          maxHeight: 'calc(100vh - 80px)',
          background: 'var(--color-ink)',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--color-line)]">
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 28,
              lineHeight: 1,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--color-cream)',
            }}
          >
            Preferences
          </div>
          <button type="button" aria-label="Close preferences" className="icon-btn" onClick={close}>
            <CloseGlyph />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto py-2">
          <SectionHeading>Appearance</SectionHeading>
          <Row title="Theme" hint="Match the system appearance or lock to light or dark.">
            <Segment<ThemeMode>
              value={theme}
              onChange={setTheme}
              options={[
                { value: 'system', label: 'System' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
          </Row>
          <Row title="Accent color" hint="Tints indicators, running state, and action highlights.">
            <div className="flex items-center gap-2">
              {ACCENT_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="swatch"
                  data-active={accent === p.value}
                  style={{ background: p.value }}
                  onClick={() => setAccent(p.value)}
                  aria-label={`Accent ${p.label}`}
                  title={p.label}
                />
              ))}
            </div>
          </Row>
          <Row title="Interface density" hint="Trade breathing room for more on-screen content.">
            <Segment<Density>
              value={density}
              onChange={setDensity}
              options={[
                { value: 'comfy', label: 'Comfy' },
                { value: 'compact', label: 'Compact' },
              ]}
            />
          </Row>
          <Row title="Reduce motion" hint="Disable transitions and easing across the UI.">
            <Switch on={reduceMotion} onToggle={() => setReduceMotion(!reduceMotion)} label="Reduce motion" />
          </Row>

          <SectionHeading>Window & Dock</SectionHeading>
          <Row title="Launch at login" hint="Open CLIK automatically when you sign in.">
            <Switch on={launchAtLogin} onToggle={() => setLaunchAtLogin(!launchAtLogin)} label="Launch at login" />
          </Row>
          <Row title="Always on top" hint="Keep the main window above other apps while visible.">
            <Switch on={alwaysOnTop} onToggle={() => setAlwaysOnTop(!alwaysOnTop)} label="Always on top" />
          </Row>
          <Row title="Show in Dock" hint="Hide the Dock icon to keep CLIK purely in the menu bar.">
            <Switch on={dockVisible} onToggle={() => setDockVisible(!dockVisible)} label="Show in Dock" />
          </Row>
          <Row title="Close hides window" hint="Closing the window keeps CLIK running in the tray.">
            <Switch on={closeToTray} onToggle={() => setCloseToTray(!closeToTray)} label="Close hides window" />
          </Row>

          <SectionHeading>Menu-bar popover</SectionHeading>
          <Row title="Auto-hide on blur" hint="Dismiss the popover when you click outside it.">
            <Switch on={popoverAutoHide} onToggle={() => setPopoverAutoHide(!popoverAutoHide)} label="Auto-hide popover" />
          </Row>

          <SectionHeading>Feedback</SectionHeading>
          <Row title="Sound cues" hint="Play a short tone when a run starts or stops.">
            <Switch on={soundOnEvents} onToggle={() => setSoundOnEvents(!soundOnEvents)} label="Sound cues" />
          </Row>
          <Row title="Notify on completion" hint="System notification when a stop condition is met.">
            <Switch
              on={notifyOnComplete}
              onToggle={async () => {
                const next = !notifyOnComplete;
                if (next) await requestNotificationPermission();
                setNotifyOnComplete(next);
              }}
              label="Notify on completion"
            />
          </Row>
          <Row title="Confirm before stopping" hint="Ask for confirmation when ending a long run.">
            <Switch on={confirmBeforeStop} onToggle={() => setConfirmBeforeStop(!confirmBeforeStop)} label="Confirm before stopping" />
          </Row>

          <SectionHeading>Power</SectionHeading>
          <Row title="Prevent display sleep" hint="Keep the screen awake while a session is running.">
            <Switch on={preventSleep} onToggle={() => setPreventSleep(!preventSleep)} label="Prevent display sleep" />
          </Row>

          <SectionHeading>Kill Zones</SectionHeading>
          <Row
            title="Enable kill zones"
            hint="Stop a run immediately if a click would land inside any enabled zone."
          >
            <Switch
              on={killZonesEnabled}
              onToggle={toggleKillZonesEnabled}
              label="Enable kill zones"
            />
          </Row>
          {edgesZone && (
            <Row
              title="Screen edges"
              hint="Treat an N-pixel strip along every screen edge as a kill zone."
            >
              <div className="flex items-center gap-3">
                <Stepper
                  size="sm"
                  value={edgesZone.margin}
                  onChange={(v) => updateKillZone(edgesZone.id, { margin: v })}
                  min={1}
                  max={200}
                  step={1}
                  disabled={!killZonesEnabled || !edgesZone.enabled}
                />
                <span className="label-muted" style={{ fontSize: 10 }}>
                  px
                </span>
                <Switch
                  on={edgesZone.enabled}
                  onToggle={() =>
                    updateKillZone(edgesZone.id, { enabled: !edgesZone.enabled })
                  }
                  label="Screen edges zone"
                />
              </div>
            </Row>
          )}
          {cornersZone && (
            <Row
              title="Screen corners"
              hint="Treat N×N squares at every screen corner as kill zones."
            >
              <div className="flex items-center gap-3">
                <Stepper
                  size="sm"
                  value={cornersZone.size}
                  onChange={(v) => updateKillZone(cornersZone.id, { size: v })}
                  min={1}
                  max={400}
                  step={1}
                  disabled={!killZonesEnabled || !cornersZone.enabled}
                />
                <span className="label-muted" style={{ fontSize: 10 }}>
                  px
                </span>
                <Switch
                  on={cornersZone.enabled}
                  onToggle={() =>
                    updateKillZone(cornersZone.id, { enabled: !cornersZone.enabled })
                  }
                  label="Screen corners zone"
                />
              </div>
            </Row>
          )}
          <Row
            title="Custom zones"
            hint="Draw rectangles anywhere on screen. Useful for blocking a specific window or UI region."
          >
            <button
              type="button"
              className="btn-ghost"
              onClick={drawKillZone}
              disabled={drawingZone}
            >
              {drawingZone ? 'Drawing…' : 'Draw zone'}
            </button>
          </Row>
          {customZones.length > 0 && (
            <div className="pref-row flex flex-col gap-2">
              {customZones.map((z) => (
                <div
                  key={z.id}
                  className="flex items-center gap-3"
                  style={{
                    padding: '8px 10px',
                    border: '1px solid var(--color-line)',
                    background: 'rgba(255,255,255,0.015)',
                  }}
                >
                  <input
                    type="text"
                    value={z.name}
                    onChange={(e) => updateKillZone(z.id, { name: e.target.value })}
                    aria-label="Zone name"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: 'var(--color-cream)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12,
                      letterSpacing: '0.04em',
                    }}
                  />
                  <span
                    className="label-muted"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {z.x},{z.y} · {z.w}×{z.h}
                  </span>
                  <Switch
                    on={z.enabled}
                    onToggle={() => updateKillZone(z.id, { enabled: !z.enabled })}
                    label={`Enable ${z.name}`}
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Remove ${z.name}`}
                    onClick={() => removeKillZone(z.id)}
                    title="Remove zone"
                  >
                    <CloseGlyph />
                  </button>
                </div>
              ))}
            </div>
          )}

          <SectionHeading>Permissions</SectionHeading>
          <Row
            title="Accessibility access"
            hint="Required so CLIK can synthesize mouse events system-wide."
          >
            <div className="flex items-center gap-3">
              <StatusDot ok={a11yTrusted === true} pending={a11yTrusted === null} />
              <button
                type="button"
                className="btn-ghost"
                onClick={() => window.clik.openAccessibilitySettings().catch(() => undefined)}
              >
                Open System Settings
              </button>
            </div>
          </Row>

          <SectionHeading>Data</SectionHeading>
          <Row title="Reset preferences" hint="Restore every preference above to its default.">
            <button type="button" className="btn-ghost" onClick={resetPreferences}>
              Reset
            </button>
          </Row>
        </div>

        <div className="flex items-center justify-end px-6 py-4 border-t border-[var(--color-line)]">
          <button type="button" className="btn-ghost" onClick={close}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <div className="pref-section">{children}</div>;
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
    <div className="pref-row flex items-start justify-between gap-6">
      <div className="min-w-0">
        <div className="label mb-1">{title}</div>
        <div style={{ fontSize: 11, color: 'var(--color-muted)', letterSpacing: '0.03em' }}>
          {hint}
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
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

interface SegmentOption<T extends string> {
  value: T;
  label: string;
}
function Segment<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: SegmentOption<T>[];
}) {
  return (
    <div className="segment">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          data-active={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function StatusDot({ ok, pending }: { ok: boolean; pending: boolean }) {
  const color = pending
    ? 'var(--color-cream-dim)'
    : ok
      ? 'var(--color-accent)'
      : 'var(--color-danger)';
  const label = pending ? 'Checking…' : ok ? 'Granted' : 'Not granted';
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden
        style={{ width: 7, height: 7, background: color, display: 'inline-block' }}
      />
      <span className="label-muted">{label}</span>
    </span>
  );
}

function CloseGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <path d="M2 2 L10 10 M10 2 L2 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" />
    </svg>
  );
}
