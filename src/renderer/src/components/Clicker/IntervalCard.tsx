import { Stepper } from '../primitives/Stepper';
import { CollapsibleCard } from '../primitives/CollapsibleCard';
import { useStore } from '../../store';
import { cadenceToMs, msToCadence, formatIntervalCompact, formatCps } from '../../lib/format';

export function IntervalCard() {
  const cadence = useStore((s) => s.cadence);
  const humanize = useStore((s) => s.humanize);
  const setCadence = useStore((s) => s.setCadence);
  const toggleHumanize = useStore((s) => s.toggleHumanize);
  const open = useStore((s) => s.panels.interval);
  const togglePanel = useStore((s) => s.togglePanel);

  const ms = cadenceToMs(cadence);
  const summary = `${formatIntervalCompact(ms)} · ${formatCps(ms)} cps${humanize ? ' · humanize' : ''}`;

  const seconds = Math.floor(ms / 1000);
  const millis = ms % 1000;
  const commit = (totalMs: number) => setCadence(msToCadence(Math.max(1, totalMs)));

  return (
    <CollapsibleCard
      step="01"
      title="Interval"
      subtitle="Time between clicks"
      summary={summary}
      open={open}
      onToggle={() => togglePanel('interval')}
      headerExtras={
        open ? (
          <button
            type="button"
            className="btn-ghost no-drag"
            data-active={humanize}
            onClick={(e) => {
              e.stopPropagation();
              toggleHumanize();
            }}
            style={humanize ? { background: 'var(--color-cream)', color: 'var(--color-ink)' } : undefined}
          >
            ± Humanize
          </button>
        ) : null
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Unit label="Seconds">
          <Stepper
            value={seconds}
            onChange={(n) => commit(Math.round(n) * 1000 + millis)}
            min={0}
            max={3600}
            step={1}
            size="sm"
          />
        </Unit>
        <Unit label="Milliseconds">
          <Stepper
            value={millis}
            onChange={(n) => commit(seconds * 1000 + Math.round(n))}
            min={0}
            max={999}
            step={10}
            size="sm"
          />
        </Unit>
      </div>
    </CollapsibleCard>
  );
}

function Unit({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="label-muted">{label}</span>
      {children}
    </label>
  );
}
