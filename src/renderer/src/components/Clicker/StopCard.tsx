import { Segment } from '../primitives/Segment';
import { Stepper } from '../primitives/Stepper';
import { CollapsibleCard } from '../primitives/CollapsibleCard';
import { useStore } from '../../store';
import type { StopCondition } from '../../../../shared/types';

type StopKind = StopCondition['kind'];

export function StopCard() {
  const stop = useStore((s) => s.stop);
  const setStop = useStore((s) => s.setStop);
  const open = useStore((s) => s.panels.stop);
  const togglePanel = useStore((s) => s.togglePanel);

  const summary =
    stop.kind === 'off'
      ? 'Manual · ESC to stop'
      : stop.kind === 'after-clicks'
        ? `After ${stop.count.toLocaleString('en-US')} clicks`
        : `After ${Math.round(stop.ms / 1000)}s`;

  return (
    <CollapsibleCard
      step="04"
      title="Stop condition"
      subtitle="When to halt"
      summary={summary}
      open={open}
      onToggle={() => togglePanel('stop')}
    >
      <div className="flex flex-col gap-4">
        <Segment<StopKind>
          value={stop.kind}
          onChange={(next) => {
            if (next === 'off') setStop({ kind: 'off' });
            else if (next === 'after-clicks')
              setStop({ kind: 'after-clicks', count: stop.kind === 'after-clicks' ? stop.count : 100 });
            else if (next === 'after-duration')
              setStop({ kind: 'after-duration', ms: stop.kind === 'after-duration' ? stop.ms : 60_000 });
          }}
          options={[
            { value: 'off', label: 'Manual' },
            { value: 'after-clicks', label: 'After N' },
            { value: 'after-duration', label: 'After time' },
          ]}
        />

        {stop.kind === 'off' && (
          <div className="hairline p-3 text-[var(--color-cream-dim)]">
            <span className="label-muted">Runs until you cancel — ESC or Stop</span>
          </div>
        )}
        {stop.kind === 'after-clicks' && (
          <label className="flex items-center gap-4">
            <span className="label-muted">Clicks</span>
            <Stepper
              value={stop.count}
              onChange={(count) => setStop({ kind: 'after-clicks', count })}
              min={1}
              max={1_000_000}
              step={10}
            />
          </label>
        )}
        {stop.kind === 'after-duration' && (
          <label className="flex items-center gap-4">
            <span className="label-muted">Seconds</span>
            <Stepper
              value={Math.round(stop.ms / 1000)}
              onChange={(sec) => setStop({ kind: 'after-duration', ms: sec * 1000 })}
              min={1}
              max={60 * 60 * 24}
              step={5}
            />
          </label>
        )}
      </div>
    </CollapsibleCard>
  );
}
