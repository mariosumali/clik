import { Stepper } from '../primitives/Stepper';
import { useStore } from '../../store';

export function IntervalCard() {
  const cadence = useStore((s) => s.cadence);
  const humanize = useStore((s) => s.humanize);
  const setCadence = useStore((s) => s.setCadence);
  const toggleHumanize = useStore((s) => s.toggleHumanize);

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between mb-5">
        <div className="label">
          <span className="text-[var(--color-muted)] mr-2">01</span>· Interval
        </div>
        <div className="label-muted">Time between clicks</div>
      </div>

      <div className="grid grid-cols-3 gap-6 mb-5">
        <Field label="Hours">
          <Stepper value={cadence.hours} onChange={(n) => setCadence({ hours: n })} min={0} max={99} />
        </Field>
        <Field label="Minutes">
          <Stepper value={cadence.minutes} onChange={(n) => setCadence({ minutes: n })} min={0} max={59} />
        </Field>
        <Field label="Seconds">
          <Stepper value={cadence.seconds} onChange={(n) => setCadence({ seconds: n })} min={0} max={59} />
        </Field>
      </div>

      <div className="grid grid-cols-[auto_1fr] items-end gap-6">
        <Field label="Millis">
          <Stepper
            value={cadence.millis}
            onChange={(n) => setCadence({ millis: n })}
            min={0}
            max={999}
            step={10}
          />
        </Field>
        <div className="flex justify-end">
          <button
            type="button"
            className="btn-ghost no-drag"
            data-active={humanize}
            onClick={toggleHumanize}
            style={humanize ? { background: 'var(--color-cream)', color: 'var(--color-ink)' } : undefined}
          >
            ± Humanize
          </button>
        </div>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="label-muted">{label}</span>
      {children}
    </label>
  );
}
