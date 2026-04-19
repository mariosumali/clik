import type { ReactNode } from 'react';

interface CollapsibleCardProps {
  step: string;
  title: string;
  subtitle?: string;
  summary?: ReactNode;
  open: boolean;
  onToggle: () => void;
  headerExtras?: ReactNode;
  children: ReactNode;
}

export function CollapsibleCard({
  step,
  title,
  subtitle,
  summary,
  open,
  onToggle,
  headerExtras,
  children,
}: CollapsibleCardProps) {
  return (
    <section className="card" data-open={open}>
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-3 text-left no-drag"
          aria-expanded={open}
        >
          <Chevron open={open} />
          <div className="label">
            <span className="text-[var(--color-muted)] mr-2">{step}</span>· {title}
          </div>
        </button>

        <div className="flex items-center gap-3 min-w-0">
          {!open && summary && (
            <div className="label-muted truncate text-[var(--color-cream-dim)]">{summary}</div>
          )}
          {headerExtras}
        </div>
      </div>

      {open && <div className="px-5 pb-5 pt-1">{children}</div>}
    </section>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      className="shrink-0"
      style={{
        transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
        transition: 'transform 120ms ease',
        color: 'var(--color-cream-dim)',
      }}
      aria-hidden="true"
    >
      <path d="M3 1.5 L7 5 L3 8.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
