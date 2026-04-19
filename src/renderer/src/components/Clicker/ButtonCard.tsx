import { Segment } from '../primitives/Segment';
import { CollapsibleCard } from '../primitives/CollapsibleCard';
import { useStore } from '../../store';
import type { ClickKind, MouseButton } from '../../../../shared/types';

export function ButtonCard() {
  const button = useStore((s) => s.button);
  const kind = useStore((s) => s.kind);
  const setButton = useStore((s) => s.setButton);
  const setKind = useStore((s) => s.setKind);
  const open = useStore((s) => s.panels.button);
  const togglePanel = useStore((s) => s.togglePanel);

  const summary = `${cap(button)} · ${cap(kind)}`;

  return (
    <CollapsibleCard
      step="02"
      title="Button"
      subtitle="Mouse action"
      summary={summary}
      open={open}
      onToggle={() => togglePanel('button')}
    >
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
    </CollapsibleCard>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
