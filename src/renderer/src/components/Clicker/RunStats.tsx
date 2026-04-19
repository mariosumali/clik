import { useStore } from '../../store';
import { cadenceToMs, formatClicks, formatCps, formatElapsed, formatIntervalCompact } from '../../lib/format';

export function RunStats() {
  const cadence = useStore((s) => s.cadence);
  const clicks = useStore((s) => s.clicks);
  const elapsedMs = useStore((s) => s.elapsedMs);
  const intervalMs = Math.max(1, cadenceToMs(cadence));
  const cps = formatCps(intervalMs);

  return (
    <div className="grid grid-cols-4 gap-10 pt-1">
      <Stat label="CPS" value={cps} />
      <Stat label="Interval" value={formatIntervalCompact(intervalMs)} />
      <Stat label="Clicks" value={formatClicks(clicks)} />
      <Stat label="Elapsed" value={formatElapsed(elapsedMs)} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="label-muted">{label}</span>
      <span className="font-mono text-[18px] tracking-[0.02em] text-[var(--color-cream)]">{value}</span>
    </div>
  );
}
