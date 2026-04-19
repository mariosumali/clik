import { Segment } from '../primitives/Segment';
import { useStore } from '../../store';
import type { ClickKind, MouseButton } from '../../../../shared/types';

export function ButtonCard() {
  const button = useStore((s) => s.button);
  const kind = useStore((s) => s.kind);
  const setButton = useStore((s) => s.setButton);
  const setKind = useStore((s) => s.setKind);

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between mb-5">
        <div className="label">
          <span className="text-[var(--color-muted)] mr-2">02</span>· Button
        </div>
        <div className="label-muted">Mouse action</div>
      </div>

      <div className="flex flex-col gap-3">
        <Segment<MouseButton>
          value={button}
          onChange={setButton}
          options={[
            { value: 'left', label: 'Left' },
            { value: 'right', label: 'Right' },
            { value: 'middle', label: 'Middle' },
          ]}
        />
        <Segment<ClickKind>
          value={kind}
          onChange={setKind}
          options={[
            { value: 'single', label: 'Single' },
            { value: 'double', label: 'Double' },
            { value: 'hold', label: 'Hold' },
          ]}
        />
      </div>
    </section>
  );
}
