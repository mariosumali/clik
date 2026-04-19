import { useStore, type WorkspaceRoute } from '../store';

interface NavEntry {
  id: WorkspaceRoute;
  label: string;
  stub?: boolean;
}

const nav: NavEntry[] = [
  { id: 'clicker', label: 'Clicker' },
  { id: 'sequence', label: 'Sequence' },
  { id: 'autonomy', label: 'Autonomy' },
  { id: 'run-log', label: 'Run Log' },
];

export function Sidebar() {
  const collapsed = useStore((s) => s.sidebarCollapsed);
  const toggle = useStore((s) => s.toggleSidebar);

  if (collapsed) return <CollapsedRail onExpand={toggle} />;
  return <ExpandedSidebar onCollapse={toggle} />;
}

function ExpandedSidebar({ onCollapse }: { onCollapse: () => void }) {
  const route = useStore((s) => s.route);
  const status = useStore((s) => s.status);
  const setRoute = useStore((s) => s.setRoute);
  const openSettings = useStore((s) => s.openSettings);

  return (
    <aside
      className="w-[240px] shrink-0 h-full flex flex-col bg-[var(--color-ink)]"
      style={{ borderRight: '1px solid var(--color-line)' }}
    >
      <div className="drag-region h-[52px] pl-[78px] pr-2 flex items-center justify-between border-b border-[var(--color-line)]">
        <div className="flex items-center gap-3 no-drag">
          <Logo />
          <div>
            <div className="font-mono text-[13px] tracking-[0.12em] text-[var(--color-cream)]">CLIK</div>
            <div className="text-[10px] tracking-[0.12em] text-[var(--color-muted)]">v1.0.4 · macOS</div>
          </div>
        </div>
        <button
          type="button"
          className="icon-btn no-drag"
          onClick={onCollapse}
          aria-label="Collapse sidebar"
          title="Collapse sidebar"
        >
          <Chevron direction="left" />
        </button>
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

function CollapsedRail({ onExpand }: { onExpand: () => void }) {
  const route = useStore((s) => s.route);
  const status = useStore((s) => s.status);
  const setRoute = useStore((s) => s.setRoute);
  const openSettings = useStore((s) => s.openSettings);

  const running = status === 'running';

  return (
    <aside
      className="w-[44px] shrink-0 h-full flex flex-col bg-[var(--color-ink)]"
      style={{ borderRight: '1px solid var(--color-line)' }}
    >
      {/* Drag region matches expanded header height so the traffic lights area
          above stays draggable and visually consistent. */}
      <div className="drag-region h-[52px] border-b border-[var(--color-line)]" />

      <div className="pt-3 pb-3 border-b border-[var(--color-line)] flex flex-col items-center gap-3">
        <button
          type="button"
          className="icon-btn no-drag"
          onClick={onExpand}
          aria-label="Expand sidebar"
          title="Expand sidebar"
        >
          <Chevron direction="right" />
        </button>
        <span
          className="inline-block w-[9px] h-[9px]"
          title={running ? 'Running' : 'Idle'}
          aria-label={running ? 'Running' : 'Idle'}
          style={{
            background: running ? 'var(--color-accent)' : 'var(--color-cream-dim)',
            boxShadow: running ? '0 0 0 3px color-mix(in srgb, var(--color-accent) 22%, transparent)' : undefined,
          }}
        />
      </div>

      <nav className="flex flex-col items-center pt-3 gap-1">
        {nav.map((n) => (
          <button
            key={n.id}
            type="button"
            className="rail-btn no-drag"
            data-active={route === n.id}
            onClick={() => !n.stub && setRoute(n.id)}
            title={n.stub ? `${n.label} · Coming soon` : n.label}
            aria-label={n.label}
            style={n.stub ? { opacity: 0.45 } : undefined}
          >
            <span className="nav-glyph" />
          </button>
        ))}
      </nav>

      <div className="mt-auto pb-3 flex flex-col items-center">
        <button
          type="button"
          className="icon-btn no-drag"
          onClick={openSettings}
          aria-label="Open settings"
          title="Settings"
        >
          <GearGlyph />
        </button>
      </div>
    </aside>
  );
}

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  const d = direction === 'left' ? 'M9 3 L5 8 L9 13' : 'M5 3 L9 8 L5 13';
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" strokeLinejoin="miter" />
    </svg>
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
