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
} from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IPC } from '../shared/ipc.js';
import type {
  ClickerConfig,
  HotkeyRegistration,
  PermissionState,
  PickerResult,
  WindowMode,
} from '../shared/types.js';
import { Clicker } from './clicker.js';
import { HelperClient } from './helper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const POPOVER_SIZE = { width: 320, height: 420 } as const;

let mainWindow: BrowserWindow | null = null;
let popoverWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let helper: HelperClient | null = null;
let clicker: Clicker | null = null;
let currentHotkey = 'Alt+Shift+C';

let pickerWindows: BrowserWindow[] = [];
let pickerResolver: ((res: PickerResult) => void) | null = null;
let lastConfig: ClickerConfig | null = null;

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
  loadRenderer(mainWindow, 'full');

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
  loadRenderer(popoverWindow, 'popover');

  popoverWindow.on('blur', () => {
    // Hide on outside click; keep visible while devtools are open to aid debugging.
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

function broadcastHotkeyStatus(reg: HotkeyRegistration): void {
  mainWindow?.webContents.send(IPC.hotkeyStatus, reg);
  popoverWindow?.webContents.send(IPC.hotkeyStatus, reg);
}

function broadcastTick(payload: unknown): void {
  mainWindow?.webContents.send(IPC.clickerTick, payload);
  popoverWindow?.webContents.send(IPC.clickerTick, payload);
}

function toggleClicker(): void {
  if (!clicker) return;
  const snapshot = clicker.snapshot();
  if (snapshot.status === 'running') {
    clicker.stop('hotkey-toggle');
    return;
  }

  // Prefer a visible renderer's in-memory config (catches unsaved UI tweaks).
  const visible = popoverWindow?.isVisible()
    ? popoverWindow
    : mainWindow?.isVisible()
      ? mainWindow
      : null;
  if (visible && !visible.isDestroyed()) {
    visible.webContents.send('hotkey:fire');
    return;
  }

  // Nothing visible — fall back to the last config captured from either window.
  if (lastConfig) {
    clicker.start(lastConfig);
    return;
  }

  // No config yet. Surface the popover so the user can configure + fire.
  togglePopover();
}

function registerStartStopHotkey(accelerator: string): HotkeyRegistration {
  // Remove previous binding for this command (idempotent).
  if (currentHotkey) {
    try { globalShortcut.unregister(currentHotkey); } catch { /* ignore */ }
  }
  if (!accelerator) {
    currentHotkey = '';
    return { accelerator: '', ok: false, err: 'empty' };
  }
  try {
    const ok = globalShortcut.register(accelerator, toggleClicker);
    if (!ok) {
      currentHotkey = '';
      return { accelerator, ok: false, err: 'register-failed' };
    }
    currentHotkey = accelerator;
    return { accelerator, ok: true };
  } catch (err) {
    currentHotkey = '';
    return { accelerator, ok: false, err: (err as Error).message };
  }
}

function wireIpc(): void {
  ipcMain.handle(IPC.permCheck, (): PermissionState => {
    const trusted = systemPreferences.isTrustedAccessibilityClient(true);
    return { trusted };
  });

  ipcMain.handle(IPC.clickerStart, (_e, config: ClickerConfig) => {
    if (!clicker) return { ok: false, err: 'not-ready' };
    lastConfig = config;
    clicker.start(config);
    return { ok: true };
  });

  ipcMain.handle(IPC.clickerStop, () => {
    clicker?.stop();
    return { ok: true };
  });

  ipcMain.handle(IPC.hotkeySet, (_e, accelerator: string): HotkeyRegistration => {
    const reg = registerStartStopHotkey(accelerator);
    broadcastHotkeyStatus(reg);
    return reg;
  });

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
}

app.whenReady().then(() => {
  helper = new HelperClient();
  try {
    helper.start();
  } catch (err) {
    console.error('[clik] failed to start helper:', err);
  }
  clicker = new Clicker(helper);
  clicker.on('tick', (state) => broadcastTick(state));

  wireIpc();
  createTray();
  createMainWindow();

  // Register the default hotkey; renderer will re-register with persisted value once it loads.
  registerStartStopHotkey(currentHotkey);

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
  try { globalShortcut.unregisterAll(); } catch { /* ignore */ }
  helper?.stop();
});
