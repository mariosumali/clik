const { app, BrowserWindow, ipcMain, dialog, shell, globalShortcut, systemPreferences, screen } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

let robot = null;
try {
  // Optional dependency. If unavailable, runtime still works in simulation mode.
  robot = require("@jitsi/robotjs");
} catch {
  robot = null;
}

const APP_TITLE = "mars-autoclicker (Electron)";

const PERMISSION_URLS = {
  accessibility: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
  inputMonitoring: "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent",
  screenRecording: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
  microphone: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
  automation: "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation"
};

function createDefaultProfile(name = "Quick Start") {
  return {
    id: randomUUID(),
    name,
    accentHexColor: "#00FF88",
    clickEngine: {
      clickType: "left",
      intervalMode: {
        kind: "fixed",
        milliseconds: 120,
        minMilliseconds: 90,
        maxMilliseconds: 180,
        meanMilliseconds: 120,
        sigma: 18
      },
      coordinateMode: {
        kind: "followCursor",
        fixedPoint: { x: 400, y: 300 },
        offset: { x: 0, y: 0 },
        boundingBox: { x: 300, y: 180, width: 380, height: 220 }
      },
      holdMilliseconds: 50,
      loopLimit: null
    },
    targeting: {
      mode: "fixed",
      lockOnFirstMatch: false,
      searchRegion: null,
      ocrPolicy: "visionPreferredWithTesseractFallback"
    },
    humanization: {
      preset: "natural",
      jitterSigmaPixels: 1.5,
      timingVariancePercent: 0.1,
      holdVarianceMilliseconds: 20,
      usesBezierMotion: true,
      movementSpeedPixelsPerSecond: 900,
      idleWiggleEnabled: false,
      deterministicSeed: null
    },
    triggerGroup: {
      startHotkey: "F8",
      pauseHotkey: "F9",
      emergencyStopHotkey: "F12",
      armed: false
    },
    macroGraphID: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function createDefaultAppState() {
  const profile = createDefaultProfile();
  return {
    profiles: [profile],
    activeProfileId: profile.id,
    ui: {
      activeTab: "control"
    }
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function randomGaussian(mean, sigma) {
  const u1 = Math.max(Number.EPSILON, Math.random());
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * sigma;
}

class AutoClickRuntime {
  constructor(onUpdate, onNotice) {
    this.onUpdate = onUpdate;
    this.onNotice = onNotice;
    this.state = "idle";
    this.clickCount = 0;
    this.runtimeStartAt = 0;
    this.lastRuntimeSeconds = 0;
    this.clickTimer = null;
    this.profile = null;
    this.lastError = null;
    this.injectionMode = robot ? "native" : "simulation";
  }

  getSnapshot() {
    const runtimeSeconds = this.state === "running" ? (Date.now() - this.runtimeStartAt) / 1000 : this.lastRuntimeSeconds;
    const clicksPerSecond = runtimeSeconds > 0 ? this.clickCount / runtimeSeconds : 0;

    return {
      state: this.state,
      clickCount: this.clickCount,
      runtimeSeconds,
      clicksPerSecond,
      lastError: this.lastError,
      injectionMode: this.injectionMode
    };
  }

  emitUpdate() {
    this.onUpdate(this.getSnapshot());
  }

  start(profile) {
    if (!profile) {
      throw new Error("Cannot start runtime without an active profile.");
    }

    this.profile = profile;
    this.state = "running";
    this.clickCount = 0;
    this.lastError = null;
    this.runtimeStartAt = Date.now();
    this.lastRuntimeSeconds = 0;
    this.clearTimer();
    this.scheduleNextTick();
    this.emitUpdate();

    if (!robot) {
      this.onNotice("Native click injection unavailable (optional @jitsi/robotjs missing). Running in simulation mode.");
    }
  }

  pauseResume() {
    if (this.state === "running") {
      this.state = "paused";
      this.lastRuntimeSeconds = (Date.now() - this.runtimeStartAt) / 1000;
      this.clearTimer();
      this.emitUpdate();
      return this.state;
    }

    if (this.state === "paused") {
      this.state = "running";
      this.runtimeStartAt = Date.now() - Math.floor(this.lastRuntimeSeconds * 1000);
      this.scheduleNextTick();
      this.emitUpdate();
      return this.state;
    }

    return this.state;
  }

  stop() {
    if (this.state === "idle" || this.state === "stopped") {
      return;
    }

    this.state = "stopped";
    this.lastRuntimeSeconds = this.runtimeStartAt ? (Date.now() - this.runtimeStartAt) / 1000 : 0;
    this.clearTimer();
    this.emitUpdate();
  }

  emergencyStop() {
    this.state = "stopped";
    this.lastError = "Emergency stop requested.";
    this.clearTimer();
    this.emitUpdate();
  }

  clearTimer() {
    if (this.clickTimer) {
      clearTimeout(this.clickTimer);
      this.clickTimer = null;
    }
  }

  scheduleNextTick() {
    if (this.state !== "running" || !this.profile) {
      return;
    }

    const delay = this.resolveInterval(this.profile.clickEngine.intervalMode, this.profile.humanization);
    this.clickTimer = setTimeout(async () => {
      try {
        await this.performClickCycle();
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : String(error);
        this.stop();
      }
    }, delay);
  }

  resolveInterval(intervalMode, humanization) {
    const safeMode = intervalMode || {};
    let baseMs = 120;

    switch (safeMode.kind) {
      case "randomRange":
        {
          const min = Math.max(1, Number(safeMode.minMilliseconds || 1));
          const max = Math.max(min, Number(safeMode.maxMilliseconds || min));
          baseMs = Math.floor(Math.random() * (max - min + 1)) + min;
        }
        break;
      case "gaussian":
        baseMs = Math.round(randomGaussian(safeMode.meanMilliseconds || 120, safeMode.sigma || 15));
        break;
      case "fixed":
      default:
        baseMs = safeMode.milliseconds || 120;
        break;
    }

    const variance = clamp(Number(humanization?.timingVariancePercent || 0), 0, 1);
    const factor = 1 + (Math.random() * 2 - 1) * variance;
    return Math.max(1, Math.round(baseMs * factor));
  }

  resolvePoint(profile) {
    const mode = profile.clickEngine.coordinateMode || {};
    if (mode.kind === "fixed") {
      return { ...mode.fixedPoint };
    }

    if (mode.kind === "relativeToActiveWindow") {
      return { ...mode.offset };
    }

    if (mode.kind === "randomInBoundingBox") {
      const box = mode.boundingBox || { x: 0, y: 0, width: 1, height: 1 };
      return {
        x: box.x + Math.random() * box.width,
        y: box.y + Math.random() * box.height
      };
    }

    if (mode.kind === "followCursor" || !mode.kind) {
      if (robot && typeof robot.getMousePos === "function") {
        const pos = robot.getMousePos();
        return { x: pos.x, y: pos.y };
      }
      const pos = screen.getCursorScreenPoint();
      return { x: pos.x, y: pos.y };
    }

    return { x: 0, y: 0 };
  }

  applyHumanization(basePoint, humanization) {
    const safe = humanization || {};
    const sigma = Math.max(0, Number(safe.jitterSigmaPixels || 0));
    const jitterX = sigma > 0 ? randomGaussian(0, sigma) : 0;
    const jitterY = sigma > 0 ? randomGaussian(0, sigma) : 0;
    const holdVariance = Math.max(0, Number(safe.holdVarianceMilliseconds || 0));
    const holdOffset = holdVariance > 0 ? Math.round((Math.random() * 2 - 1) * holdVariance) : 0;

    return {
      point: {
        x: Math.round(basePoint.x + jitterX),
        y: Math.round(basePoint.y + jitterY)
      },
      holdOffset
    };
  }

  async performClickCycle() {
    if (this.state !== "running" || !this.profile) {
      return;
    }

    const basePoint = this.resolvePoint(this.profile);
    const humanized = this.applyHumanization(basePoint, this.profile.humanization);
    const holdMilliseconds = Math.max(1, (this.profile.clickEngine.holdMilliseconds || 50) + humanized.holdOffset);
    const clickType = this.profile.clickEngine.clickType || "left";

    await this.injectClick(clickType, humanized.point, holdMilliseconds);
    this.clickCount += 1;
    this.emitUpdate();

    const loopLimit = this.profile.clickEngine.loopLimit;
    if (typeof loopLimit === "number" && loopLimit > 0 && this.clickCount >= loopLimit) {
      this.stop();
      return;
    }

    this.scheduleNextTick();
  }

  async injectClick(clickType, point, holdMilliseconds) {
    if (!robot) {
      // Simulation mode for UI development and no-native environments.
      return;
    }

    if (typeof robot.moveMouseSmooth === "function") {
      robot.moveMouseSmooth(point.x, point.y, 1);
    } else if (typeof robot.moveMouse === "function") {
      robot.moveMouse(point.x, point.y);
    }

    if (clickType === "double") {
      robot.mouseClick("left", true);
      return;
    }

    if (clickType === "hold") {
      robot.mouseToggle("down", "left");
      await new Promise((resolve) => setTimeout(resolve, holdMilliseconds));
      robot.mouseToggle("up", "left");
      return;
    }

    if (clickType === "scroll") {
      robot.scrollMouse(0, -8);
      return;
    }

    if (clickType === "drag") {
      robot.mouseToggle("down", "left");
      robot.moveMouse(point.x + 20, point.y + 12);
      robot.mouseToggle("up", "left");
      return;
    }

    const button = clickType === "right" ? "right" : clickType === "middle" ? "middle" : "left";
    robot.mouseClick(button, false);
  }
}

let mainWindow = null;
let appState = createDefaultAppState();
let runtime = null;

function getStateFilePath() {
  return path.join(app.getPath("userData"), "profiles.json");
}

async function loadStateFromDisk() {
  const stateFile = getStateFilePath();
  try {
    const raw = await fs.readFile(stateFile, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.profiles) || parsed.profiles.length === 0) {
      return createDefaultAppState();
    }
    return parsed;
  } catch {
    return createDefaultAppState();
  }
}

async function saveStateToDisk(state) {
  const stateFile = getStateFilePath();
  await fs.mkdir(path.dirname(stateFile), { recursive: true });
  await fs.writeFile(stateFile, JSON.stringify(state, null, 2), "utf8");
}

function sendToRenderer(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send(channel, payload);
}

function getPermissionStatus() {
  const accessibilityGranted =
    typeof systemPreferences.isTrustedAccessibilityClient === "function" &&
    systemPreferences.isTrustedAccessibilityClient(false);

  const screenStatus = systemPreferences.getMediaAccessStatus("screen");
  const microphoneStatus = systemPreferences.getMediaAccessStatus("microphone");

  const mapMedia = (status) => {
    if (status === "granted") return "granted";
    if (status === "not-determined") return "missing";
    if (status === "denied" || status === "restricted" || status === "unknown") return "missing";
    return "notRequired";
  };

  return {
    accessibility: accessibilityGranted ? "granted" : "missing",
    inputMonitoring: "notRequired",
    screenRecording: mapMedia(screenStatus),
    microphone: mapMedia(microphoneStatus),
    automation: "notRequired"
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1100,
    minHeight: 700,
    title: APP_TITLE,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#070b14",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "renderer/index.html"));
}

function registerGlobalShortcuts() {
  globalShortcut.unregisterAll();

  globalShortcut.register("F8", () => {
    const active = appState.profiles.find((profile) => profile.id === appState.activeProfileId) || appState.profiles[0];
    if (!active) {
      return;
    }
    runtime.start(active);
    sendToRenderer("runtime:shortcut", { action: "start", hotkey: "F8" });
  });

  globalShortcut.register("F9", () => {
    runtime.pauseResume();
    sendToRenderer("runtime:shortcut", { action: "pauseResume", hotkey: "F9" });
  });

  globalShortcut.register("F12", () => {
    runtime.emergencyStop();
    sendToRenderer("runtime:shortcut", { action: "emergencyStop", hotkey: "F12" });
  });
}

function wireIpc() {
  ipcMain.handle("state:load", async () => {
    return appState;
  });

  ipcMain.handle("state:save", async (_event, nextState) => {
    appState = nextState;
    await saveStateToDisk(appState);
    return appState;
  });

  ipcMain.handle("runtime:start", async (_event, profile) => {
    runtime.start(profile);
    return runtime.getSnapshot();
  });

  ipcMain.handle("runtime:pause-resume", async () => {
    runtime.pauseResume();
    return runtime.getSnapshot();
  });

  ipcMain.handle("runtime:stop", async () => {
    runtime.stop();
    return runtime.getSnapshot();
  });

  ipcMain.handle("runtime:get", async () => {
    return runtime.getSnapshot();
  });

  ipcMain.handle("permissions:get", async () => {
    return getPermissionStatus();
  });

  ipcMain.handle("permissions:open", async (_event, permission) => {
    const url = PERMISSION_URLS[permission];
    if (!url) {
      return false;
    }
    await shell.openExternal(url);
    return true;
  });

  ipcMain.handle("profiles:import", async () => {
    const response = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile"],
      filters: [{ name: "Profile", extensions: ["cfprofile", "json"] }]
    });

    if (response.canceled || response.filePaths.length === 0) {
      return { canceled: true };
    }

    const filePath = response.filePaths[0];
    const content = await fs.readFile(filePath, "utf8");
    return {
      canceled: false,
      filePath,
      profile: JSON.parse(content)
    };
  });

  ipcMain.handle("profiles:export", async (_event, profile) => {
    const response = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `${profile.name || "profile"}.cfprofile`,
      filters: [{ name: "Profile", extensions: ["cfprofile"] }]
    });

    if (response.canceled || !response.filePath) {
      return { canceled: true };
    }

    await fs.writeFile(response.filePath, JSON.stringify(profile, null, 2), "utf8");
    return { canceled: false, filePath: response.filePath };
  });

  ipcMain.handle("profiles:import-pack", async () => {
    const response = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile"],
      filters: [{ name: "Profile Pack", extensions: ["cfpack", "json"] }]
    });

    if (response.canceled || response.filePaths.length === 0) {
      return { canceled: true };
    }

    const filePath = response.filePaths[0];
    const content = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(content);
    const profiles = Array.isArray(parsed.profiles) ? parsed.profiles : [];
    return { canceled: false, filePath, profiles };
  });

  ipcMain.handle("profiles:export-pack", async (_event, profiles) => {
    const response = await dialog.showSaveDialog(mainWindow, {
      defaultPath: "profiles.cfpack",
      filters: [{ name: "Profile Pack", extensions: ["cfpack"] }]
    });

    if (response.canceled || !response.filePath) {
      return { canceled: true };
    }

    const payload = { profiles };
    await fs.writeFile(response.filePath, JSON.stringify(payload, null, 2), "utf8");
    return { canceled: false, filePath: response.filePath };
  });
}

app.whenReady().then(async () => {
  appState = await loadStateFromDisk();

  runtime = new AutoClickRuntime(
    (snapshot) => sendToRenderer("runtime:update", snapshot),
    (message) => sendToRenderer("runtime:notice", { message })
  );

  wireIpc();
  createWindow();
  registerGlobalShortcuts();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
