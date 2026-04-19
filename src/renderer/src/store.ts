import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  ClickKind,
  ClickerConfig,
  ClickerStatus,
  ClickerTick,
  MouseButton,
  StopCondition,
  Target,
} from '../../shared/types.js';
import { type Cadence, cadenceToMs } from './lib/format.js';

export type WorkspaceRoute = 'clicker' | 'sequence' | 'hotkeys' | 'run-log';

export interface ClikState {
  route: WorkspaceRoute;
  cadence: Cadence;
  button: MouseButton;
  kind: ClickKind;
  target: Target;
  stop: StopCondition;
  humanize: boolean;
  startStopHotkey: string;

  launchAtLogin: boolean;
  alwaysOnTop: boolean;
  settingsOpen: boolean;

  status: ClickerStatus;
  clicks: number;
  elapsedMs: number;
  lastError?: string;

  setRoute: (r: WorkspaceRoute) => void;
  setCadence: (patch: Partial<Cadence>) => void;
  setButton: (b: MouseButton) => void;
  setKind: (k: ClickKind) => void;
  setTarget: (t: Target) => void;
  setStop: (s: StopCondition) => void;
  toggleHumanize: () => void;
  setStartStopHotkey: (accelerator: string) => void;
  setLaunchAtLogin: (v: boolean) => void;
  setAlwaysOnTop: (v: boolean) => void;
  openSettings: () => void;
  closeSettings: () => void;
  resetSettings: () => void;
  applyTick: (t: ClickerTick) => void;
  getConfig: () => ClickerConfig;
}

const defaults = {
  cadence: { hours: 0, minutes: 0, seconds: 0, millis: 100 } satisfies Cadence,
  button: 'left' as MouseButton,
  kind: 'single' as ClickKind,
  target: { kind: 'cursor' } as Target,
  stop: { kind: 'off' } as StopCondition,
  humanize: false,
  startStopHotkey: 'Alt+Shift+C',
  launchAtLogin: false,
  alwaysOnTop: false,
};

export const useStore = create<ClikState>()(
  persist(
    (set, get) => ({
      route: 'clicker',
      ...defaults,
      settingsOpen: false,
      status: 'idle',
      clicks: 0,
      elapsedMs: 0,
      lastError: undefined,

      setRoute: (route) => set({ route }),
      setCadence: (patch) => set((s) => ({ cadence: { ...s.cadence, ...patch } })),
      setButton: (button) => set({ button }),
      setKind: (kind) => set({ kind }),
      setTarget: (target) => set({ target }),
      setStop: (stop) => set({ stop }),
      toggleHumanize: () => set((s) => ({ humanize: !s.humanize })),
      setStartStopHotkey: (startStopHotkey) => set({ startStopHotkey }),
      setLaunchAtLogin: (launchAtLogin) => set({ launchAtLogin }),
      setAlwaysOnTop: (alwaysOnTop) => set({ alwaysOnTop }),
      openSettings: () => set({ settingsOpen: true }),
      closeSettings: () => set({ settingsOpen: false }),
      resetSettings: () => set({ ...defaults, settingsOpen: false }),
      applyTick: (t) =>
        set({
          status: t.status,
          clicks: t.clicks,
          elapsedMs: t.elapsedMs,
          lastError: t.lastError,
        }),
      getConfig: (): ClickerConfig => {
        const s = get();
        return {
          intervalMs: Math.max(1, cadenceToMs(s.cadence)),
          button: s.button,
          kind: s.kind,
          target: s.target,
          stop: s.stop,
          humanize: s.humanize,
        };
      },
    }),
    {
      name: 'clik-config-v1',
      partialize: (s) => ({
        cadence: s.cadence,
        button: s.button,
        kind: s.kind,
        target: s.target,
        stop: s.stop,
        humanize: s.humanize,
        startStopHotkey: s.startStopHotkey,
        launchAtLogin: s.launchAtLogin,
        alwaysOnTop: s.alwaysOnTop,
        route: s.route,
      }),
    },
  ),
);
