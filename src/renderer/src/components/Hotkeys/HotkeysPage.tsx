import { useStore } from '../../store';
import { HotkeyRecorder } from './HotkeyRecorder';

const DEFAULT_HOTKEY = 'Alt+Shift+C';

export function HotkeysPage() {
  const hotkey = useStore((s) => s.startStopHotkey);
  const setHotkey = useStore((s) => s.setStartStopHotkey);

  const validate = async (accelerator: string) => {
    const res = await window.clik.setStartStopHotkey(accelerator);
    return { ok: res.ok, err: res.err };
  };

  return (
    <div className="h-full overflow-auto px-10 py-10 max-w-[720px]">
      <div className="label-muted mb-8">Hotkeys</div>

      <section className="card p-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="label mb-1">Start / stop</div>
            <div className="label-muted">
              Global across your whole Mac — works while another app is focused.
            </div>
          </div>
          <HotkeyRecorder
            value={hotkey}
            defaultValue={DEFAULT_HOTKEY}
            onChange={setHotkey}
            onValidate={validate}
          />
        </div>

        <ul className="mt-6 space-y-2 label-muted">
          <li>• At least one modifier is required (⌘, ⌃, ⌥, ⇧).</li>
          <li>• If another app already owns the combo, register will fail — pick another.</li>
          <li>• In-window shortcuts: ⏎ fires, Esc cancels.</li>
        </ul>
      </section>
    </div>
  );
}
