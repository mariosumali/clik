import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  globalShortcut,
  systemPreferences,
  screen,
  shell,
  powerSaveBlocker,
} from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IPC } from '../shared/ipc.js';
import type {
  ClickerConfig,
  HotkeyRegistration,
  HotkeyTarget,
  KillZone,
  KillZonePayload,
  KillZoneRect,
  PermissionState,
  PickerResult,
  WindowMode,
} from '../shared/types.js';
import type {
  AutonomyFlow,
  AutonomyRect,
  CaptureResult,
  MatchResult,
  RegionPickResult,
  SampleResult,
} from '../shared/autonomy.js';
import { Clicker } from './clicker.js';
import { HelperClient } from './helper.js';
import { AutonomyRunner } from './autonomy.js';
import { TriggersManager } from './triggers.js';
import { PathRecorder } from './pathRecorder.js';
import type { Trigger, PathRecorderStatus, PathRecording } from '../shared/triggers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const POPOVER_SIZE = { width: 320, height: 560 } as const;

let mainWindow: BrowserWindow | null = null;
let popoverWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let helper: HelperClient | null = null;
let clicker: Clicker | null = null;
let autonomy: AutonomyRunner | null = null;
let triggers: TriggersManager | null = null;
let pathRecorder: PathRecorder | null = null;
// The renderer sends the authoritative flow library over IPC whenever it
// changes — main doesn't persist flows itself, it just caches the latest
// list so triggers and direct-fires can start a known flow.
let flowLibrary: AutonomyFlow[] = [];
// Per-workspace global start/stop hotkeys. Each slot owns one accelerator; the
// renderer re-registers every slot on boot so the defaults below are only used
// during the pre-renderer warm-up window.
const DEFAULT_HOTKEYS: Record<HotkeyTarget, string> = {
  clicker: 'Alt+Shift+C',
  sequence: 'Alt+Shift+S',
  autonomy: 'Alt+Shift+A',
};
const currentHotkeys: Record<HotkeyTarget, string> = { ...DEFAULT_HOTKEYS };

let pickerWindows: BrowserWindow[] = [];
let pickerResolver: ((res: PickerResult) => void) | null = null;
let regionPickerWindows: BrowserWindow[] = [];
let regionPickerResolver: ((res: RegionPickResult) => void) | null = null;
let lastConfig: ClickerConfig | null = null;

// Runtime preference flags mirrored from the renderer's persisted store. These
// guard behavior inside various event handlers in the main process.
const prefs = {
  closeToTray: true,
  popoverAutoHide: true,
  preventSleep: false,
};
let powerBlockerId: number | null = null;
let clickerRunning = false;
let autonomyRunning = false;
let trayFlashTimer: ReturnType<typeof setInterval> | null = null;

// Expand the renderer's raw kill-zone payload into a flat list of screen-point
// rectangles. Presets ('corners', 'edges') are walked per display so a 24px
// "corners" zone applies independently on every monitor. Returns an empty
// array when the feature is off or no zones are enabled — the engine uses the
// empty list as a fast-path bypass.
function resolveKillZones(payload: KillZonePayload | KillZoneRect[] | undefined): KillZoneRect[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (!payload.enabled) return [];
  const enabled = (payload.zones ?? []).filter((z) => z.enabled);
  if (enabled.length === 0) return [];
  const displays = screen.getAllDisplays();
  const rects: KillZoneRect[] = [];
  for (const z of enabled as KillZone[]) {
    if (z.kind === 'rect') {
      rects.push({ x: z.x, y: z.y, w: z.w, h: z.h });
      continue;
    }
    if (z.kind === 'corners') {
      const size = Math.max(1, Math.round(z.size));
      for (const d of displays) {
        const { x, y, width, height } = d.bounds;
        rects.push({ x, y, w: size, h: size });
        rects.push({ x: x + width - size, y, w: size, h: size });
        rects.push({ x, y: y + height - size, w: size, h: size });
        rects.push({ x: x + width - size, y: y + height - size, w: size, h: size });
      }
      continue;
    }
    if (z.kind === 'edges') {
      const m = Math.max(1, Math.round(z.margin));
      for (const d of displays) {
        const { x, y, width, height } = d.bounds;
        // Four strips forming an inner border. Overlap at corners is fine —
        // the engine's isInsideKillZone is a boolean test.
        rects.push({ x, y, w: width, h: m });
        rects.push({ x, y: y + height - m, w: width, h: m });
        rects.push({ x, y, w: m, h: height });
        rects.push({ x: x + width - m, y, w: m, h: height });
      }
      continue;
    }
  }
  return rects;
}

function updatePowerBlocker(): void {
  const shouldBlock = prefs.preventSleep && clickerRunning;
  if (shouldBlock && powerBlockerId === null) {
    powerBlockerId = powerSaveBlocker.start('prevent-display-sleep');
  } else if (!shouldBlock && powerBlockerId !== null) {
    try { powerSaveBlocker.stop(powerBlockerId); } catch { /* ignore */ }
    powerBlockerId = null;
  }
}

function rendererEntry(mode: WindowMode): string | { url: string; hash: string } {
  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devServerUrl) {
    return { url: devServerUrl, hash: `#${mode}` };
  }
  return path.join(__dirname, '../renderer/index.html');
}

function loadRenderer(win: BrowserWindow, mode: WindowMode): void {
  const entry = rendererEntry(mode);
  if (typeof entry === 'string') {
    win.loadFile(entry, { hash: mode });
  } else {
    win.loadURL(`${entry.url}${entry.hash}`);
  }
}

function resolveTrayIcon(): Electron.NativeImage {
  const candidates = [
    path.join(__dirname, '../../resources/trayTemplate.png'),
    path.join(process.resourcesPath, 'trayTemplate.png'),
  ];
  for (const p of candidates) {
    const img = nativeImage.createFromPath(p);
    if (!img.isEmpty()) {
      img.setTemplateImage(true);
      return img;
    }
  }
  return nativeImage.createEmpty();
}

function createMainWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0b0b0b',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: ['--clik-mode=full'],
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.webContents.on('did-finish-load', () => {
    if (mainWindow) sendSnapshotTo(mainWindow);
  });
  loadRenderer(mainWindow, 'full');

  // Close-to-tray: intercept the window close and hide the window instead of
  // destroying it, so the app stays alive in the menu bar.
  mainWindow.on('close', (e) => {
    if (prefs.closeToTray && !(app as unknown as { isQuitting?: boolean }).isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createPopoverWindow(): void {
  if (popoverWindow && !popoverWindow.isDestroyed()) return;
  popoverWindow = new BrowserWindow({
    width: POPOVER_SIZE.width,
    height: POPOVER_SIZE.height,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    fullscreenable: false,
    skipTaskbar: true,
    transparent: false,
    alwaysOnTop: true,
    backgroundColor: '#0b0b0b',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: ['--clik-mode=popover'],
    },
  });
  popoverWindow.webContents.on('did-finish-load', () => {
    if (popoverWindow) sendSnapshotTo(popoverWindow);
  });
  loadRenderer(popoverWindow, 'popover');

  popoverWindow.on('blur', () => {
    // Hide on outside click; keep visible while devtools are open to aid debugging.
    if (!prefs.popoverAutoHide) return;
    if (popoverWindow && !popoverWindow.webContents.isDevToolsOpened()) {
      popoverWindow.hide();
    }
  });
  popoverWindow.on('closed', () => {
    popoverWindow = null;
  });
}

function closePickerWindows(): void {
  for (const win of pickerWindows) {
    if (!win.isDestroyed()) win.destroy();
  }
  pickerWindows = [];
}

function resolvePicker(res: PickerResult): void {
  const resolver = pickerResolver;
  pickerResolver = null;
  closePickerWindows();
  if (resolver) resolver(res);
}

function startPicker(): Promise<PickerResult> {
  // Refuse to open a second picker session; return a 'busy' error instead.
  if (pickerResolver) {
    return Promise.resolve({ ok: false, reason: 'busy' } satisfies PickerResult);
  }

  return new Promise<PickerResult>((resolve) => {
    pickerResolver = resolve;

    const displays = screen.getAllDisplays();
    for (const display of displays) {
      const { x, y, width, height } = display.bounds;
      const win = new BrowserWindow({
        x,
        y,
        width,
        height,
        show: false,
        frame: false,
        transparent: true,
        hasShadow: false,
        resizable: false,
        movable: false,
        fullscreenable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        focusable: true,
        backgroundColor: '#00000000',
        webPreferences: {
          preload: path.join(__dirname, '../preload/index.js'),
          sandbox: false,
          contextIsolation: true,
          nodeIntegration: false,
          additionalArguments: ['--clik-mode=picker'],
        },
      });

      win.setAlwaysOnTop(true, 'screen-saver');
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      win.setIgnoreMouseEvents(false);

      win.once('ready-to-show', () => {
        win.show();
        win.focus();
      });

      loadRenderer(win, 'picker');
      pickerWindows.push(win);
    }

    // Edge case: no displays were returned (extremely unlikely) — resolve with error.
    if (pickerWindows.length === 0) {
      pickerResolver = null;
      resolve({ ok: false, reason: 'error' });
    }
  });
}

function closeRegionPickerWindows(): void {
  for (const win of regionPickerWindows) {
    if (!win.isDestroyed()) win.destroy();
  }
  regionPickerWindows = [];
}

function resolveRegionPicker(res: RegionPickResult): void {
  const resolver = regionPickerResolver;
  regionPickerResolver = null;
  closeRegionPickerWindows();
  if (resolver) resolver(res);
}

function startRegionPicker(): Promise<RegionPickResult> {
  if (regionPickerResolver) {
    return Promise.resolve({ ok: false, reason: 'busy' });
  }

  return new Promise<RegionPickResult>((resolve) => {
    regionPickerResolver = resolve;
    const displays = screen.getAllDisplays();
    for (const display of displays) {
      const { x, y, width, height } = display.bounds;
      const win = new BrowserWindow({
        x,
        y,
        width,
        height,
        show: false,
        frame: false,
        transparent: true,
        hasShadow: false,
        resizable: false,
        movable: false,
        fullscreenable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        focusable: true,
        backgroundColor: '#00000000',
        webPreferences: {
          preload: path.join(__dirname, '../preload/index.js'),
          sandbox: false,
          contextIsolation: true,
          nodeIntegration: false,
          additionalArguments: ['--clik-mode=region-picker'],
        },
      });

      win.setAlwaysOnTop(true, 'screen-saver');
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      win.setIgnoreMouseEvents(false);

      win.once('ready-to-show', () => {
        win.show();
        win.focus();
      });

      loadRenderer(win, 'region-picker');
      regionPickerWindows.push(win);
    }

    if (regionPickerWindows.length === 0) {
      regionPickerResolver = null;
      resolve({ ok: false, reason: 'error' });
    }
  });
}

function positionPopoverNearTray(): void {
  if (!popoverWindow || !tray) return;
  const trayBounds = tray.getBounds();
  const display = screen.getDisplayNearestPoint({
    x: trayBounds.x + trayBounds.width / 2,
    y: trayBounds.y + trayBounds.height / 2,
  });
  const { width: screenW } = display.workArea;
  const displayOriginX = display.workArea.x;

  // Anchor the popover centred under the tray icon, clamped to the active display.
  const desiredX = Math.round(trayBounds.x + trayBounds.width / 2 - POPOVER_SIZE.width / 2);
  const margin = 8;
  const minX = displayOriginX + margin;
  const maxX = displayOriginX + screenW - POPOVER_SIZE.width - margin;
  const x = Math.max(minX, Math.min(maxX, desiredX));
  const y = Math.round(trayBounds.y + trayBounds.height + 6);

  popoverWindow.setPosition(x, y, false);
}

function togglePopover(): void {
  if (!popoverWindow) createPopoverWindow();
  if (!popoverWindow) return;
  if (popoverWindow.isVisible()) {
    popoverWindow.hide();
    return;
  }
  positionPopoverNearTray();
  popoverWindow.show();
  popoverWindow.focus();
}

function createTray(): void {
  if (tray) return;
  const icon = resolveTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('CLIK — autoclicker');
  tray.on('click', togglePopover);
  tray.on('right-click', () => {
    const menu = Menu.buildFromTemplate([
      { label: 'Open CLIK', click: () => createMainWindow() },
      { label: 'Show popover', click: togglePopover },
      { type: 'separator' },
      { label: 'Quit CLIK', click: () => app.quit() },
    ]);
    tray?.popUpContextMenu(menu);
  });
}

// Braille cells share one fixed advance width in the menu bar, so animating
// between blank (U+2800) and full (U+28FF) reads as a dot fading in/out without
// collapsing the title area — unlike toggling to an empty string, which shifts
// the whole status strip.
const TRAY_PULSE_STEP_MS = 90;
const TRAY_PULSE_PHASES: readonly string[] = [
  '\u2800',
  '\u2840',
  '\u28C0',
  '\u28E0',
  '\u28F0',
  '\u28F8',
  '\u28FC',
  '\u28FE',
  '\u28FF',
  '\u28FE',
  '\u28FC',
  '\u28F8',
  '\u28F0',
  '\u28E0',
  '\u28C0',
  '\u2840',
];
let trayPulsePhase = 0;

function stopTrayFlash(): void {
  if (trayFlashTimer !== null) {
    clearInterval(trayFlashTimer);
    trayFlashTimer = null;
  }
  trayPulsePhase = 0;
  tray?.setTitle('');
}

// While a runner is active, reserve a fixed-width title (` + one Braille cell)
// and step through phases so the dot appears to fade without changing layout.
function startTrayFlash(): void {
  if (!tray || trayFlashTimer !== null) return;
  trayPulsePhase = 0;
  const tick = (): void => {
    if (!tray) return;
    const ch = TRAY_PULSE_PHASES[trayPulsePhase % TRAY_PULSE_PHASES.length]!;
    tray.setTitle(` ${ch}`, { fontType: 'monospacedDigit' });
    trayPulsePhase += 1;
  };
  tick();
  trayFlashTimer = setInterval(tick, TRAY_PULSE_STEP_MS);
}

function updateTrayRunningState(): void {
  if (!tray) return;
  const running = clickerRunning || autonomyRunning;
  if (running) {
    startTrayFlash();
    const both = clickerRunning && autonomyRunning;
    tray.setToolTip(
      both
        ? 'CLIK — clicker & autonomy running'
        : autonomyRunning
          ? 'CLIK — autonomy running'
          : 'CLIK — running',
    );
  } else {
    stopTrayFlash();
    tray.setToolTip('CLIK — autoclicker');
  }
}

function broadcastHotkeyStatus(reg: HotkeyRegistration): void {
  mainWindow?.webContents.send(IPC.hotkeyStatus, reg);
  popoverWindow?.webContents.send(IPC.hotkeyStatus, reg);
}

function broadcastTick(payload: unknown): void {
  mainWindow?.webContents.send(IPC.clickerTick, payload);
  popoverWindow?.webContents.send(IPC.clickerTick, payload);
}

function broadcastAutonomyTick(payload: unknown): void {
  mainWindow?.webContents.send(IPC.autonomyTick, payload);
  popoverWindow?.webContents.send(IPC.autonomyTick, payload);
}

// Push a current runtime snapshot to `win` so a freshly-loaded window catches
// up on in-flight runs without waiting for the next engine tick (the clicker
// only emits on click events, so a popover opened mid-run would otherwise
// render as Idle until the next click).
function sendSnapshotTo(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  const clickerSnap = clicker?.snapshot();
  if (clickerSnap) win.webContents.send(IPC.clickerTick, clickerSnap);
  const autonomySnap = autonomy?.snapshot();
  if (autonomySnap) win.webContents.send(IPC.autonomyTick, autonomySnap);
}

function broadcastHotkeyFire(target: HotkeyTarget): void {
  // Always send to a *visible* renderer so the fire handler observes the exact
  // in-memory config the user is looking at (vs. whatever is persisted). If
  // neither window is visible we still try to wake the popover up so the user
  // gets visual feedback when pressing a combo.
  const visible = popoverWindow?.isVisible()
    ? popoverWindow
    : mainWindow?.isVisible()
      ? mainWindow
      : null;
  if (visible && !visible.isDestroyed()) {
    visible.webContents.send(IPC.hotkeyFire, { target, action: 'fire' });
    return;
  }

  // Nothing visible — clicker can still fire from the last captured config.
  if (target === 'clicker' && lastConfig && clicker) {
    clicker.start(lastConfig);
    return;
  }

  // Otherwise surface the popover so the user can wire things up + retry.
  togglePopover();
}

function handleHotkeyPress(target: HotkeyTarget): void {
  // Stop takes precedence and is handled directly in main so the hotkey works
  // even when both windows are hidden. Clicker + Sequence share the same
  // Clicker instance (different configs, one runtime), so either hotkey stops
  // a running clicker. Autonomy has its own runner.
  if (target === 'autonomy') {
    const snap = autonomy?.snapshot();
    if (snap && snap.status === 'running') {
      autonomy?.stop();
      return;
    }
  } else {
    const snap = clicker?.snapshot();
    if (snap && snap.status === 'running') {
      clicker?.stop('hotkey-toggle');
      return;
    }
  }
  broadcastHotkeyFire(target);
}

function registerHotkey(target: HotkeyTarget, accelerator: string): HotkeyRegistration {
  // Remove previous binding for this slot (idempotent).
  const previous = currentHotkeys[target];
  if (previous) {
    try { globalShortcut.unregister(previous); } catch { /* ignore */ }
  }
  if (!accelerator) {
    currentHotkeys[target] = '';
    return { target, accelerator: '', ok: false, err: 'empty' };
  }

  // Refuse collisions with another slot — registering the same combo twice
  // would replace the prior binding, silently disabling the other workspace.
  for (const key of Object.keys(currentHotkeys) as HotkeyTarget[]) {
    if (key !== target && currentHotkeys[key] === accelerator) {
      return { target, accelerator, ok: false, err: 'already-bound' };
    }
  }

  try {
    const ok = globalShortcut.register(accelerator, () => handleHotkeyPress(target));
    if (!ok) {
      currentHotkeys[target] = '';
      return { target, accelerator, ok: false, err: 'register-failed' };
    }
    currentHotkeys[target] = accelerator;
    return { target, accelerator, ok: true };
  } catch (err) {
    currentHotkeys[target] = '';
    return { target, accelerator, ok: false, err: (err as Error).message };
  }
}

function wireIpc(): void {
  ipcMain.handle(IPC.permCheck, (): PermissionState => {
    const trusted = systemPreferences.isTrustedAccessibilityClient(true);
    return { trusted };
  });

  ipcMain.handle(IPC.clickerStart, (_e, config: ClickerConfig) => {
    if (!clicker) return { ok: false, err: 'not-ready' };
    // Expand preset kill-zones against the live display layout now so the
    // engine only ever sees screen-point rectangles. Fresh on every start
    // means plugging or unplugging a monitor takes effect on the next run.
    const resolved: ClickerConfig = {
      ...config,
      killZones: resolveKillZones(config.killZones),
    };
    lastConfig = resolved;
    clicker.start(resolved);
    return { ok: true };
  });

  ipcMain.handle(IPC.clickerStop, () => {
    clicker?.stop();
    return { ok: true };
  });

  ipcMain.handle(
    IPC.hotkeySet,
    (_e, payload: { target: HotkeyTarget; accelerator: string }): HotkeyRegistration => {
      const reg = registerHotkey(payload.target, payload.accelerator);
      broadcastHotkeyStatus(reg);
      return reg;
    },
  );

  ipcMain.handle(IPC.appShowMain, () => {
    createMainWindow();
    if (popoverWindow?.isVisible()) popoverWindow.hide();
    return { ok: true };
  });

  ipcMain.handle(IPC.appHideMain, () => {
    mainWindow?.hide();
    return { ok: true };
  });

  ipcMain.handle(IPC.appHidePopover, () => {
    popoverWindow?.hide();
    return { ok: true };
  });

  // Grow/shrink the main window horizontally by `deltaWidth` points. Keeps the
  // left edge pinned so expanding the tester column "extends to the right"
  // instead of compressing existing content; if the new right edge would spill
  // off the active display, the window is shifted left to stay on-screen.
  ipcMain.handle(IPC.mainResizeByDelta, (_e, deltaWidth: number): { ok: boolean } => {
    if (!mainWindow || mainWindow.isDestroyed()) return { ok: false };
    const delta = Math.round(Number(deltaWidth) || 0);
    if (delta === 0) return { ok: true };

    const bounds = mainWindow.getBounds();
    const work = screen.getDisplayMatching(bounds).workArea;

    // Pick a minimum width that accommodates the shrunk state so Electron's
    // minimumSize doesn't clamp the resize. We temporarily drop minWidth when
    // shrinking, then restore a sensible floor afterwards.
    const SHRUNK_MIN_WIDTH = 724;
    const EXPANDED_MIN_WIDTH = 1100;
    if (delta < 0) mainWindow.setMinimumSize(SHRUNK_MIN_WIDTH, 700);

    let newWidth = Math.max(SHRUNK_MIN_WIDTH, bounds.width + delta);
    if (newWidth > work.width) newWidth = work.width;

    let newX = bounds.x;
    const workRight = work.x + work.width;
    if (newX + newWidth > workRight) newX = Math.max(work.x, workRight - newWidth);

    mainWindow.setBounds({ x: newX, y: bounds.y, width: newWidth, height: bounds.height }, true);

    if (delta > 0) mainWindow.setMinimumSize(EXPANDED_MIN_WIDTH, 700);
    return { ok: true };
  });

  ipcMain.handle(IPC.pickerStart, async (): Promise<PickerResult> => {
    return startPicker();
  });

  ipcMain.handle(IPC.pickerPick, (): PickerResult => {
    // Read the true cursor position from the OS at the moment of the click. This is
    // independent of window scaling / HiDPI quirks and always returns screen points.
    const pt = screen.getCursorScreenPoint();
    const res: PickerResult = { ok: true, x: Math.round(pt.x), y: Math.round(pt.y) };
    resolvePicker(res);
    return res;
  });

  ipcMain.handle(IPC.pickerCancel, (): PickerResult => {
    const res: PickerResult = { ok: false, reason: 'cancelled' };
    resolvePicker(res);
    return res;
  });

  ipcMain.handle(IPC.regionPickerStart, async (): Promise<RegionPickResult> => {
    return startRegionPicker();
  });

  ipcMain.handle(IPC.regionPickerPick, (_e, rect: AutonomyRect): RegionPickResult => {
    const res: RegionPickResult = { ok: true, rect };
    resolveRegionPicker(res);
    return res;
  });

  ipcMain.handle(IPC.regionPickerCancel, (): RegionPickResult => {
    const res: RegionPickResult = { ok: false, reason: 'cancelled' };
    resolveRegionPicker(res);
    return res;
  });

  ipcMain.handle(IPC.autonomyStart, async (_e, arg: AutonomyFlow | { flow: AutonomyFlow; library?: AutonomyFlow[] }) => {
    if (!autonomy) return { ok: false, err: 'not-ready' };
    // Accept either the legacy shape (bare flow) or a {flow, library} envelope
    // — the renderer will move to the latter as it adds call-flow support.
    if ('flow' in arg && arg.flow) {
      if (arg.library) flowLibrary = arg.library;
      return autonomy.start(arg.flow, arg.library ?? flowLibrary);
    }
    return autonomy.start(arg as AutonomyFlow, flowLibrary);
  });

  ipcMain.handle(IPC.autonomyStop, () => {
    autonomy?.stop();
    return { ok: true };
  });

  ipcMain.handle(IPC.autonomyCapture, async (_e, rect: AutonomyRect): Promise<CaptureResult> => {
    if (!helper) return { ok: false, err: 'helper-not-ready' };
    const res = await helper.capture(rect);
    if (!res.ok) return { ok: false, err: res.err };
    return {
      ok: true,
      png: res.png,
      widthPoints: res.w,
      heightPoints: res.h,
      widthPx: res.pxW,
      heightPx: res.pxH,
      scale: res.scale,
    };
  });

  ipcMain.handle(IPC.autonomyMatch, async (_e, args: {
    png: string;
    rect: AutonomyRect;
    minConfidence: number;
  }): Promise<MatchResult> => {
    if (!helper) return { ok: false, found: false, err: 'helper-not-ready' };
    const res = await helper.match({
      png: args.png,
      x: args.rect.x,
      y: args.rect.y,
      w: args.rect.w,
      h: args.rect.h,
      minConfidence: args.minConfidence,
    });
    if (!res.ok) return { ok: false, found: false, err: res.err };
    const confidence = res.confidence ?? (res.score !== undefined ? 1 - res.score : undefined);
    return {
      ok: true,
      found: !!res.found,
      x: res.cx,
      y: res.cy,
      confidence,
    };
  });

  ipcMain.handle(IPC.autonomySample, async (_e, pt: { x: number; y: number }): Promise<SampleResult> => {
    if (!helper) return { ok: false, err: 'helper-not-ready' };
    const res = await helper.sample(pt);
    if (!res.ok) return { ok: false, err: res.err };
    return { ok: true, r: res.r, g: res.g, b: res.b };
  });

  ipcMain.handle(IPC.settingsLaunchAtLoginGet, (): { openAtLogin: boolean } => {
    const { openAtLogin } = app.getLoginItemSettings();
    return { openAtLogin };
  });

  ipcMain.handle(IPC.settingsLaunchAtLoginSet, (_e, openAtLogin: boolean): { ok: boolean } => {
    try {
      app.setLoginItemSettings({ openAtLogin });
      return { ok: true };
    } catch (err) {
      console.error('[clik] setLoginItemSettings failed:', err);
      return { ok: false };
    }
  });

  ipcMain.handle(IPC.settingsAlwaysOnTopSet, (_e, alwaysOnTop: boolean): { ok: boolean } => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setAlwaysOnTop(alwaysOnTop);
    }
    return { ok: true };
  });

  ipcMain.handle(IPC.settingsDockVisibleSet, (_e, visible: boolean): { ok: boolean } => {
    if (process.platform !== 'darwin' || !app.dock) return { ok: false };
    if (visible) app.dock.show().catch(() => undefined);
    else app.dock.hide();
    return { ok: true };
  });

  ipcMain.handle(IPC.settingsCloseToTraySet, (_e, value: boolean): { ok: boolean } => {
    prefs.closeToTray = value;
    return { ok: true };
  });

  ipcMain.handle(IPC.settingsPopoverAutoHideSet, (_e, value: boolean): { ok: boolean } => {
    prefs.popoverAutoHide = value;
    return { ok: true };
  });

  ipcMain.handle(IPC.settingsPreventSleepSet, (_e, value: boolean): { ok: boolean } => {
    prefs.preventSleep = value;
    updatePowerBlocker();
    return { ok: true };
  });

  ipcMain.handle(IPC.settingsOpenAccessibility, (): { ok: boolean } => {
    if (process.platform !== 'darwin') return { ok: false };
    shell
      .openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')
      .catch(() => undefined);
    return { ok: true };
  });

  ipcMain.handle(IPC.settingsOpenScreenRecording, (): { ok: boolean } => {
    if (process.platform !== 'darwin') return { ok: false };
    shell
      .openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
      .catch(() => undefined);
    return { ok: true };
  });

  // --- OCR / focus-app / idle / list-apps ------------------------------------
  ipcMain.handle(IPC.ocrRecognize, async (_e, req: {
    rect: AutonomyRect | null;
    accurate?: boolean;
    lang?: string;
  }) => {
    if (!helper) return { ok: false, err: 'helper-not-ready' };
    // Null rect means "whole primary display" — resolve here so the helper
    // always sees concrete pixels.
    let rect = req.rect;
    if (!rect) {
      const primary = screen.getPrimaryDisplay().bounds;
      rect = { x: primary.x, y: primary.y, w: primary.width, h: primary.height };
    }
    const res = await helper.ocr({
      x: rect.x, y: rect.y, w: rect.w, h: rect.h,
      accurate: req.accurate, lang: req.lang,
    });
    return res;
  });

  ipcMain.handle(IPC.focusApp, async (_e, req: { app: string; launchIfMissing?: boolean }) => {
    if (!helper) return { ok: false, err: 'helper-not-ready' };
    return helper.focusApp(req);
  });

  ipcMain.handle(IPC.listApps, async () => {
    if (!helper) return { ok: false, err: 'helper-not-ready' };
    return helper.listApps();
  });

  ipcMain.handle(IPC.idleSeconds, async () => {
    if (!helper) return { ok: false, err: 'helper-not-ready' };
    return helper.idle();
  });

  // --- Path recorder ---------------------------------------------------------
  ipcMain.handle(IPC.pathRecordStart, (): PathRecorderStatus => {
    if (!pathRecorder) pathRecorder = new PathRecorder();
    return pathRecorder.start();
  });

  ipcMain.handle(IPC.pathRecordStop, (): PathRecording | null => {
    if (!pathRecorder) return null;
    return pathRecorder.stop();
  });

  // --- Triggers --------------------------------------------------------------
  ipcMain.handle(IPC.triggersSet, (_e, list: Trigger[]): { ok: boolean } => {
    if (!triggers) return { ok: false };
    triggers.setTriggers(list);
    return { ok: true };
  });

  ipcMain.handle(IPC.triggersRemove, (_e, id: string): { ok: boolean } => {
    if (!triggers) return { ok: false };
    triggers.removeTrigger(id);
    return { ok: true };
  });

  // The renderer ships its current flow library here so triggers (or direct
  // `triggersFire` invocations) can launch a flow without the renderer being
  // open. Main just caches the latest snapshot — zustand remains the source
  // of truth on the renderer side.
  ipcMain.on('autonomy:library:set', (_e, library: AutonomyFlow[]) => {
    flowLibrary = library ?? [];
  });

  ipcMain.handle(IPC.triggersFire, async (_e, flowId: string) => {
    if (!autonomy) return { ok: false, err: 'not-ready' };
    const flow = flowLibrary.find((f) => f.id === flowId);
    if (!flow) return { ok: false, err: 'flow-not-found' };
    return autonomy.start(flow, flowLibrary);
  });

  // Renderer-to-renderer state sync. Electron's localStorage `storage` event
  // is unreliable across BrowserWindows, so every window pushes its persisted
  // zustand slice through main and we fan it out to every OTHER webContents.
  // `ipcMain.on` (not `.handle`) is used because no reply is needed — this is
  // a one-way broadcast.
  ipcMain.on(IPC.stateBroadcast, (event, slice: unknown) => {
    const senderId = event.sender.id;
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue;
      if (win.webContents.id === senderId) continue;
      win.webContents.send(IPC.stateBroadcast, slice);
    }
  });
}

app.whenReady().then(() => {
  helper = new HelperClient();
  try {
    helper.start();
  } catch (err) {
    console.error('[clik] failed to start helper:', err);
  }
  clicker = new Clicker(helper, () => {
    const pt = screen.getCursorScreenPoint();
    return { x: pt.x, y: pt.y };
  });
  clicker.on('tick', (state) => {
    const nextRunning = (state as { status?: string }).status === 'running';
    if (nextRunning !== clickerRunning) {
      clickerRunning = nextRunning;
      updatePowerBlocker();
      updateTrayRunningState();
    }
    broadcastTick(state);
  });

  autonomy = new AutonomyRunner(helper);
  autonomy.on('tick', (state) => {
    const nextRunning = (state as { status?: string }).status === 'running';
    if (nextRunning !== autonomyRunning) {
      autonomyRunning = nextRunning;
      updateTrayRunningState();
    }
    broadcastAutonomyTick(state);
  });

  triggers = new TriggersManager(helper, () => autonomyRunning);
  triggers.on('fire', (t: Trigger) => {
    const flow = flowLibrary.find((f) => f.id === t.flowId);
    if (!flow) return;
    if (t.skipIfRunning && autonomyRunning) return;
    autonomy?.start(flow, flowLibrary).catch(() => undefined);
  });
  triggers.start();

  pathRecorder = new PathRecorder();
  pathRecorder.on('tick', (status: PathRecorderStatus) => {
    mainWindow?.webContents.send(IPC.pathRecordTick, status);
    popoverWindow?.webContents.send(IPC.pathRecordTick, status);
  });

  wireIpc();
  createTray();
  createMainWindow();

  // Register the default hotkeys; the renderer will re-register each slot with
  // its persisted value once it finishes loading.
  (Object.keys(DEFAULT_HOTKEYS) as HotkeyTarget[]).forEach((target) => {
    registerHotkey(target, DEFAULT_HOTKEYS[target]);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    else mainWindow?.show();
  });
});

app.on('window-all-closed', () => {
  // Keep the app alive in the menubar on macOS even when all windows are closed.
  if (process.platform === 'darwin') return;
  helper?.stop();
  app.quit();
});

app.on('before-quit', () => {
  (app as unknown as { isQuitting?: boolean }).isQuitting = true;
  try { globalShortcut.unregisterAll(); } catch { /* ignore */ }
  stopTrayFlash();
  if (powerBlockerId !== null) {
    try { powerSaveBlocker.stop(powerBlockerId); } catch { /* ignore */ }
    powerBlockerId = null;
  }
  autonomy?.stop();
  triggers?.stop();
  pathRecorder?.stop(false);
  helper?.stop();
});
