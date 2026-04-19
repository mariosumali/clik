import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { useStore } from '../../store';

const WINDOW_MS = 1000;

interface Stats {
  liveCps: number;
  peakCps: number;
  total: number;
  lastClickAt: number | null;
  sessionStartedAt: number | null;
}

export function ClickTester() {
  const collapsed = useStore((s) => s.testerCollapsed);
  const toggle = useStore((s) => s.toggleTester);

  if (collapsed) return <CollapsedTesterRail onExpand={toggle} />;
  return <ExpandedTester onCollapse={toggle} />;
}

function ExpandedTester({ onCollapse }: { onCollapse: () => void }) {
  const clicksRef = useRef<number[]>([]); // timestamps, trimmed to WINDOW_MS
  const [stats, setStats] = useState<Stats>({
    liveCps: 0,
    peakCps: 0,
    total: 0,
    lastClickAt: null,
    sessionStartedAt: null,
  });
  const [flashAt, setFlashAt] = useState(0);

  const recalc = useCallback(() => {
    const now = performance.now();
    while (clicksRef.current.length > 0 && now - clicksRef.current[0] > WINDOW_MS) {
      clicksRef.current.shift();
    }
    const liveCps = clicksRef.current.length;
    setStats((prev) => {
      const peakCps = liveCps > prev.peakCps ? liveCps : prev.peakCps;
      if (liveCps === prev.liveCps && peakCps === prev.peakCps) return prev;
      return { ...prev, liveCps, peakCps };
    });
  }, []);

  // Decay tick so the displayed CPS drops back to 0 after the user stops clicking.
  useEffect(() => {
    const id = setInterval(recalc, 100);
    return () => clearInterval(id);
  }, [recalc]);

  const onPointerDown = useCallback((e: PointerEvent<HTMLButtonElement>) => {
    // Only primary / left-ish clicks.
    if (e.button > 2) return;
    const now = performance.now();
    clicksRef.current.push(now);
    if (clicksRef.current.length > 500) clicksRef.current.splice(0, clicksRef.current.length - 500);
    setStats((prev) => ({
      ...prev,
      total: prev.total + 1,
      lastClickAt: Date.now(),
      sessionStartedAt: prev.sessionStartedAt ?? Date.now(),
    }));
    setFlashAt(now);
    recalc();
  }, [recalc]);

  const reset = useCallback(() => {
    clicksRef.current = [];
    setStats({ liveCps: 0, peakCps: 0, total: 0, lastClickAt: null, sessionStartedAt: null });
    setFlashAt(0);
  }, []);

  const avgCps =
    stats.sessionStartedAt && stats.total > 0
      ? stats.total / Math.max(1, (Date.now() - stats.sessionStartedAt) / 1000)
      : 0;

  const flashActive = flashAt > 0 && performance.now() - flashAt < 120;

  return (
    <div className="relative h-full w-full overflow-hidden flex flex-col">
      <header className="relative px-6 pt-6 pb-4 flex items-center justify-between gap-3">
        <div className="label">Click tester</div>
        <div className="flex items-center gap-3">
          <div className="label-muted">Measures your CPS</div>
          <button
            type="button"
            className="icon-btn no-drag"
            onClick={onCollapse}
            aria-label="Collapse click tester"
            title="Collapse click tester"
          >
            <TesterChevron direction="right" />
          </button>
        </div>
      </header>

      <StatsRow stats={stats} avgCps={avgCps} />

      <div className="relative flex-1 flex items-center justify-center px-6 pb-6 min-h-0">
        <button
          type="button"
          onPointerDown={onPointerDown}
          className="no-drag relative flex flex-col items-center justify-center"
          style={{
            width: 'min(100%, 320px)',
            aspectRatio: '1',
            border: `1px solid ${flashActive ? 'var(--color-accent)' : 'var(--color-cream)'}`,
            background: flashActive ? 'var(--color-cream)' : 'var(--color-ink)',
            color: flashActive ? 'var(--color-ink)' : 'var(--color-cream)',
            transition: 'background 80ms linear, color 80ms linear, border-color 80ms linear',
          }}
        >
          <Crosshair fill={flashActive ? 'var(--color-ink)' : 'var(--color-cream)'} />
          <span className="label mt-5" style={{ color: 'inherit' }}>
            Click to test
          </span>
        </button>
      </div>

      <footer className="relative px-6 pb-6 flex items-center justify-between gap-3">
        <div className="label-muted">
          Rolling 1s window
        </div>
        <button type="button" className="btn-ghost no-drag" onClick={reset} disabled={stats.total === 0}>
          Reset
        </button>
      </footer>
    </div>
  );
}

function StatsRow({ stats, avgCps }: { stats: Stats; avgCps: number }) {
  return (
    <div className="relative px-6 pb-4 grid grid-cols-3 gap-3">
      <BigStat label="Live CPS" value={stats.liveCps.toFixed(0)} emphasis />
      <BigStat label="Peak" value={stats.peakCps.toFixed(0)} />
      <BigStat
        label="Total"
        value={stats.total.toLocaleString('en-US')}
        sub={avgCps > 0 ? `${avgCps.toFixed(2)} avg` : undefined}
      />
    </div>
  );
}

function BigStat({
  label,
  value,
  sub,
  emphasis,
}: {
  label: string;
  value: string;
  sub?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="card px-3 py-3">
      <div className="label-muted mb-1">{label}</div>
      <div
        className="font-display leading-none"
        style={{
          fontSize: emphasis ? 38 : 26,
          color: emphasis ? 'var(--color-cream)' : 'var(--color-cream-dim)',
        }}
      >
        {value}
      </div>
      {sub && <div className="label-muted mt-2">{sub}</div>}
    </div>
  );
}

function CollapsedTesterRail({ onExpand }: { onExpand: () => void }) {
  return (
    <div
      className="relative h-full w-[44px] flex flex-col items-center bg-[var(--color-ink)]"
    >
      <button
        type="button"
        className="icon-btn no-drag mt-4"
        onClick={onExpand}
        aria-label="Expand click tester"
        title="Expand click tester"
      >
        <TesterChevron direction="left" />
      </button>

      <button
        type="button"
        onClick={onExpand}
        className="no-drag flex-1 w-full flex items-center justify-center"
        aria-label="Expand click tester"
        title="Expand click tester"
      >
        <span
          className="label-muted select-none"
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
        >
          Click Tester
        </span>
      </button>
    </div>
  );
}

function TesterChevron({ direction }: { direction: 'left' | 'right' }) {
  const d = direction === 'left' ? 'M9 3 L5 8 L9 13' : 'M5 3 L9 8 L5 13';
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

function Crosshair({ fill }: { fill: string }) {
  return (
    <svg width="80" height="80" viewBox="0 0 56 56" fill="none" aria-hidden>
      <circle cx="28" cy="28" r="16" stroke={fill} strokeWidth="1.5" />
      <circle cx="28" cy="28" r="2" fill={fill} />
      <line x1="28" y1="4" x2="28" y2="16" stroke={fill} strokeWidth="1.5" />
      <line x1="28" y1="40" x2="28" y2="52" stroke={fill} strokeWidth="1.5" />
      <line x1="4" y1="28" x2="16" y2="28" stroke={fill} strokeWidth="1.5" />
      <line x1="40" y1="28" x2="52" y2="28" stroke={fill} strokeWidth="1.5" />
    </svg>
  );
}
