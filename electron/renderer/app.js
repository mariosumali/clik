const api = window.autoclickerAPI;

const tabs = [
  { id: "control", label: "Click Engine" },
  { id: "targeting", label: "Targeting" },
  { id: "humanization", label: "Humanization" },
  { id: "triggers", label: "Triggers" },
  { id: "profiles", label: "Profiles" },
  { id: "settings", label: "Settings" }
];

const permissionLabels = {
  accessibility: "Accessibility",
  inputMonitoring: "Input Monitoring",
  screenRecording: "Screen Recording",
  microphone: "Microphone",
  automation: "Automation"
};

let appState = null;
let runtimeSnapshot = {
  state: "idle",
  clickCount: 0,
  runtimeSeconds: 0,
  clicksPerSecond: 0,
  lastError: null,
  injectionMode: "simulation"
};
let permissionState = {};
let noticeText = "No notices yet.";

function generateID() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}

function createDefaultProfile(name = "Profile") {
  const now = new Date().toISOString();
  return {
    id: generateID(),
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
    createdAt: now,
    updatedAt: now
  };
}

function hydrateState(state) {
  if (!state || !Array.isArray(state.profiles) || state.profiles.length === 0) {
    const profile = createDefaultProfile("Quick Start");
    return {
      profiles: [profile],
      activeProfileId: profile.id,
      ui: { activeTab: "control" }
    };
  }

  const activeProfileExists = state.profiles.some((profile) => profile.id === state.activeProfileId);
  if (!activeProfileExists) {
    state.activeProfileId = state.profiles[0].id;
  }
  if (!state.ui?.activeTab) {
    state.ui = { ...state.ui, activeTab: "control" };
  }
  return state;
}

function activeProfile() {
  return appState.profiles.find((profile) => profile.id === appState.activeProfileId) || appState.profiles[0];
}

async function persistState() {
  await api.saveState(appState);
}

function setNotice(message) {
  noticeText = message;
  const notice = document.getElementById("noticeText");
  if (notice) {
    notice.textContent = message;
  }
}

function formatNumber(value, fractionDigits = 2) {
  return Number(value || 0).toFixed(fractionDigits);
}

function formatRuntime(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const minutes = Math.floor(s / 60);
  const remainder = s % 60;
  return `${minutes}m ${String(remainder).padStart(2, "0")}s`;
}

function updateActiveProfile(mutator) {
  const profile = activeProfile();
  if (!profile) return;
  mutator(profile);
  profile.updatedAt = new Date().toISOString();
}

async function refreshPermissions() {
  permissionState = await api.getPermissionStatus();
  renderPermissions();
}

function renderProfileList() {
  const list = document.getElementById("profileList");
  list.innerHTML = "";

  for (const profile of appState.profiles) {
    const button = document.createElement("button");
    button.className = `profile-item ${profile.id === appState.activeProfileId ? "active" : ""}`;
    button.textContent = profile.name;
    button.addEventListener("click", () => {
      appState.activeProfileId = profile.id;
      renderAll();
      persistState();
    });
    list.appendChild(button);
  }
}

function renderTabNav() {
  const nav = document.getElementById("tabNav");
  nav.innerHTML = "";
  const activeTab = appState.ui.activeTab;

  for (const tab of tabs) {
    const button = document.createElement("button");
    button.className = `tab-item ${activeTab === tab.id ? "active" : ""}`;
    button.textContent = tab.label;
    button.addEventListener("click", () => {
      appState.ui.activeTab = tab.id;
      renderPanel();
      renderTabNav();
      persistState();
    });
    nav.appendChild(button);
  }
}

function renderHeader() {
  const profile = activeProfile();
  document.getElementById("activeProfileTitle").textContent = profile?.name || "No profile selected";
  document.getElementById("runtimeStatusText").textContent =
    runtimeSnapshot.lastError || `Engine is ${runtimeSnapshot.state}`;
}

function renderMetrics() {
  const metrics = [
    { label: "State", value: runtimeSnapshot.state.toUpperCase() },
    { label: "Clicks", value: String(runtimeSnapshot.clickCount) },
    { label: "CPS", value: formatNumber(runtimeSnapshot.clicksPerSecond, 2) },
    { label: "Runtime", value: formatRuntime(runtimeSnapshot.runtimeSeconds) },
    { label: "Injection", value: runtimeSnapshot.injectionMode.toUpperCase() }
  ];

  const root = document.getElementById("runtimeMetrics");
  root.innerHTML = "";

  for (const metric of metrics) {
    const node = document.getElementById("metricCardTemplate").content.cloneNode(true);
    node.querySelector(".metric-label").textContent = metric.label;
    node.querySelector(".metric-value").textContent = metric.value;
    root.appendChild(node);
  }
}

function renderPermissions() {
  const root = document.getElementById("permissionList");
  root.innerHTML = "";

  const entries = Object.keys(permissionLabels);
  for (const key of entries) {
    const status = permissionState[key] || "missing";
    const wrapper = document.createElement("div");
    wrapper.className = "permission-item";
    wrapper.innerHTML = `
      <div class="permission-head">
        <span>${permissionLabels[key]}</span>
        <span class="pill ${status}">${status}</span>
      </div>
      <button class="ghost-btn" data-open-permission="${key}">Open System Settings</button>
    `;
    root.appendChild(wrapper);
  }

  root.querySelectorAll("[data-open-permission]").forEach((button) => {
    button.addEventListener("click", async () => {
      const permission = button.getAttribute("data-open-permission");
      await api.openPermissionSettings(permission);
      setNotice(`Opened macOS privacy settings for ${permissionLabels[permission]}.`);
      refreshPermissions();
    });
  });
}

function renderPanel() {
  const profile = activeProfile();
  const root = document.getElementById("panelRoot");
  const activeTab = appState.ui.activeTab;

  if (!profile) {
    root.innerHTML = `<p class="muted">Create a profile to get started.</p>`;
    return;
  }

  if (activeTab === "control") {
    root.innerHTML = `
      <div class="panel-grid">
        <article class="panel-card">
          <h4>Engine Configuration</h4>
          <div class="field-grid">
            <div class="field">
              <label>Click Type</label>
              <select id="clickTypeInput">
                ${["left", "right", "middle", "double", "hold", "drag", "scroll"]
                  .map((type) => `<option value="${type}" ${profile.clickEngine.clickType === type ? "selected" : ""}>${type}</option>`)
                  .join("")}
              </select>
            </div>
            <div class="field">
              <label>Hold (ms)</label>
              <input id="holdMsInput" type="number" min="1" value="${profile.clickEngine.holdMilliseconds}" />
            </div>
            <div class="field">
              <label>Loop Limit</label>
              <input id="loopLimitInput" type="number" min="1" value="${profile.clickEngine.loopLimit ?? ""}" placeholder="Unlimited" />
            </div>
            <div class="field">
              <label>Interval Mode</label>
              <select id="intervalModeInput">
                ${["fixed", "randomRange", "gaussian"]
                  .map((kind) => `<option value="${kind}" ${profile.clickEngine.intervalMode.kind === kind ? "selected" : ""}>${kind}</option>`)
                  .join("")}
              </select>
            </div>
          </div>
          <div class="field-grid">
            <div class="field">
              <label>Fixed (ms)</label>
              <input id="intervalFixedInput" type="number" min="1" value="${profile.clickEngine.intervalMode.milliseconds}" />
            </div>
            <div class="field">
              <label>Range Min (ms)</label>
              <input id="intervalMinInput" type="number" min="1" value="${profile.clickEngine.intervalMode.minMilliseconds}" />
            </div>
            <div class="field">
              <label>Range Max (ms)</label>
              <input id="intervalMaxInput" type="number" min="1" value="${profile.clickEngine.intervalMode.maxMilliseconds}" />
            </div>
            <div class="field">
              <label>Gaussian Sigma</label>
              <input id="intervalSigmaInput" type="number" min="1" value="${profile.clickEngine.intervalMode.sigma}" />
            </div>
          </div>
        </article>

        <article class="panel-card">
          <h4>Coordinate Strategy</h4>
          <div class="field">
            <label>Coordinate Mode</label>
            <select id="coordinateModeInput">
              ${["followCursor", "fixed", "randomInBoundingBox", "relativeToActiveWindow"]
                .map((kind) => `<option value="${kind}" ${profile.clickEngine.coordinateMode.kind === kind ? "selected" : ""}>${kind}</option>`)
                .join("")}
            </select>
          </div>
          <div class="field-grid">
            <div class="field">
              <label>X</label>
              <input id="pointXInput" type="number" value="${profile.clickEngine.coordinateMode.fixedPoint.x}" />
            </div>
            <div class="field">
              <label>Y</label>
              <input id="pointYInput" type="number" value="${profile.clickEngine.coordinateMode.fixedPoint.y}" />
            </div>
            <div class="field">
              <label>Box Width</label>
              <input id="boxWInput" type="number" min="1" value="${profile.clickEngine.coordinateMode.boundingBox.width}" />
            </div>
            <div class="field">
              <label>Box Height</label>
              <input id="boxHInput" type="number" min="1" value="${profile.clickEngine.coordinateMode.boundingBox.height}" />
            </div>
          </div>
          <p class="status-note">Follow cursor for live pointer clicking, fixed for absolute coordinates, or bounding box for randomized click spread.</p>
        </article>
      </div>
    `;

    const bindNumber = (id, mutator) => {
      const node = document.getElementById(id);
      node.addEventListener("change", async () => {
        updateActiveProfile((p) => mutator(p, Number(node.value)));
        await persistState();
      });
    };

    document.getElementById("clickTypeInput").addEventListener("change", async (event) => {
      updateActiveProfile((p) => {
        p.clickEngine.clickType = event.target.value;
      });
      await persistState();
    });

    document.getElementById("intervalModeInput").addEventListener("change", async (event) => {
      updateActiveProfile((p) => {
        p.clickEngine.intervalMode.kind = event.target.value;
      });
      await persistState();
    });

    document.getElementById("coordinateModeInput").addEventListener("change", async (event) => {
      updateActiveProfile((p) => {
        p.clickEngine.coordinateMode.kind = event.target.value;
      });
      await persistState();
    });

    bindNumber("holdMsInput", (p, value) => {
      p.clickEngine.holdMilliseconds = Math.max(1, value);
    });
    bindNumber("loopLimitInput", (p, value) => {
      p.clickEngine.loopLimit = Number.isFinite(value) && value > 0 ? value : null;
    });
    bindNumber("intervalFixedInput", (p, value) => {
      p.clickEngine.intervalMode.milliseconds = Math.max(1, value);
      p.clickEngine.intervalMode.meanMilliseconds = Math.max(1, value);
    });
    bindNumber("intervalMinInput", (p, value) => {
      p.clickEngine.intervalMode.minMilliseconds = Math.max(1, value);
    });
    bindNumber("intervalMaxInput", (p, value) => {
      p.clickEngine.intervalMode.maxMilliseconds = Math.max(1, value);
    });
    bindNumber("intervalSigmaInput", (p, value) => {
      p.clickEngine.intervalMode.sigma = Math.max(1, value);
    });
    bindNumber("pointXInput", (p, value) => {
      p.clickEngine.coordinateMode.fixedPoint.x = value;
      p.clickEngine.coordinateMode.boundingBox.x = value;
      p.clickEngine.coordinateMode.offset.x = value;
    });
    bindNumber("pointYInput", (p, value) => {
      p.clickEngine.coordinateMode.fixedPoint.y = value;
      p.clickEngine.coordinateMode.boundingBox.y = value;
      p.clickEngine.coordinateMode.offset.y = value;
    });
    bindNumber("boxWInput", (p, value) => {
      p.clickEngine.coordinateMode.boundingBox.width = Math.max(1, value);
    });
    bindNumber("boxHInput", (p, value) => {
      p.clickEngine.coordinateMode.boundingBox.height = Math.max(1, value);
    });
    return;
  }

  if (activeTab === "targeting") {
    root.innerHTML = `
      <div class="panel-grid">
        <article class="panel-card">
          <h4>Targeting Mode</h4>
          <div class="field">
            <label>Mode</label>
            <select id="targetModeInput">
              ${["fixed", "boundingBox", "image", "color", "accessibility", "ocr"]
                .map((mode) => `<option value="${mode}" ${profile.targeting.mode === mode ? "selected" : ""}>${mode}</option>`)
                .join("")}
            </select>
          </div>
          <div class="field">
            <label>OCR Policy</label>
            <select id="ocrPolicyInput">
              ${["visionOnly", "visionPreferredWithTesseractFallback", "tesseractOnly"]
                .map((policy) => `<option value="${policy}" ${profile.targeting.ocrPolicy === policy ? "selected" : ""}>${policy}</option>`)
                .join("")}
            </select>
          </div>
          <div class="field">
            <label>Search Region (JSON)</label>
            <input id="searchRegionInput" type="text" value='${JSON.stringify(
              profile.targeting.searchRegion || { x: 300, y: 180, width: 380, height: 220 }
            )}' />
          </div>
          <div class="field">
            <label>Lock on first match</label>
            <select id="targetLockInput">
              <option value="false" ${!profile.targeting.lockOnFirstMatch ? "selected" : ""}>false</option>
              <option value="true" ${profile.targeting.lockOnFirstMatch ? "selected" : ""}>true</option>
            </select>
          </div>
        </article>

        <article class="panel-card">
          <h4>Notes</h4>
          <p class="status-note">This Electron build keeps targeting metadata and profile schema parity while prioritizing runtime controls and quick profile iteration.</p>
          <p class="status-note">Advanced image/OCR/AX resolution adapters can be plugged into the main process runtime later without changing the UI schema.</p>
        </article>
      </div>
    `;

    document.getElementById("targetModeInput").addEventListener("change", async (event) => {
      updateActiveProfile((p) => {
        p.targeting.mode = event.target.value;
      });
      await persistState();
    });

    document.getElementById("ocrPolicyInput").addEventListener("change", async (event) => {
      updateActiveProfile((p) => {
        p.targeting.ocrPolicy = event.target.value;
      });
      await persistState();
    });

    document.getElementById("targetLockInput").addEventListener("change", async (event) => {
      updateActiveProfile((p) => {
        p.targeting.lockOnFirstMatch = event.target.value === "true";
      });
      await persistState();
    });

    document.getElementById("searchRegionInput").addEventListener("change", async (event) => {
      try {
        const parsed = JSON.parse(event.target.value);
        updateActiveProfile((p) => {
          p.targeting.searchRegion = parsed;
        });
        await persistState();
      } catch {
        setNotice("Invalid searchRegion JSON. Example: {\"x\":300,\"y\":180,\"width\":380,\"height\":220}");
      }
    });
    return;
  }

  if (activeTab === "humanization") {
    root.innerHTML = `
      <div class="panel-grid">
        <article class="panel-card">
          <h4>Behavior Shaping</h4>
          <div class="field-grid">
            <div class="field">
              <label>Preset</label>
              <select id="humanPresetInput">
                ${["off", "subtle", "natural", "heavy"]
                  .map((preset) => `<option value="${preset}" ${profile.humanization.preset === preset ? "selected" : ""}>${preset}</option>`)
                  .join("")}
              </select>
            </div>
            <div class="field">
              <label>Jitter Sigma (px)</label>
              <input id="jitterInput" type="number" step="0.1" min="0" value="${profile.humanization.jitterSigmaPixels}" />
            </div>
            <div class="field">
              <label>Timing Variance</label>
              <input id="timingVarianceInput" type="number" step="0.01" min="0" max="1" value="${profile.humanization.timingVariancePercent}" />
            </div>
            <div class="field">
              <label>Hold Variance (ms)</label>
              <input id="holdVarianceInput" type="number" min="0" value="${profile.humanization.holdVarianceMilliseconds}" />
            </div>
            <div class="field">
              <label>Movement Speed</label>
              <input id="movementSpeedInput" type="number" min="1" value="${profile.humanization.movementSpeedPixelsPerSecond}" />
            </div>
            <div class="field">
              <label>Deterministic Seed (optional)</label>
              <input id="seedInput" type="number" value="${profile.humanization.deterministicSeed ?? ""}" />
            </div>
          </div>
          <div class="field-grid">
            <div class="field">
              <label>Bezier Motion</label>
              <select id="bezierInput">
                <option value="true" ${profile.humanization.usesBezierMotion ? "selected" : ""}>true</option>
                <option value="false" ${!profile.humanization.usesBezierMotion ? "selected" : ""}>false</option>
              </select>
            </div>
            <div class="field">
              <label>Idle Wiggle</label>
              <select id="idleWiggleInput">
                <option value="true" ${profile.humanization.idleWiggleEnabled ? "selected" : ""}>true</option>
                <option value="false" ${!profile.humanization.idleWiggleEnabled ? "selected" : ""}>false</option>
              </select>
            </div>
          </div>
        </article>
      </div>
    `;

    const bind = (id, mutator) => {
      document.getElementById(id).addEventListener("change", async (event) => {
        updateActiveProfile((p) => mutator(p, event.target.value));
        await persistState();
      });
    };

    bind("humanPresetInput", (p, value) => (p.humanization.preset = value));
    bind("jitterInput", (p, value) => (p.humanization.jitterSigmaPixels = Number(value)));
    bind("timingVarianceInput", (p, value) => (p.humanization.timingVariancePercent = Number(value)));
    bind("holdVarianceInput", (p, value) => (p.humanization.holdVarianceMilliseconds = Number(value)));
    bind("movementSpeedInput", (p, value) => (p.humanization.movementSpeedPixelsPerSecond = Number(value)));
    bind("seedInput", (p, value) => (p.humanization.deterministicSeed = value ? Number(value) : null));
    bind("bezierInput", (p, value) => (p.humanization.usesBezierMotion = value === "true"));
    bind("idleWiggleInput", (p, value) => (p.humanization.idleWiggleEnabled = value === "true"));
    return;
  }

  if (activeTab === "triggers") {
    root.innerHTML = `
      <div class="panel-grid">
        <article class="panel-card">
          <h4>Trigger Runtime</h4>
          <p class="status-note">Current engine shortcuts are bound globally in the main process and mirror the native app behavior.</p>
          <div class="field-grid">
            <div class="field">
              <label>Triggers Armed</label>
              <select id="triggerArmedInput">
                <option value="true" ${profile.triggerGroup.armed ? "selected" : ""}>true</option>
                <option value="false" ${!profile.triggerGroup.armed ? "selected" : ""}>false</option>
              </select>
            </div>
            <div class="field">
              <label>Start Hotkey</label>
              <input id="startHotkeyInput" type="text" value="${profile.triggerGroup.startHotkey}" />
            </div>
            <div class="field">
              <label>Pause Hotkey</label>
              <input id="pauseHotkeyInput" type="text" value="${profile.triggerGroup.pauseHotkey}" />
            </div>
            <div class="field">
              <label>Emergency Stop Hotkey</label>
              <input id="stopHotkeyInput" type="text" value="${profile.triggerGroup.emergencyStopHotkey}" />
            </div>
          </div>
        </article>
      </div>
    `;

    document.getElementById("triggerArmedInput").addEventListener("change", async (event) => {
      updateActiveProfile((p) => {
        p.triggerGroup.armed = event.target.value === "true";
      });
      await persistState();
    });

    const bindHotkey = (id, key) => {
      document.getElementById(id).addEventListener("change", async (event) => {
        updateActiveProfile((p) => {
          p.triggerGroup[key] = event.target.value.trim();
        });
        await persistState();
      });
    };
    bindHotkey("startHotkeyInput", "startHotkey");
    bindHotkey("pauseHotkeyInput", "pauseHotkey");
    bindHotkey("stopHotkeyInput", "emergencyStopHotkey");
    return;
  }

  if (activeTab === "profiles") {
    const rows = appState.profiles
      .map(
        (profile) => `
        <div class="table-row ${profile.id === appState.activeProfileId ? "active" : ""}" data-select-profile="${profile.id}">
          <span>${profile.name}</span>
          <span>${profile.accentHexColor}</span>
          <span>${new Date(profile.updatedAt).toLocaleDateString()}</span>
        </div>
      `
      )
      .join("");

    root.innerHTML = `
      <div class="panel-grid">
        <article class="panel-card">
          <h4>Profile Table</h4>
          <div class="table">
            <div class="table-row">
              <span>Name</span>
              <span>Accent</span>
              <span>Updated</span>
            </div>
            ${rows}
          </div>
        </article>
        <article class="panel-card">
          <h4>Import / Export</h4>
          <div class="inline-actions">
            <button id="importProfileBtn" class="ghost-btn">Import .cfprofile</button>
            <button id="exportProfileBtn" class="ghost-btn">Export .cfprofile</button>
          </div>
          <div class="inline-actions">
            <button id="importPackBtn" class="ghost-btn">Import .cfpack</button>
            <button id="exportPackBtn" class="ghost-btn">Export .cfpack</button>
          </div>
          <p class="status-note">Profile files are JSON-compatible and keep parity with the Swift schema.</p>
        </article>
      </div>
    `;

    root.querySelectorAll("[data-select-profile]").forEach((row) => {
      row.addEventListener("click", async () => {
        appState.activeProfileId = row.getAttribute("data-select-profile");
        renderAll();
        await persistState();
      });
    });

    document.getElementById("importProfileBtn").addEventListener("click", onImportProfile);
    document.getElementById("exportProfileBtn").addEventListener("click", onExportProfile);
    document.getElementById("importPackBtn").addEventListener("click", onImportPack);
    document.getElementById("exportPackBtn").addEventListener("click", onExportPack);
    return;
  }

  if (activeTab === "settings") {
    root.innerHTML = `
      <div class="panel-grid">
        <article class="panel-card">
          <h4>Appearance</h4>
          <div class="field">
            <label>Profile Name</label>
            <input id="profileNameInput" type="text" value="${profile.name}" />
          </div>
          <div class="field">
            <label>Accent Hex</label>
            <input id="accentInput" type="text" value="${profile.accentHexColor}" />
          </div>
          <p class="status-note">Accent value is stored per profile and used as a visual identity token for later theming work.</p>
        </article>
        <article class="panel-card">
          <h4>Permission Dashboard</h4>
          <p class="status-note">Use the right inspector column for live permission statuses and quick links to macOS privacy panes.</p>
          <div class="inline-actions">
            <button id="refreshPermissionsBtn" class="ghost-btn">Refresh Permissions</button>
          </div>
        </article>
      </div>
    `;

    document.getElementById("profileNameInput").addEventListener("change", async (event) => {
      updateActiveProfile((p) => {
        p.name = event.target.value.trim() || "Unnamed Profile";
      });
      renderProfileList();
      renderHeader();
      await persistState();
    });

    document.getElementById("accentInput").addEventListener("change", async (event) => {
      updateActiveProfile((p) => {
        p.accentHexColor = event.target.value.trim() || "#00FF88";
      });
      await persistState();
    });

    document.getElementById("refreshPermissionsBtn").addEventListener("click", refreshPermissions);
  }
}

function renderAll() {
  renderProfileList();
  renderTabNav();
  renderHeader();
  renderMetrics();
  renderPanel();
  renderPermissions();
}

async function onStart() {
  const profile = activeProfile();
  if (!profile) return;
  runtimeSnapshot = await api.startRuntime(profile);
  setNotice(`Started profile "${profile.name}".`);
  renderAll();
}

async function onPauseResume() {
  runtimeSnapshot = await api.pauseResumeRuntime();
  setNotice(`Runtime switched to "${runtimeSnapshot.state}".`);
  renderAll();
}

async function onStop() {
  runtimeSnapshot = await api.stopRuntime();
  setNotice("Runtime stopped.");
  renderAll();
}

async function onNewProfile() {
  const next = createDefaultProfile(`Profile ${appState.profiles.length + 1}`);
  appState.profiles.push(next);
  appState.activeProfileId = next.id;
  await persistState();
  renderAll();
}

async function onDuplicateProfile() {
  const profile = activeProfile();
  if (!profile) return;
  const clone = typeof structuredClone === "function" ? structuredClone(profile) : JSON.parse(JSON.stringify(profile));
  clone.id = generateID();
  clone.name = `${profile.name} Copy`;
  clone.createdAt = new Date().toISOString();
  clone.updatedAt = clone.createdAt;
  appState.profiles.push(clone);
  appState.activeProfileId = clone.id;
  await persistState();
  renderAll();
}

async function onDeleteProfile() {
  if (appState.profiles.length <= 1) {
    setNotice("At least one profile is required.");
    return;
  }

  const removeId = appState.activeProfileId;
  appState.profiles = appState.profiles.filter((profile) => profile.id !== removeId);
  appState.activeProfileId = appState.profiles[0].id;
  await persistState();
  setNotice("Deleted active profile.");
  renderAll();
}

async function onImportProfile() {
  const response = await api.importProfile();
  if (response.canceled) return;

  const imported = response.profile;
  imported.id = generateID();
  imported.updatedAt = new Date().toISOString();
  imported.createdAt = imported.createdAt || imported.updatedAt;
  appState.profiles.push(imported);
  appState.activeProfileId = imported.id;
  await persistState();
  setNotice(`Imported profile from ${response.filePath.split("/").pop()}.`);
  renderAll();
}

async function onExportProfile() {
  const profile = activeProfile();
  if (!profile) return;
  const response = await api.exportProfile(profile);
  if (response.canceled) return;
  setNotice(`Exported profile to ${response.filePath.split("/").pop()}.`);
}

async function onImportPack() {
  const response = await api.importProfilePack();
  if (response.canceled) return;

  const imported = response.profiles.map((profile) => ({
    ...profile,
    id: generateID(),
    createdAt: profile.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }));

  appState.profiles.push(...imported);
  if (imported.length > 0) {
    appState.activeProfileId = imported[0].id;
  }
  await persistState();
  setNotice(`Imported ${imported.length} profiles from pack.`);
  renderAll();
}

async function onExportPack() {
  const response = await api.exportProfilePack(appState.profiles);
  if (response.canceled) return;
  setNotice(`Exported profile pack to ${response.filePath.split("/").pop()}.`);
}

function bindStaticActions() {
  document.getElementById("startBtn").addEventListener("click", onStart);
  document.getElementById("pauseBtn").addEventListener("click", onPauseResume);
  document.getElementById("stopBtn").addEventListener("click", onStop);
  document.getElementById("newProfileBtn").addEventListener("click", onNewProfile);
  document.getElementById("duplicateProfileBtn").addEventListener("click", onDuplicateProfile);
  document.getElementById("deleteProfileBtn").addEventListener("click", onDeleteProfile);
}

async function init() {
  appState = hydrateState(await api.loadState());
  runtimeSnapshot = await api.getRuntimeSnapshot();
  permissionState = await api.getPermissionStatus();
  bindStaticActions();

  api.onRuntimeUpdate((snapshot) => {
    runtimeSnapshot = snapshot;
    renderHeader();
    renderMetrics();
  });

  api.onRuntimeNotice(({ message }) => {
    setNotice(message);
  });

  api.onRuntimeShortcut(({ action, hotkey }) => {
    setNotice(`Shortcut ${hotkey} triggered ${action}.`);
  });

  renderAll();
}

init();
