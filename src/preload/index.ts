import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc.js';
import type {
  ClickerConfig,
  ClickerTick,
  HotkeyFireEvent,
  HotkeyRegistration,
  HotkeyTarget,
  PermissionState,
  PickerResult,
  WindowMode,
} from '../shared/types.js';
import type {
  AutonomyFlow,
  AutonomyRect,
  AutonomyTick,
  CaptureResult,
  FocusAppResult,
  MatchResult,
  OcrResult,
  RegionPickResult,
  RunningApp,
  SampleResult,
} from '../shared/autonomy.js';
import type {
  PathRecorderStatus,
  PathRecording,
  Trigger,
} from '../shared/triggers.js';

function parseMode(): WindowMode {
  const arg = process.argv.find((a) => a.startsWith('--clik-mode='));
  const fromArg = arg ? arg.split('=')[1] : null;
  if (
    fromArg === 'popover' ||
    fromArg === 'full' ||
    fromArg === 'picker' ||
    fromArg === 'region-picker'
  ) return fromArg;
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
  setHotkey(target: HotkeyTarget, accelerator: string): Promise<HotkeyRegistration> {
    return ipcRenderer.invoke(IPC.hotkeySet, { target, accelerator });
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
  resizeMainByDelta(deltaWidth: number): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(IPC.mainResizeByDelta, deltaWidth);
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
  startRegionPicker(): Promise<RegionPickResult> {
    return ipcRenderer.invoke(IPC.regionPickerStart);
  },
  regionPickerPick(rect: AutonomyRect): Promise<RegionPickResult> {
    return ipcRenderer.invoke(IPC.regionPickerPick, rect);
  },
  regionPickerCancel(): Promise<RegionPickResult> {
    return ipcRenderer.invoke(IPC.regionPickerCancel);
  },
  autonomyStart(
    flow: AutonomyFlow,
    library?: AutonomyFlow[],
  ): Promise<{ ok: boolean; err?: string }> {
    // Keep the single-arg call working so existing call-sites don't change,
    // but when a library is supplied we wrap in an envelope so main knows to
    // refresh its cache and pass the library to the runner (for call-flow).
    if (library) return ipcRenderer.invoke(IPC.autonomyStart, { flow, library });
    return ipcRenderer.invoke(IPC.autonomyStart, flow);
  },
  setFlowLibrary(library: AutonomyFlow[]): void {
    ipcRenderer.send('autonomy:library:set', library);
  },
  autonomyStop(): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(IPC.autonomyStop);
  },
  autonomyCapture(rect: AutonomyRect): Promise<CaptureResult> {
    return ipcRenderer.invoke(IPC.autonomyCapture, rect);
  },
  autonomyMatch(args: {
    png: string;
    rect: AutonomyRect;
    minConfidence: number;
  }): Promise<MatchResult> {
    return ipcRenderer.invoke(IPC.autonomyMatch, args);
  },
  autonomySample(pt: { x: number; y: number }): Promise<SampleResult> {
    return ipcRenderer.invoke(IPC.autonomySample, pt);
  },
  ocrRecognize(req: {
    rect: AutonomyRect | null;
    accurate?: boolean;
    lang?: string;
  }): Promise<OcrResult> {
    return ipcRenderer.invoke(IPC.ocrRecognize, req);
  },
  focusApp(req: { app: string; launchIfMissing?: boolean }): Promise<FocusAppResult> {
    return ipcRenderer.invoke(IPC.focusApp, req);
  },
  listApps(): Promise<{ ok: boolean; apps?: RunningApp[]; err?: string }> {
    return ipcRenderer.invoke(IPC.listApps);
  },
  idleSeconds(): Promise<{ ok: boolean; seconds?: number; err?: string }> {
    return ipcRenderer.invoke(IPC.idleSeconds);
  },
  pathRecordStart(): Promise<PathRecorderStatus> {
    return ipcRenderer.invoke(IPC.pathRecordStart);
  },
  pathRecordStop(): Promise<PathRecording | null> {
    return ipcRenderer.invoke(IPC.pathRecordStop);
  },
  onPathRecordTick(cb: (status: PathRecorderStatus) => void): () => void {
    const handler = (_e: unknown, status: PathRecorderStatus) => cb(status);
    ipcRenderer.on(IPC.pathRecordTick, handler);
    return () => ipcRenderer.off(IPC.pathRecordTick, handler);
  },
  triggersSet(list: Trigger[]): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(IPC.triggersSet, list);
  },
  triggersRemove(id: string): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(IPC.triggersRemove, id);
  },
  triggersFire(flowId: string): Promise<{ ok: boolean; err?: string }> {
    return ipcRenderer.invoke(IPC.triggersFire, flowId);
  },
  onAutonomyTick(cb: (tick: AutonomyTick) => void): () => void {
    const handler = (_e: unknown, tick: AutonomyTick) => cb(tick);
    ipcRenderer.on(IPC.autonomyTick, handler);
    return () => ipcRenderer.off(IPC.autonomyTick, handler);
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
  setDockVisible(visible: boolean): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(IPC.settingsDockVisibleSet, visible);
  },
  setCloseToTray(value: boolean): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(IPC.settingsCloseToTraySet, value);
  },
  setPopoverAutoHide(value: boolean): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(IPC.settingsPopoverAutoHideSet, value);
  },
  setPreventSleep(value: boolean): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(IPC.settingsPreventSleepSet, value);
  },
  openAccessibilitySettings(): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(IPC.settingsOpenAccessibility);
  },
  openScreenRecordingSettings(): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(IPC.settingsOpenScreenRecording);
  },
  onTick(cb: (tick: ClickerTick) => void): () => void {
    const handler = (_e: unknown, tick: ClickerTick) => cb(tick);
    ipcRenderer.on(IPC.clickerTick, handler);
    return () => ipcRenderer.off(IPC.clickerTick, handler);
  },
  onHotkey(cb: (e: HotkeyFireEvent) => void): () => void {
    const handler = (_e: unknown, payload: HotkeyFireEvent) => cb(payload);
    ipcRenderer.on(IPC.hotkeyFire, handler);
    return () => ipcRenderer.off(IPC.hotkeyFire, handler);
  },
  onHotkeyStatus(cb: (reg: HotkeyRegistration) => void): () => void {
    const handler = (_e: unknown, reg: HotkeyRegistration) => cb(reg);
    ipcRenderer.on(IPC.hotkeyStatus, handler);
    return () => ipcRenderer.off(IPC.hotkeyStatus, handler);
  },
  // Cross-window persisted-state sync. Each renderer fires
  // `broadcastState(slice)` whenever its persisted zustand slice changes; the
  // main process relays the payload to every OTHER window, which receives it
  // here via `onStateBroadcast` and applies it to its own store.
  broadcastState(slice: unknown): void {
    ipcRenderer.send(IPC.stateBroadcast, slice);
  },
  onStateBroadcast(cb: (slice: unknown) => void): () => void {
    const handler = (_e: unknown, slice: unknown) => cb(slice);
    ipcRenderer.on(IPC.stateBroadcast, handler);
    return () => ipcRenderer.off(IPC.stateBroadcast, handler);
  },
};

contextBridge.exposeInMainWorld('clik', api);

export type ClikApi = typeof api;
