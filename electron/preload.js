const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("autoclickerAPI", {
  loadState: () => ipcRenderer.invoke("state:load"),
  saveState: (state) => ipcRenderer.invoke("state:save", state),
  startRuntime: (profile) => ipcRenderer.invoke("runtime:start", profile),
  pauseResumeRuntime: () => ipcRenderer.invoke("runtime:pause-resume"),
  stopRuntime: () => ipcRenderer.invoke("runtime:stop"),
  getRuntimeSnapshot: () => ipcRenderer.invoke("runtime:get"),
  getPermissionStatus: () => ipcRenderer.invoke("permissions:get"),
  openPermissionSettings: (permission) => ipcRenderer.invoke("permissions:open", permission),
  importProfile: () => ipcRenderer.invoke("profiles:import"),
  exportProfile: (profile) => ipcRenderer.invoke("profiles:export", profile),
  importProfilePack: () => ipcRenderer.invoke("profiles:import-pack"),
  exportProfilePack: (profiles) => ipcRenderer.invoke("profiles:export-pack", profiles),
  onRuntimeUpdate: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("runtime:update", handler);
    return () => ipcRenderer.removeListener("runtime:update", handler);
  },
  onRuntimeNotice: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("runtime:notice", handler);
    return () => ipcRenderer.removeListener("runtime:notice", handler);
  },
  onRuntimeShortcut: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("runtime:shortcut", handler);
    return () => ipcRenderer.removeListener("runtime:shortcut", handler);
  }
});
