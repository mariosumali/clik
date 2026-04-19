import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc.js';
import type {
  ClickerConfig,
  ClickerTick,
  HotkeyRegistration,
  PermissionState,
  PickerResult,
  WindowMode,
} from '../shared/types.js';

function parseMode(): WindowMode {
  const arg = process.argv.find((a) => a.startsWith('--clik-mode='));
  const fromArg = arg ? arg.split('=')[1] : null;
  if (fromArg === 'popover' || fromArg === 'full' || fromArg === 'picker') return fromArg;
  return 'full';
}

const api = {
  mode: parseMode(),
  start(config: ClickerConfig): Promise<{ ok: boolean; err?: string }> {
    return ipcRenderer.invoke(IPC.clickerStart, config);
  },
  stop(): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(IPC.clickerStop);
  },
  checkPermission(): Promise<PermissionState> {
    return ipcRenderer.invoke(IPC.permCheck);
  },
  setStartStopHotkey(accelerator: string): Promise<HotkeyRegistration> {
    return ipcRenderer.invoke(IPC.hotkeySet, accelerator);
  },
  showMainWindow(): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(IPC.appShowMain);
  },
  hideMainWindow(): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(IPC.appHideMain);
  },
  hidePopover(): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(IPC.appHidePopover);
  },
  startPicker(): Promise<PickerResult> {
    return ipcRenderer.invoke(IPC.pickerStart);
  },
  pickerPick(): Promise<PickerResult> {
    return ipcRenderer.invoke(IPC.pickerPick);
  },
  pickerCancel(): Promise<PickerResult> {
    return ipcRenderer.invoke(IPC.pickerCancel);
  },
  getLaunchAtLogin(): Promise<{ openAtLogin: boolean }> {
    return ipcRenderer.invoke(IPC.settingsLaunchAtLoginGet);
  },
  setLaunchAtLogin(openAtLogin: boolean): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(IPC.settingsLaunchAtLoginSet, openAtLogin);
  },
  setAlwaysOnTop(alwaysOnTop: boolean): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(IPC.settingsAlwaysOnTopSet, alwaysOnTop);
  },
  onTick(cb: (tick: ClickerTick) => void): () => void {
    const handler = (_e: unknown, tick: ClickerTick) => cb(tick);
    ipcRenderer.on(IPC.clickerTick, handler);
    return () => ipcRenderer.off(IPC.clickerTick, handler);
  },
  onHotkey(cb: (name: 'fire' | 'cancel') => void): () => void {
    const fire = () => cb('fire');
    const cancel = () => cb('cancel');
    ipcRenderer.on('hotkey:fire', fire);
    ipcRenderer.on('hotkey:cancel', cancel);
    return () => {
      ipcRenderer.off('hotkey:fire', fire);
      ipcRenderer.off('hotkey:cancel', cancel);
    };
  },
  onHotkeyStatus(cb: (reg: HotkeyRegistration) => void): () => void {
    const handler = (_e: unknown, reg: HotkeyRegistration) => cb(reg);
    ipcRenderer.on(IPC.hotkeyStatus, handler);
    return () => ipcRenderer.off(IPC.hotkeyStatus, handler);
  },
};

contextBridge.exposeInMainWorld('clik', api);

export type ClikApi = typeof api;
