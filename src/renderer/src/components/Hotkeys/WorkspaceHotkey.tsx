import { useStore } from '../../store';
import type { HotkeyTarget } from '../../../../shared/types';
import { HotkeyRecorder } from './HotkeyRecorder';

// Each workspace (clicker / sequence / autonomy) owns its own global shortcut
// slot. This small wrapper binds HotkeyRecorder to the store + main process
// for a given target so every embed site stays a one-liner.
const DEFAULTS: Record<HotkeyTarget, string> = {
  clicker: 'Alt+Shift+C',
  sequence: 'Alt+Shift+S',
  autonomy: 'Alt+Shift+A',
};

interface WorkspaceHotkeyProps {
  target: HotkeyTarget;
  /** Optional label shown before the recorder; defaults to "Hotkey". */
  label?: string;
}

export function WorkspaceHotkey({ target, label = 'Hotkey' }: WorkspaceHotkeyProps) {
  const accelerator = useStore((s) => s.hotkeys[target]);
  const setHotkey = useStore((s) => s.setHotkey);

  const validate = async (next: string) => {
    // Round-trip through the main process so collisions and OS-level rejections
    // (another app already owns the combo) surface inline.
    const res = await window.clik.setHotkey(target, next);
    return { ok: res.ok, err: res.err };
  };

  return (
    <div className="flex items-center gap-3">
      <span className="label-muted">{label}</span>
      <HotkeyRecorder
        value={accelerator}
        defaultValue={DEFAULTS[target]}
        onChange={(next) => setHotkey(target, next)}
        onValidate={validate}
      />
    </div>
  );
}
