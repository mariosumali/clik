import { useMemo, useState } from 'react';
import { useStore, type RunLogEntry, type RunOutcome } from '../../store';
import type { StopCondition, Target } from '../../../../shared/types';
import { formatClicks, formatElapsed, formatIntervalCompact } from '../../lib/format';

type FilterKey = 'all' | 'clicker' | 'sequence';

export function RunLogPage() {
  const runLog = useStore((s) => s.runLog);
  const clearRunLog = useStore((s) => s.clearRunLog);
  const [filter, setFilter] = useState<FilterKey>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return runLog;
    return runLog.filter((r) => r.workspace === filter);
  }, [runLog, filter]);

  const totals = useMemo(() => {
    let clicks = 0;
    let elapsedMs = 0;
    for (const r of runLog) {
      clicks += r.clicks;
      elapsedMs += r.elapsedMs;
    }
    return { runs: runLog.length, clicks, elapsedMs };
  }, [runLog]);

  return (
    <div className="h-full overflow-y-auto px-10 pt-10 pb-6 max-w-[960px]">
      <header className="flex items-center justify-between gap-8 pb-8">
        <div className="label-muted">
          Workspace <span className="text-[var(--color-muted)]">·</span> Run log
        </div>
        <div className="label-muted">
          {totals.runs} {totals.runs === 1 ? 'run' : 'runs'}
          {totals.runs > 0 && (
            <>
              {' · '}
              <span className="text-[var(--color-cream-dim)]">
                {formatClicks(totals.clicks)} clicks · {formatElapsed(totals.elapsedMs)} total
              </span>
            </>
          )}
        </div>
      </header>

      <section className="card p-5">
        <div className="flex items-center justify-between mb-5 gap-4">
          <div className="flex items-center gap-3">
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
              All
            </FilterChip>
            <FilterChip active={filter === 'clicker'} onClick={() => setFilter('clicker')}>
              Clicker
            </FilterChip>
            <FilterChip active={filter === 'sequence'} onClick={() => setFilter('sequence')}>
              Sequence
            </FilterChip>
          </div>
          {runLog.length > 0 && (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                if (window.confirm('Clear the entire run log?')) clearRunLog();
              }}
              style={{ color: 'var(--color-danger)' }}
            >
              Clear log
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <EmptyState filter={filter} hasAny={runLog.length > 0} />
        ) : (
          <div className="flex flex-col">
            <HeaderRow />
            {filtered.map((entry) => (
              <RunRow key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-2 text-[10px] tracking-[0.18em] uppercase border"
      style={{
        borderColor: active ? 'var(--color-cream)' : 'var(--color-line)',
        background: active ? 'var(--color-cream)' : 'transparent',
        color: active ? 'var(--color-ink)' : 'var(--color-cream)',
      }}
    >
      {children}
    </button>
  );
}

function EmptyState({ filter, hasAny }: { filter: FilterKey; hasAny: boolean }) {
  const subtitle =
    hasAny && filter !== 'all'
      ? `No ${filter} runs recorded yet.`
      : 'Start a run and every session will appear here.';
  return (
    <div className="hairline p-8 text-center">
      <div className="label mb-2">Nothing logged</div>
      <div className="label-muted">{subtitle}</div>
    </div>
  );
}

// Two-row layout per entry: a primary row with the core metrics, and a dim
// secondary row with the run's config fingerprint. Keeps the table scannable
// while still carrying enough info to tell runs apart.
function RunRow({ entry }: { entry: RunLogEntry }) {
  return (
    <div
      className="grid items-center gap-4 py-3 border-t border-[var(--color-line)]"
      style={{ gridTemplateColumns: '120px 90px 110px 110px 100px 1fr' }}
    >
      <div className="label-muted text-[var(--color-cream-dim)]">
        {formatTimestamp(entry.startedAt)}
      </div>
      <WorkspaceBadge workspace={entry.workspace} />
      <div className="font-mono text-[13px] text-[var(--color-cream)]">
        {formatClicks(entry.clicks)}
      </div>
      <div className="font-mono text-[13px] text-[var(--color-cream)]">
        {formatElapsed(entry.elapsedMs)}
      </div>
      <OutcomePill outcome={entry.outcome} />
      <div className="label-muted truncate" title={describeRun(entry)}>
        {describeRun(entry)}
      </div>
    </div>
  );
}

function HeaderRow() {
  return (
    <div
      className="grid items-center gap-4 pb-2 label-muted"
      style={{ gridTemplateColumns: '120px 90px 110px 110px 100px 1fr' }}
    >
      <div>Started</div>
      <div>Source</div>
      <div>Clicks</div>
      <div>Elapsed</div>
      <div>Outcome</div>
      <div>Config</div>
    </div>
  );
}

function WorkspaceBadge({ workspace }: { workspace: RunLogEntry['workspace'] }) {
  return (
    <span
      className="inline-block px-2 py-1 text-[10px] tracking-[0.18em] uppercase"
      style={{
        border: '1px solid var(--color-line)',
        color: 'var(--color-cream-dim)',
      }}
    >
      {workspace}
    </span>
  );
}

function OutcomePill({ outcome }: { outcome: RunOutcome }) {
  const palette: Record<RunOutcome, { label: string; color: string }> = {
    completed: { label: 'Completed', color: 'var(--color-accent)' },
    stopped: { label: 'Stopped', color: 'var(--color-cream-dim)' },
    error: { label: 'Error', color: 'var(--color-danger)' },
  };
  const { label, color } = palette[outcome];
  return (
    <span className="inline-flex items-center gap-2 text-[10px] tracking-[0.18em] uppercase">
      <span className="inline-block w-[7px] h-[7px]" style={{ background: color }} />
      <span style={{ color }}>{label}</span>
    </span>
  );
}

function describeRun(entry: RunLogEntry): string {
  const parts: string[] = [];
  parts.push(`${entry.button[0].toUpperCase()}${entry.button.slice(1)} ${entry.kind}`);
  parts.push(describeTarget(entry.targetKind, entry.pointCount));
  parts.push(describeCadence(entry));
  parts.push(describeStop(entry.stop));
  if (entry.humanize) parts.push('humanize');
  if (entry.reason && entry.outcome !== 'completed') {
    parts.push(`reason: ${explainReason(entry.reason)}`);
  }
  return parts.join(' · ');
}

function describeTarget(kind: Target['kind'], pointCount?: number): string {
  if (kind === 'cursor') return 'cursor';
  if (kind === 'fixed') return 'fixed point';
  return `sequence (${pointCount ?? 0})`;
}

function describeCadence(entry: RunLogEntry): string {
  if (entry.targetKind === 'sequence') {
    return `avg ${formatIntervalCompact(entry.intervalMs)}`;
  }
  return `every ${formatIntervalCompact(entry.intervalMs)}`;
}

function describeStop(stop: StopCondition): string {
  if (stop.kind === 'off') return 'manual';
  if (stop.kind === 'after-clicks') return `stop @ ${stop.count.toLocaleString('en-US')} clicks`;
  return `stop @ ${formatIntervalCompact(stop.ms)}`;
}

function explainReason(reason: string): string {
  if (reason === 'hotkey-toggle') return 'hotkey';
  if (reason === 'helper-failed') return 'helper failure';
  if (reason === 'empty-sequence') return 'no points';
  if (reason === 'kill-zone') return 'kill zone';
  if (reason === 'grant-accessibility') return 'accessibility not granted';
  return reason;
}

function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  if (sameDay) return `${hh}:${mm}`;
  const mon = d.toLocaleString('en-US', { month: 'short' });
  return `${mon} ${d.getDate()} · ${hh}:${mm}`;
}
