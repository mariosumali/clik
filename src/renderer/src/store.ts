import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  ClickKind,
  ClickerConfig,
  ClickerStatus,
  ClickerTick,
  HotkeyTarget,
  KillZone,
  MouseButton,
  StopCondition,
  Target,
} from '../../shared/types.js';
import type {
  AutonomyEdge,
  AutonomyFlow,
  AutonomyNode,
  AutonomyNodeKind,
  AutonomyPort,
  AutonomyTick,
} from '../../shared/autonomy.js';
import { type Cadence, cadenceToMs } from './lib/format.js';

export type WorkspaceRoute =
  | 'clicker'
  | 'sequence'
  | 'autonomy'
  | 'run-log';
export type Density = 'comfy' | 'compact';
export type ThemeMode =
  | 'system'
  | 'dark'
  | 'light'
  | 'phosphor'
  | 'amber'
  | 'paper'
  | 'solar-dark'
  | 'dracula'
  | 'hi-contrast';

export interface SequencePoint {
  id: string;
  x: number;
  y: number;
  dwellMs: number;
}

export type RunOutcome = 'completed' | 'stopped' | 'error';

// One entry per invocation of the clicker. Captured in the renderer because the
// renderer is the only place that observes both the originating config (which
// workspace started it) and the terminal tick with the final click count.
export interface RunLogEntry {
  id: string;
  startedAt: number;
  endedAt: number;
  workspace: 'clicker' | 'sequence';
  intervalMs: number;
  button: MouseButton;
  kind: ClickKind;
  targetKind: Target['kind'];
  pointCount?: number;
  stop: StopCondition;
  humanize: boolean;
  clicks: number;
  elapsedMs: number;
  outcome: RunOutcome;
  reason?: string;
}

const MAX_RUN_LOG_ENTRIES = 200;

export type PanelKey = 'interval' | 'button' | 'target' | 'stop';
export interface PanelState {
  interval: boolean;
  button: boolean;
  target: boolean;
  stop: boolean;
}

export const ACCENT_PRESETS = [
  { id: 'lime', label: 'Lime', value: '#d8ff00' },
  { id: 'mint', label: 'Mint', value: '#5effb6' },
  { id: 'sky', label: 'Sky', value: '#6ad1ff' },
  { id: 'magenta', label: 'Magenta', value: '#ff5ecf' },
  { id: 'amber', label: 'Amber', value: '#ffb23f' },
  { id: 'cream', label: 'Cream', value: '#efeadd' },
] as const;

export const THEME_PRESETS = [
  { id: 'phosphor', label: 'Phosphor', bg: '#05100a', fg: '#7dff9f' },
  { id: 'amber', label: 'Amber', bg: '#120a00', fg: '#ffb74a' },
  { id: 'paper', label: 'Paper', bg: '#f4ecd4', fg: '#2a2014' },
  { id: 'solar-dark', label: 'Solar Dark', bg: '#002b36', fg: '#93a1a1' },
  { id: 'dracula', label: 'Dracula', bg: '#282a36', fg: '#f8f8f2' },
  { id: 'hi-contrast', label: 'Hi Contrast', bg: '#000000', fg: '#ffffff' },
] as const satisfies ReadonlyArray<{ id: ThemeMode; label: string; bg: string; fg: string }>;

export interface ClikState {
  route: WorkspaceRoute;
  cadence: Cadence;
  button: MouseButton;
  kind: ClickKind;
  target: Target;
  stop: StopCondition;
  humanize: boolean;

  // Per-workspace global start/stop hotkeys. Each entry is an Electron
  // accelerator string; an empty string disables that slot.
  hotkeys: Record<HotkeyTarget, string>;

  // Clicker workspace — which collapsible cards are expanded.
  panels: PanelState;

  // Chrome collapse — left sidebar & right click-tester.
  sidebarCollapsed: boolean;
  testerCollapsed: boolean;

  // Appearance.
  accent: string;
  density: Density;
  reduceMotion: boolean;
  theme: ThemeMode;

  // Window & dock.
  launchAtLogin: boolean;
  alwaysOnTop: boolean;
  dockVisible: boolean;
  closeToTray: boolean;

  // Menu-bar popover.
  popoverAutoHide: boolean;

  // Feedback.
  soundOnEvents: boolean;
  notifyOnComplete: boolean;
  confirmBeforeStop: boolean;

  // Power.
  preventSleep: boolean;

  // Kill zones — a safety layer. When `killZonesEnabled` is true, the clicker
  // engine aborts a run if a click would land inside any enabled zone. Presets
  // ('corners', 'edges') are expanded per-display in the main process; custom
  // 'rect' zones are stored in screen points exactly as the user drew them.
  killZonesEnabled: boolean;
  killZones: KillZone[];

  // Sequence workspace — points + per-run settings, independent of the Clicker
  // workspace's target / button / stop fields.
  sequencePoints: SequencePoint[];
  sequenceButton: MouseButton;
  sequenceStop: StopCondition;
  sequenceHumanize: boolean;

  // Autonomy workspace — a collection of node-map flows and pointers to the
  // currently-selected one.
  autonomyFlows: AutonomyFlow[];
  activeFlowId: string | null;
  selectedNodeId: string | null;
  autonomyStatus: 'idle' | 'running' | 'error';
  autonomyCurrentNode: string | null;
  autonomyIterations: number;
  autonomyElapsedMs: number;
  autonomyLastError?: string;
  autonomyLastFound: { x: number; y: number; score: number } | null;

  // Autonomy editor history — snapshots of the *active* flow. Not persisted.
  // Discrete actions push onto `past`; undo moves them to `future`. Rapid
  // repeat actions of the same `kind` within COALESCE_MS merge into the
  // previous entry so e.g. a Stepper click-spam or a mid-drag move doesn't
  // bury the stack.
  autonomyPast: AutonomyFlow[];
  autonomyFuture: AutonomyFlow[];
  autonomyLastPushAt: number;
  autonomyLastPushKind: string;

  // Autonomy clipboard — last copied/cut selection. Cross-flow paste works
  // because clipboard stores a detached node+edge subset.
  autonomyClipboard: {
    nodes: AutonomyNode[];
    edges: AutonomyEdge[];
  } | null;

  // Unsaved DSL text per flow, keyed by flow id. Set while the Code view is
  // editing and the text either hasn't parsed yet or parses to the current
  // flow. Cleared when the user abandons the draft or when the graph is
  // refreshed from code. Not persisted.
  autonomyCodeDrafts: Record<string, string>;

  // Transient UI flag — not persisted.
  settingsOpen: boolean;

  // Run log — append-only history of completed runs, capped.
  runLog: RunLogEntry[];

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
  setHotkey: (target: HotkeyTarget, accelerator: string) => void;

  togglePanel: (key: PanelKey) => void;
  setAllPanels: (open: boolean) => void;

  toggleSidebar: () => void;
  toggleTester: () => void;

  setAccent: (v: string) => void;
  setDensity: (v: Density) => void;
  setReduceMotion: (v: boolean) => void;
  setTheme: (v: ThemeMode) => void;
  setLaunchAtLogin: (v: boolean) => void;
  setAlwaysOnTop: (v: boolean) => void;
  setDockVisible: (v: boolean) => void;
  setCloseToTray: (v: boolean) => void;
  setPopoverAutoHide: (v: boolean) => void;
  setSoundOnEvents: (v: boolean) => void;
  setNotifyOnComplete: (v: boolean) => void;
  setConfirmBeforeStop: (v: boolean) => void;
  setPreventSleep: (v: boolean) => void;

  toggleKillZonesEnabled: () => void;
  addKillZoneRect: (rect: { x: number; y: number; w: number; h: number }, name?: string) => string;
  updateKillZone: (id: string, patch: Partial<KillZone>) => void;
  removeKillZone: (id: string) => void;
  renameKillZone: (id: string, name: string) => void;

  openSettings: () => void;
  closeSettings: () => void;
  resetPreferences: () => void;

  addSequencePoint: (p?: Partial<Omit<SequencePoint, 'id'>>) => void;
  updateSequencePoint: (id: string, patch: Partial<Omit<SequencePoint, 'id'>>) => void;
  removeSequencePoint: (id: string) => void;
  moveSequencePoint: (id: string, dir: -1 | 1) => void;
  clearSequencePoints: () => void;
  setSequenceButton: (b: MouseButton) => void;
  setSequenceStop: (s: StopCondition) => void;
  toggleSequenceHumanize: () => void;

  applyTick: (t: ClickerTick) => void;
  getConfig: () => ClickerConfig;
  getSequenceConfig: () => ClickerConfig;

  appendRunLog: (entry: RunLogEntry) => void;
  clearRunLog: () => void;

  // Autonomy actions.
  createFlow: (name?: string) => string;
  renameFlow: (id: string, name: string) => void;
  deleteFlow: (id: string) => void;
  setActiveFlow: (id: string | null) => void;
  setSelectedNode: (id: string | null) => void;
  addAutonomyNode: (kind: AutonomyNodeKind, at?: { x: number; y: number }) => string | null;
  updateAutonomyNode: (id: string, patch: Partial<AutonomyNode>) => void;
  moveAutonomyNode: (id: string, x: number, y: number) => void;
  removeAutonomyNode: (id: string) => void;
  addAutonomyEdge: (fromId: string, fromPort: AutonomyPort, toId: string) => void;
  removeAutonomyEdge: (id: string) => void;
  applyAutonomyTick: (t: AutonomyTick) => void;

  // Replace the nodes/edges/maxSteps of a flow wholesale. Used by the Code
  // view after a successful DSL parse. Pushes one undo snapshot.
  replaceAutonomyFlow: (id: string, next: AutonomyFlow) => void;

  // Draft DSL text, in-memory only. `null` clears the draft.
  setAutonomyCodeDraft: (id: string, text: string | null) => void;

  // Autonomy editor — undo/redo/clipboard operations.
  beginAutonomyDrag: (id: string) => void;
  undoAutonomy: () => void;
  redoAutonomy: () => void;
  copyAutonomySelection: () => void;
  cutAutonomySelection: () => void;
  pasteAutonomy: () => void;
  duplicateAutonomySelection: () => void;
}

const HISTORY_CAP = 50;
const COALESCE_MS = 800;

// Deep clone — flows are JSON-safe (no Dates, Maps, functions) so structuredClone
// is both correct and fast.
function cloneFlow(f: AutonomyFlow): AutonomyFlow {
  return structuredClone(f);
}

// Produce a partial state patch that (a) snapshots the currently-active flow
// into `autonomyPast`, (b) clears `autonomyFuture`, and (c) bookkeeps coalesce
// metadata. Returns an empty patch if there is no active flow, or if the last
// push was the same `kind` within COALESCE_MS (the existing top-of-stack entry
// already captures the pre-edit state, so we don't need another).
function pushHistoryPatch(st: ClikState, kind: string): Partial<ClikState> {
  const f = st.autonomyFlows.find((x) => x.id === st.activeFlowId);
  if (!f) return {};
  const now = Date.now();
  if (st.autonomyLastPushKind === kind && now - st.autonomyLastPushAt < COALESCE_MS) {
    return { autonomyLastPushAt: now };
  }
  const past = [...st.autonomyPast, cloneFlow(f)];
  if (past.length > HISTORY_CAP) past.splice(0, past.length - HISTORY_CAP);
  return {
    autonomyPast: past,
    autonomyFuture: [],
    autonomyLastPushAt: now,
    autonomyLastPushKind: kind,
  };
}

const defaults = {
  cadence: { hours: 0, minutes: 0, seconds: 0, millis: 100 } satisfies Cadence,
  button: 'left' as MouseButton,
  kind: 'single' as ClickKind,
  target: { kind: 'cursor' } as Target,
  stop: { kind: 'off' } as StopCondition,
  humanize: false,

  // Defaults are mnemonic: C = clicker, S = sequence, A = autonomy. The main
  // process registers the same defaults pre-renderer-boot.
  hotkeys: {
    clicker: 'Alt+Shift+C',
    sequence: 'Alt+Shift+S',
    autonomy: 'Alt+Shift+A',
  } satisfies Record<HotkeyTarget, string>,

  panels: { interval: true, button: true, target: true, stop: true } satisfies PanelState,

  sidebarCollapsed: false,
  testerCollapsed: false,

  accent: '#d8ff00',
  density: 'comfy' as Density,
  reduceMotion: false,
  theme: 'dark' as ThemeMode,

  launchAtLogin: false,
  alwaysOnTop: false,
  dockVisible: true,
  closeToTray: true,

  popoverAutoHide: true,

  soundOnEvents: false,
  notifyOnComplete: false,
  confirmBeforeStop: false,

  preventSleep: false,

  killZonesEnabled: false,
  killZones: [
    {
      id: 'preset-edges',
      name: 'Screen edges',
      kind: 'edges',
      enabled: false,
      margin: 8,
    },
    {
      id: 'preset-corners',
      name: 'Screen corners',
      kind: 'corners',
      enabled: false,
      size: 24,
    },
  ] as KillZone[],

  sequencePoints: [] as SequencePoint[],
  sequenceButton: 'left' as MouseButton,
  sequenceStop: { kind: 'off' } as StopCondition,
  sequenceHumanize: false,

  autonomyFlows: [] as AutonomyFlow[],
  activeFlowId: null as string | null,
};

function newPointId(): string {
  const cryptoObj = (globalThis as unknown as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function newId(prefix: string): string {
  const cryptoObj = (globalThis as unknown as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoObj?.randomUUID) return `${prefix}_${cryptoObj.randomUUID().slice(0, 8)}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function makeDefaultNode(kind: AutonomyNodeKind, at: { x: number; y: number }): AutonomyNode {
  const id = newId(kind);
  const xy = { x: at.x, y: at.y };
  switch (kind) {
    case 'start':
      return { id, kind: 'start', ...xy };
    case 'end':
      return { id, kind: 'end', ...xy };
    case 'wait':
      return { id, kind: 'wait', ...xy, ms: 500 };
    case 'click':
      return {
        id,
        kind: 'click',
        ...xy,
        button: 'left',
        clickKind: 'single',
        target: { kind: 'last-match' },
      };
    case 'move':
      return {
        id,
        kind: 'move',
        ...xy,
        target: { kind: 'fixed', x: 200, y: 200 },
        style: 'teleport',
        durationMs: 400,
        curvature: 0.3,
        jitter: 0.2,
      };
    case 'find':
      return {
        id,
        kind: 'find',
        ...xy,
        template: null,
        searchRegion: null,
        threshold: 0.2,
      };
    case 'branch':
      return { id, kind: 'branch', ...xy, condition: 'last-found' };

    case 'loop':
      return { id, kind: 'loop', ...xy, count: 10 };
    case 'counter':
      return { id, kind: 'counter', ...xy, varName: 'counter', op: 'inc', amount: 1 };
    case 'set-var':
      return {
        id,
        kind: 'set-var',
        ...xy,
        varName: 'x',
        source: { kind: 'literal-number', value: 0 },
      };
    case 'random-wait':
      return { id, kind: 'random-wait', ...xy, minMs: 200, maxMs: 800 };
    case 'random-branch':
      return { id, kind: 'random-branch', ...xy, probability: 0.5 };
    case 'stop-error':
      return { id, kind: 'stop-error', ...xy, message: 'stopped' };

    case 'log':
      return { id, kind: 'log', ...xy, message: 'step {iterations}', severity: 'info' };
    case 'notify':
      return { id, kind: 'notify', ...xy, title: 'CLIK', body: 'flow event' };

    case 'wait-until-found':
      return {
        id,
        kind: 'wait-until-found',
        ...xy,
        template: null,
        searchRegion: null,
        threshold: 0.2,
        intervalMs: 250,
        timeoutMs: 5000,
      };
    case 'wait-until-gone':
      return {
        id,
        kind: 'wait-until-gone',
        ...xy,
        template: null,
        searchRegion: null,
        threshold: 0.2,
        intervalMs: 250,
        timeoutMs: 5000,
      };

    case 'scroll':
      return { id, kind: 'scroll', ...xy, dx: 0, dy: 3, target: { kind: 'cursor' } };
    case 'keypress':
      return { id, kind: 'keypress', ...xy, key: 'Enter', modifiers: [] };
    case 'hotkey':
      return { id, kind: 'hotkey', ...xy, preset: 'copy' };
    case 'type-text':
      return { id, kind: 'type-text', ...xy, text: 'Hello {iterations}', perCharDelayMs: 0 };
    case 'drag':
      return {
        id,
        kind: 'drag',
        ...xy,
        button: 'left',
        from: { kind: 'fixed', x: 100, y: 100 },
        to: { kind: 'fixed', x: 300, y: 300 },
        steps: 24,
        stepDelayMs: 8,
      };
    case 'screenshot':
      return {
        id,
        kind: 'screenshot',
        ...xy,
        region: null,
        toClipboard: true,
        saveToDisk: false,
      };
  }
}

function makeStarterFlow(name = 'Untitled flow'): AutonomyFlow {
  const now = Date.now();
  const start = makeDefaultNode('start', { x: 60, y: 160 });
  const end = makeDefaultNode('end', { x: 560, y: 160 });
  return {
    id: newId('flow'),
    name,
    nodes: [start, end],
    edges: [],
    createdAt: now,
    updatedAt: now,
    maxSteps: 1000,
  };
}

function updateFlow(flows: AutonomyFlow[], id: string | null, patch: (f: AutonomyFlow) => AutonomyFlow): AutonomyFlow[] {
  if (!id) return flows;
  return flows.map((f) => (f.id === id ? { ...patch(f), updatedAt: Date.now() } : f));
}

function averageDwell(points: SequencePoint[]): number {
  if (points.length === 0) return 100;
  const total = points.reduce((acc, p) => acc + Math.max(1, p.dwellMs), 0);
  return Math.max(1, Math.round(total / points.length));
}

// Fields that are part of the "preferences" surface — wiped by Reset.
const preferenceKeys = [
  'accent',
  'density',
  'reduceMotion',
  'theme',
  'launchAtLogin',
  'alwaysOnTop',
  'dockVisible',
  'closeToTray',
  'popoverAutoHide',
  'soundOnEvents',
  'notifyOnComplete',
  'confirmBeforeStop',
  'preventSleep',
] as const;

export const useStore = create<ClikState>()(
  persist(
    (set, get) => ({
      route: 'clicker',
      ...defaults,
      settingsOpen: false,
      runLog: [],
      status: 'idle',
      clicks: 0,
      elapsedMs: 0,
      lastError: undefined,
      selectedNodeId: null,
      autonomyStatus: 'idle',
      autonomyCurrentNode: null,
      autonomyIterations: 0,
      autonomyElapsedMs: 0,
      autonomyLastError: undefined,
      autonomyLastFound: null,
      autonomyPast: [],
      autonomyFuture: [],
      autonomyLastPushAt: 0,
      autonomyLastPushKind: '',
      autonomyClipboard: null,
      autonomyCodeDrafts: {},

      setRoute: (route) => set({ route }),
      setCadence: (patch) => set((s) => ({ cadence: { ...s.cadence, ...patch } })),
      setButton: (button) => set({ button }),
      setKind: (kind) => set({ kind }),
      setTarget: (target) => set({ target }),
      setStop: (stop) => set({ stop }),
      toggleHumanize: () => set((s) => ({ humanize: !s.humanize })),
      setHotkey: (target, accelerator) =>
        set((s) => ({ hotkeys: { ...s.hotkeys, [target]: accelerator } })),

      togglePanel: (key) =>
        set((s) => ({ panels: { ...s.panels, [key]: !s.panels[key] } })),
      setAllPanels: (open) =>
        set({ panels: { interval: open, button: open, target: open, stop: open } }),

      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      toggleTester: () =>
        set((s) => {
          const nextCollapsed = !s.testerCollapsed;
          // Tester column is 44px collapsed / 420px expanded. Grow/shrink the
          // window by the delta so the left content keeps its size and the
          // tester "extends to the right" on expand.
          const delta = nextCollapsed ? -(420 - 44) : 420 - 44;
          void window.clik?.resizeMainByDelta?.(delta);
          return { testerCollapsed: nextCollapsed };
        }),

      setAccent: (accent) => set({ accent }),
      setDensity: (density) => set({ density }),
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),
      setTheme: (theme) => set({ theme }),
      setLaunchAtLogin: (launchAtLogin) => set({ launchAtLogin }),
      setAlwaysOnTop: (alwaysOnTop) => set({ alwaysOnTop }),
      setDockVisible: (dockVisible) => set({ dockVisible }),
      setCloseToTray: (closeToTray) => set({ closeToTray }),
      setPopoverAutoHide: (popoverAutoHide) => set({ popoverAutoHide }),
      setSoundOnEvents: (soundOnEvents) => set({ soundOnEvents }),
      setNotifyOnComplete: (notifyOnComplete) => set({ notifyOnComplete }),
      setConfirmBeforeStop: (confirmBeforeStop) => set({ confirmBeforeStop }),
      setPreventSleep: (preventSleep) => set({ preventSleep }),

      toggleKillZonesEnabled: () =>
        set((s) => ({ killZonesEnabled: !s.killZonesEnabled })),
      addKillZoneRect: (rect, name) => {
        const id = newId('kz');
        set((s) => ({
          killZones: [
            ...s.killZones,
            {
              id,
              name: name && name.trim() ? name.trim() : `Zone ${s.killZones.length + 1}`,
              kind: 'rect',
              enabled: true,
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              w: Math.round(rect.w),
              h: Math.round(rect.h),
            },
          ],
        }));
        return id;
      },
      updateKillZone: (id, patch) =>
        set((s) => ({
          killZones: s.killZones.map((z) =>
            z.id === id ? ({ ...z, ...patch } as KillZone) : z,
          ),
        })),
      removeKillZone: (id) =>
        set((s) => ({ killZones: s.killZones.filter((z) => z.id !== id) })),
      renameKillZone: (id, name) =>
        set((s) => ({
          killZones: s.killZones.map((z) => (z.id === id ? { ...z, name } : z)),
        })),

      addSequencePoint: (p) =>
        set((s) => ({
          sequencePoints: [
            ...s.sequencePoints,
            {
              id: newPointId(),
              x: p?.x ?? 200,
              y: p?.y ?? 200,
              dwellMs: p?.dwellMs ?? 500,
            },
          ],
        })),
      updateSequencePoint: (id, patch) =>
        set((s) => ({
          sequencePoints: s.sequencePoints.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),
      removeSequencePoint: (id) =>
        set((s) => ({ sequencePoints: s.sequencePoints.filter((p) => p.id !== id) })),
      moveSequencePoint: (id, dir) =>
        set((s) => {
          const idx = s.sequencePoints.findIndex((p) => p.id === id);
          if (idx === -1) return {};
          const next = idx + dir;
          if (next < 0 || next >= s.sequencePoints.length) return {};
          const points = s.sequencePoints.slice();
          const [pt] = points.splice(idx, 1);
          points.splice(next, 0, pt);
          return { sequencePoints: points };
        }),
      clearSequencePoints: () => set({ sequencePoints: [] }),
      setSequenceButton: (sequenceButton) => set({ sequenceButton }),
      setSequenceStop: (sequenceStop) => set({ sequenceStop }),
      toggleSequenceHumanize: () => set((s) => ({ sequenceHumanize: !s.sequenceHumanize })),

      openSettings: () => set({ settingsOpen: true }),
      closeSettings: () => set({ settingsOpen: false }),
      resetPreferences: () => {
        const patch: Partial<ClikState> = {};
        for (const k of preferenceKeys) {
          (patch as Record<string, unknown>)[k] = (defaults as Record<string, unknown>)[k];
        }
        set(patch);
      },

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
          killZones: { enabled: s.killZonesEnabled, zones: s.killZones },
        };
      },
      appendRunLog: (entry) =>
        set((s) => {
          // Newest-first so the page can render in natural order without sorting,
          // and cap the tail so we never grow unbounded in localStorage.
          const next = [entry, ...s.runLog];
          if (next.length > MAX_RUN_LOG_ENTRIES) next.length = MAX_RUN_LOG_ENTRIES;
          return { runLog: next };
        }),
      clearRunLog: () => set({ runLog: [] }),

      getSequenceConfig: (): ClickerConfig => {
        const s = get();
        // Each sequence point carries its own dwell, so intervalMs is unused by
        // the main-process clicker here. We still report the average dwell so
        // the tick payload surfaces a meaningful CPS / interval for RunStats.
        return {
          intervalMs: averageDwell(s.sequencePoints),
          button: s.sequenceButton,
          kind: 'single',
          target: {
            kind: 'sequence',
            points: s.sequencePoints.map((p) => ({
              x: p.x,
              y: p.y,
              dwellMs: Math.max(1, p.dwellMs),
            })),
          },
          stop: s.sequenceStop,
          humanize: s.sequenceHumanize,
          killZones: { enabled: s.killZonesEnabled, zones: s.killZones },
        };
      },

      createFlow: (name) => {
        const flow = makeStarterFlow(name && name.trim() ? name.trim() : 'Untitled flow');
        // Switching to a fresh flow resets editor history — the stacks only
        // make sense relative to a single active flow.
        set((s) => ({
          autonomyFlows: [...s.autonomyFlows, flow],
          activeFlowId: flow.id,
          selectedNodeId: null,
          autonomyPast: [],
          autonomyFuture: [],
          autonomyLastPushAt: 0,
          autonomyLastPushKind: '',
        }));
        return flow.id;
      },
      renameFlow: (id, name) =>
        set((s) => ({
          ...(s.activeFlowId === id ? pushHistoryPatch(s, `rename-${id}`) : {}),
          autonomyFlows: updateFlow(s.autonomyFlows, id, (f) => ({ ...f, name })),
        })),
      deleteFlow: (id) =>
        set((s) => {
          const next = s.autonomyFlows.filter((f) => f.id !== id);
          const resetting = s.activeFlowId === id;
          return {
            autonomyFlows: next,
            activeFlowId: resetting ? (next[0]?.id ?? null) : s.activeFlowId,
            selectedNodeId: resetting ? null : s.selectedNodeId,
            ...(resetting
              ? {
                  autonomyPast: [],
                  autonomyFuture: [],
                  autonomyLastPushAt: 0,
                  autonomyLastPushKind: '',
                }
              : {}),
          };
        }),
      setActiveFlow: (id) =>
        set({
          activeFlowId: id,
          selectedNodeId: null,
          autonomyPast: [],
          autonomyFuture: [],
          autonomyLastPushAt: 0,
          autonomyLastPushKind: '',
        }),
      setSelectedNode: (id) => set({ selectedNodeId: id }),

      addAutonomyNode: (kind, at) => {
        const s = get();
        const id = s.activeFlowId;
        if (!id) return null;
        const node = makeDefaultNode(kind, at ?? { x: 240, y: 240 });
        set((st) => ({
          ...pushHistoryPatch(st, `add-${node.id}`),
          autonomyFlows: updateFlow(st.autonomyFlows, id, (f) => ({
            ...f,
            nodes: [...f.nodes, node],
          })),
          selectedNodeId: node.id,
        }));
        return node.id;
      },
      updateAutonomyNode: (id, patch) => {
        const s = get();
        const fid = s.activeFlowId;
        if (!fid) return;
        // Coalesce consecutive updates to the same node so Stepper-heavy
        // editing collapses into one undo step.
        set((st) => ({
          ...pushHistoryPatch(st, `update-${id}`),
          autonomyFlows: updateFlow(st.autonomyFlows, fid, (f) => ({
            ...f,
            nodes: f.nodes.map((n) =>
              n.id === id ? ({ ...n, ...patch } as AutonomyNode) : n,
            ),
          })),
        }));
      },
      moveAutonomyNode: (id, x, y) => {
        // NOTE: move deliberately skips pushHistoryPatch — `beginAutonomyDrag`
        // snapshots once at mousedown and subsequent mousemoves mutate in place
        // so a whole drag collapses into a single undo entry.
        const s = get();
        const fid = s.activeFlowId;
        if (!fid) return;
        set((st) => ({
          autonomyFlows: updateFlow(st.autonomyFlows, fid, (f) => ({
            ...f,
            nodes: f.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)),
          })),
        }));
      },
      removeAutonomyNode: (id) => {
        const s = get();
        const fid = s.activeFlowId;
        if (!fid) return;
        set((st) => ({
          ...pushHistoryPatch(st, `remove-${id}`),
          autonomyFlows: updateFlow(st.autonomyFlows, fid, (f) => ({
            ...f,
            nodes: f.nodes.filter((n) => n.id !== id),
            edges: f.edges.filter((e) => e.fromId !== id && e.toId !== id),
          })),
          selectedNodeId: st.selectedNodeId === id ? null : st.selectedNodeId,
        }));
      },
      addAutonomyEdge: (fromId, fromPort, toId) => {
        if (fromId === toId) return;
        const s = get();
        const fid = s.activeFlowId;
        if (!fid) return;
        set((st) => ({
          ...pushHistoryPatch(st, `add-edge-${fromId}-${fromPort}`),
          autonomyFlows: updateFlow(st.autonomyFlows, fid, (f) => {
            // Each (fromId, fromPort) can only have one successor — replace if re-wired.
            const edges = f.edges.filter(
              (e) => !(e.fromId === fromId && e.fromPort === fromPort),
            );
            const edge: AutonomyEdge = {
              id: newId('edge'),
              fromId,
              fromPort,
              toId,
            };
            return { ...f, edges: [...edges, edge] };
          }),
        }));
      },
      removeAutonomyEdge: (id) => {
        const s = get();
        const fid = s.activeFlowId;
        if (!fid) return;
        set((st) => ({
          ...pushHistoryPatch(st, `remove-edge-${id}`),
          autonomyFlows: updateFlow(st.autonomyFlows, fid, (f) => ({
            ...f,
            edges: f.edges.filter((e) => e.id !== id),
          })),
        }));
      },
      applyAutonomyTick: (t) =>
        set({
          autonomyStatus: t.status,
          autonomyCurrentNode: t.currentNodeId,
          autonomyIterations: t.iterations,
          autonomyElapsedMs: t.elapsedMs,
          autonomyLastError: t.lastError,
          autonomyLastFound: t.lastFound ?? null,
        }),

      replaceAutonomyFlow: (id, next) => {
        const s = get();
        const existing = s.autonomyFlows.find((f) => f.id === id);
        if (!existing) return;
        set((st) => ({
          ...pushHistoryPatch(st, `replace-${id}-${Date.now()}`),
          autonomyFlows: st.autonomyFlows.map((f) =>
            f.id === id
              ? {
                  ...f,
                  nodes: next.nodes,
                  edges: next.edges,
                  maxSteps: next.maxSteps,
                  name: next.name,
                  updatedAt: Date.now(),
                }
              : f,
          ),
          // If the currently selected node no longer exists after replacement,
          // drop the selection so the inspector doesn't dangle.
          selectedNodeId: next.nodes.some((n) => n.id === st.selectedNodeId)
            ? st.selectedNodeId
            : null,
        }));
      },

      setAutonomyCodeDraft: (id, text) =>
        set((st) => {
          const drafts = { ...st.autonomyCodeDrafts };
          if (text === null) {
            delete drafts[id];
          } else {
            drafts[id] = text;
          }
          return { autonomyCodeDrafts: drafts };
        }),

      beginAutonomyDrag: (id) => {
        // Single history snapshot per drag — bookkeep unique `kind` so the
        // next drag (or any other action) doesn't coalesce into it.
        set((st) => pushHistoryPatch(st, `drag-${id}-${Date.now()}`));
      },

      undoAutonomy: () => {
        const s = get();
        const fid = s.activeFlowId;
        if (!fid || s.autonomyPast.length === 0) return;
        const current = s.autonomyFlows.find((x) => x.id === fid);
        if (!current) return;
        const past = s.autonomyPast.slice();
        const prev = past.pop()!;
        const future = [cloneFlow(current), ...s.autonomyFuture];
        if (future.length > HISTORY_CAP) future.length = HISTORY_CAP;
        set({
          autonomyPast: past,
          autonomyFuture: future,
          autonomyFlows: s.autonomyFlows.map((f) => (f.id === fid ? prev : f)),
          // Keep the previous selection only if that node still exists.
          selectedNodeId: prev.nodes.some((n) => n.id === s.selectedNodeId)
            ? s.selectedNodeId
            : null,
          // Reset coalesce so the next edit starts a fresh entry.
          autonomyLastPushAt: 0,
          autonomyLastPushKind: '',
        });
      },

      redoAutonomy: () => {
        const s = get();
        const fid = s.activeFlowId;
        if (!fid || s.autonomyFuture.length === 0) return;
        const current = s.autonomyFlows.find((x) => x.id === fid);
        if (!current) return;
        const [next, ...rest] = s.autonomyFuture;
        const past = [...s.autonomyPast, cloneFlow(current)];
        if (past.length > HISTORY_CAP) past.splice(0, past.length - HISTORY_CAP);
        set({
          autonomyPast: past,
          autonomyFuture: rest,
          autonomyFlows: s.autonomyFlows.map((f) => (f.id === fid ? next : f)),
          selectedNodeId: next.nodes.some((n) => n.id === s.selectedNodeId)
            ? s.selectedNodeId
            : null,
          autonomyLastPushAt: 0,
          autonomyLastPushKind: '',
        });
      },

      copyAutonomySelection: () => {
        const s = get();
        const f = s.autonomyFlows.find((x) => x.id === s.activeFlowId);
        if (!f || !s.selectedNodeId) return;
        const node = f.nodes.find((n) => n.id === s.selectedNodeId);
        // 'start' is the singular entry point — disallow copying so we never
        // end up with two Start nodes in the same flow.
        if (!node || node.kind === 'start') return;
        set({
          autonomyClipboard: { nodes: [structuredClone(node)], edges: [] },
        });
      },

      cutAutonomySelection: () => {
        const s = get();
        const f = s.autonomyFlows.find((x) => x.id === s.activeFlowId);
        if (!f || !s.selectedNodeId) return;
        const node = f.nodes.find((n) => n.id === s.selectedNodeId);
        if (!node || node.kind === 'start') return;
        set({
          autonomyClipboard: { nodes: [structuredClone(node)], edges: [] },
        });
        // removeAutonomyNode handles the history push for the removal.
        get().removeAutonomyNode(node.id);
      },

      pasteAutonomy: () => {
        const s = get();
        const fid = s.activeFlowId;
        const clip = s.autonomyClipboard;
        if (!fid || !clip || clip.nodes.length === 0) return;
        // Never paste a Start node (flows support exactly one).
        const sources = clip.nodes.filter((n) => n.kind !== 'start');
        if (sources.length === 0) return;
        // Fresh IDs for every pasted node; rewire edges between them.
        const idMap = new Map<string, string>();
        const offset = 28;
        const newNodes: AutonomyNode[] = sources.map((n) => {
          const freshId = newId(n.kind);
          idMap.set(n.id, freshId);
          return {
            ...structuredClone(n),
            id: freshId,
            x: n.x + offset,
            y: n.y + offset,
          } as AutonomyNode;
        });
        const newEdges: AutonomyEdge[] = clip.edges
          .filter((e) => idMap.has(e.fromId) && idMap.has(e.toId))
          .map((e) => ({
            id: newId('edge'),
            fromId: idMap.get(e.fromId)!,
            fromPort: e.fromPort,
            toId: idMap.get(e.toId)!,
          }));
        set((st) => ({
          ...pushHistoryPatch(st, `paste-${Date.now()}`),
          autonomyFlows: updateFlow(st.autonomyFlows, fid, (f) => ({
            ...f,
            nodes: [...f.nodes, ...newNodes],
            edges: [...f.edges, ...newEdges],
          })),
          selectedNodeId: newNodes[0]?.id ?? st.selectedNodeId,
        }));
      },

      duplicateAutonomySelection: () => {
        const s = get();
        const f = s.autonomyFlows.find((x) => x.id === s.activeFlowId);
        if (!f || !s.selectedNodeId) return;
        const node = f.nodes.find((n) => n.id === s.selectedNodeId);
        if (!node || node.kind === 'start') return;
        // Implemented as copy → paste → restore clipboard, so duplicating
        // doesn't clobber whatever the user had on their clipboard.
        const prevClip = s.autonomyClipboard;
        set({
          autonomyClipboard: { nodes: [structuredClone(node)], edges: [] },
        });
        get().pasteAutonomy();
        set({ autonomyClipboard: prevClip });
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
        hotkeys: s.hotkeys,

        panels: s.panels,

        sidebarCollapsed: s.sidebarCollapsed,
        testerCollapsed: s.testerCollapsed,

        accent: s.accent,
        density: s.density,
        reduceMotion: s.reduceMotion,

        launchAtLogin: s.launchAtLogin,
        alwaysOnTop: s.alwaysOnTop,
        dockVisible: s.dockVisible,
        closeToTray: s.closeToTray,

        popoverAutoHide: s.popoverAutoHide,

        soundOnEvents: s.soundOnEvents,
        notifyOnComplete: s.notifyOnComplete,
        confirmBeforeStop: s.confirmBeforeStop,

        preventSleep: s.preventSleep,

        killZonesEnabled: s.killZonesEnabled,
        killZones: s.killZones,

        route: s.route,

        sequencePoints: s.sequencePoints,
        sequenceButton: s.sequenceButton,
        sequenceStop: s.sequenceStop,
        sequenceHumanize: s.sequenceHumanize,

        autonomyFlows: s.autonomyFlows,
        activeFlowId: s.activeFlowId,

        runLog: s.runLog,
      }),
      version: 2,
      migrate: (persisted, version) => {
        // v1 → v2: single startStopHotkey plus dedicated 'hotkeys' route becomes
        // a per-workspace hotkey map. We port the existing accelerator onto the
        // clicker slot (it was clicker-scoped in v1), keep the sequence and
        // autonomy defaults, and drop anyone still sitting on the retired route.
        if (!persisted || typeof persisted !== 'object') return persisted;
        const p = persisted as Record<string, unknown>;
        if (version < 2) {
          const legacy = typeof p.startStopHotkey === 'string'
            ? (p.startStopHotkey as string)
            : 'Alt+Shift+C';
          p.hotkeys = {
            clicker: legacy,
            sequence: 'Alt+Shift+S',
            autonomy: 'Alt+Shift+A',
          };
          delete p.startStopHotkey;
          if (p.route === 'hotkeys') p.route = 'clicker';
        }
        return p;
      },
    },
  ),
);
