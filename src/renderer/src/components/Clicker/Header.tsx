import { useStore } from '../../store';
import { WorkspaceHotkey } from '../Hotkeys/WorkspaceHotkey';

export function Header() {
  const panels = useStore((s) => s.panels);
  const setAllPanels = useStore((s) => s.setAllPanels);

  const allOpen = panels.interval && panels.button && panels.target && panels.stop;

  return (
    <header className="flex items-center justify-between gap-8 pb-8">
      <div className="label-muted">
        Workspace <span className="text-[var(--color-muted)]">·</span> Untitled run
      </div>
      <div className="flex items-center gap-6">
        <WorkspaceHotkey target="clicker" />
        <button
          type="button"
          className="btn-ghost no-drag"
          onClick={() => setAllPanels(!allOpen)}
        >
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </div>
    </header>
  );
}
