import { useStore, type WorkspaceRoute } from '../store';

interface NavEntry {
  id: WorkspaceRoute;
  label: string;
  stub?: boolean;
}

const nav: NavEntry[] = [
  { id: 'clicker', label: 'Clicker' },
  { id: 'sequence', label: 'Sequence', stub: true },
  { id: 'hotkeys', label: 'Hotkeys' },
  { id: 'run-log', label: 'Run Log', stub: true },
];

export function Sidebar() {
  const route = useStore((s) => s.route);
  const status = useStore((s) => s.status);
  const setRoute = useStore((s) => s.setRoute);
  const openSettings = useStore((s) => s.openSettings);

  return (
    <aside
      className="w-[240px] shrink-0 h-full flex flex-col bg-[var(--color-ink)]"
      style={{ borderRight: '1px solid var(--color-line)' }}
    >
      <div className="drag-region h-[52px] pl-[78px] pr-5 flex items-center justify-between border-b border-[var(--color-line)]">
        <div className="flex items-center gap-3 no-drag">
          <Logo />
          <div>
            <div className="font-mono text-[13px] tracking-[0.12em] text-[var(--color-cream)]">CLIK</div>
            <div className="text-[10px] tracking-[0.12em] text-[var(--color-muted)]">v1.0.4 · macOS</div>
          </div>
        </div>
      </div>

      <div className="px-5 py-4 border-b border-[var(--color-line)] flex items-center gap-2">
        <span
          className="inline-block w-[7px] h-[7px]"
          style={{
            background: status === 'running' ? 'var(--color-accent)' : 'var(--color-cream-dim)',
          }}
        />
        <span className="label">{status === 'running' ? 'Running' : 'Idle'}</span>
      </div>

      <div className="pt-4 pb-2 px-5">
        <div className="label-muted">Workspace</div>
      </div>

      <nav className="flex flex-col">
        {nav.map((n) => (
          <button
            key={n.id}
            type="button"
            className="nav-item no-drag"
            data-active={route === n.id}
            onClick={() => !n.stub && setRoute(n.id)}
            title={n.stub ? 'Coming soon' : undefined}
            style={n.stub ? { opacity: 0.55 } : undefined}
          >
            <span className="nav-glyph" />
            <span>{n.label}</span>
            {n.stub && (
              <span className="ml-auto text-[9px] tracking-[0.15em] text-[var(--color-muted)]">SOON</span>
            )}
          </button>
        ))}
      </nav>

      <div className="mt-auto px-5 py-4 border-t border-[var(--color-line)] flex items-center gap-3">
        <button
          type="button"
          className="icon-btn no-drag"
          onClick={openSettings}
          aria-label="Open settings"
          title="Settings"
        >
          <GearGlyph />
        </button>
        <div className="flex-1 flex items-center justify-between text-[10px] tracking-[0.18em] uppercase text-[var(--color-muted)]">
          <span>CLIK Labs</span>
          <span>© 2026</span>
        </div>
      </div>
    </aside>
  );
}

function GearGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="square"
        strokeLinejoin="miter"
      >
        <circle cx="8" cy="8" r="2.2" />
        <path d="M8 1.5v2.2M8 12.3v2.2M1.5 8h2.2M12.3 8h2.2M3.4 3.4l1.6 1.6M11 11l1.6 1.6M12.6 3.4L11 5M5 11l-1.6 1.6" />
      </g>
    </svg>
  );
}

function Logo() {
  return (
    <div
      className="w-8 h-8 flex items-center justify-center border border-[var(--color-cream)]"
      aria-hidden
    >
      <div
        style={{
          width: 14,
          height: 14,
          borderTop: '2px solid var(--color-cream)',
          borderLeft: '2px solid var(--color-cream)',
        }}
      />
    </div>
  );
}
