import { Header } from './Header';
import { IntervalCard } from './IntervalCard';
import { ButtonCard } from './ButtonCard';
import { TargetCard } from './TargetCard';
import { StopCard } from './StopCard';
import { StartButton } from './StartButton';
import { RunStats } from './RunStats';
import { ClickTester } from '../Tester/ClickTester';
import { useStore } from '../../store';

interface ClickerPageProps {
  onFire: () => void;
  onCancel: () => void;
}

export function ClickerPage({ onFire, onCancel }: ClickerPageProps) {
  const testerCollapsed = useStore((s) => s.testerCollapsed);

  return (
    <div
      className="grid h-full"
      style={{ gridTemplateColumns: testerCollapsed ? '1fr 44px' : '1fr 420px' }}
    >
      <div className="overflow-y-auto px-10 pt-10 pb-6">
        <Header />

        <div className="flex flex-col gap-6">
          <IntervalCard />
          <div className="grid grid-cols-2 gap-6">
            <ButtonCard />
            <TargetCard />
          </div>
          <StopCard />
          <div className="mt-2">
            <StartButton onFire={onFire} onCancel={onCancel} />
          </div>
          <RunStats />
        </div>
      </div>

      <div className="border-l border-[var(--color-line)] h-full min-h-0">
        <ClickTester />
      </div>
    </div>
  );
}
