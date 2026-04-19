import './styles.css';
import { createRoot } from 'react-dom/client';
import { StrictMode } from 'react';
import { App } from './App';
import { PickerPage } from './components/Picker/PickerPage';
import { RegionPickerPage } from './components/Picker/RegionPickerPage';
import { PopoverApp } from './PopoverApp';

const root = createRoot(document.getElementById('root')!);

// The URL hash is the most reliable mode signal — BrowserWindow.loadFile/loadURL sets it
// directly per-window, whereas webPreferences.additionalArguments is fragile across
// packaging modes.  window.clik.mode is kept as a fallback.
const hash = window.location.hash;
const mode =
  hash === '#picker' || window.clik?.mode === 'picker'
    ? 'picker'
    : hash === '#region-picker' || window.clik?.mode === 'region-picker'
      ? 'region-picker'
      : hash === '#popover' || window.clik?.mode === 'popover'
        ? 'popover'
        : 'full';

if (mode === 'picker' || mode === 'region-picker') {
  // Picker windows are transparent overlays — the global body paint from styles.css
  // would otherwise cover the entire screen with an opaque ink colour.
  document.documentElement.style.background = 'transparent';
  document.body.style.background = 'transparent';
}

root.render(
  <StrictMode>
    {mode === 'picker' ? (
      <PickerPage />
    ) : mode === 'region-picker' ? (
      <RegionPickerPage />
    ) : mode === 'popover' ? (
      <PopoverApp />
    ) : (
      <App />
    )}
  </StrictMode>,
);
