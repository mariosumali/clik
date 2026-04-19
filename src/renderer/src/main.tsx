import './styles.css';
import { createRoot } from 'react-dom/client';
import { StrictMode } from 'react';
import { App } from './App';
import { PickerPage } from './components/Picker/PickerPage';

const root = createRoot(document.getElementById('root')!);

const isPicker = window.location.hash === '#picker' || window.clik?.mode === 'picker';

if (isPicker) {
  // The picker window is a transparent overlay — the global body paint from styles.css
  // would otherwise cover the entire screen with an opaque ink colour.
  document.documentElement.style.background = 'transparent';
  document.body.style.background = 'transparent';
}

root.render(
  <StrictMode>
    {isPicker ? <PickerPage /> : <App />}
  </StrictMode>,
);
