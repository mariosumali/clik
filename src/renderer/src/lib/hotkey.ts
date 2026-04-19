// Electron accelerator helpers. Keep the accelerator string canonical so we can safely
// round-trip through the main process' globalShortcut.register.

const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);

// Map DOM KeyboardEvent.code / .key to Electron accelerator tokens.
// Reference: https://www.electronjs.org/docs/latest/api/accelerator
function mainKeyToken(e: KeyboardEvent): string | null {
  const code = e.code;
  const key = e.key;

  // Modifier-only key presses — we skip them; they're captured via the modifier flags.
  const modifiers = new Set([
    'ShiftLeft', 'ShiftRight',
    'ControlLeft', 'ControlRight',
    'AltLeft', 'AltRight',
    'MetaLeft', 'MetaRight',
    'CapsLock', 'Fn', 'FnLock', 'ContextMenu',
  ]);
  if (modifiers.has(code)) return null;

  // Function keys.
  const fnMatch = /^F(\d{1,2})$/.exec(code);
  if (fnMatch) return `F${fnMatch[1]}`;

  // Letters / digits by code (keeps label even when a modifier remaps it).
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1];
  const digit = /^Digit([0-9])$/.exec(code);
  if (digit) return digit[1];
  const numpad = /^Numpad([0-9])$/.exec(code);
  if (numpad) return `num${numpad[1]}`;

  switch (code) {
    case 'Space': return 'Space';
    case 'Enter': case 'NumpadEnter': return 'Return';
    case 'Escape': return 'Escape';
    case 'Backspace': return 'Backspace';
    case 'Delete': return 'Delete';
    case 'Tab': return 'Tab';
    case 'ArrowUp': return 'Up';
    case 'ArrowDown': return 'Down';
    case 'ArrowLeft': return 'Left';
    case 'ArrowRight': return 'Right';
    case 'Home': return 'Home';
    case 'End': return 'End';
    case 'PageUp': return 'PageUp';
    case 'PageDown': return 'PageDown';
    case 'Minus': return '-';
    case 'Equal': return '=';
    case 'BracketLeft': return '[';
    case 'BracketRight': return ']';
    case 'Backslash': return '\\';
    case 'Semicolon': return ';';
    case 'Quote': return '\'';
    case 'Comma': return ',';
    case 'Period': return '.';
    case 'Slash': return '/';
    case 'Backquote': return '`';
    default:
      return key.length === 1 ? key.toUpperCase() : null;
  }
}

export function acceleratorFromEvent(e: KeyboardEvent): string | null {
  const main = mainKeyToken(e);
  if (!main) return null;
  const parts: string[] = [];
  if (e.metaKey) parts.push('CommandOrControl');
  else if (e.ctrlKey) parts.push('Control');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  parts.push(main);
  return parts.join('+');
}

const symbolMap: Record<string, string> = {
  CommandOrControl: isMac ? '⌘' : 'Ctrl',
  Command: '⌘',
  Cmd: '⌘',
  Control: isMac ? '⌃' : 'Ctrl',
  Ctrl: isMac ? '⌃' : 'Ctrl',
  Alt: isMac ? '⌥' : 'Alt',
  Option: '⌥',
  Shift: isMac ? '⇧' : 'Shift',
  Return: isMac ? '↩' : 'Enter',
  Escape: 'Esc',
  Backspace: '⌫',
  Delete: isMac ? '⌦' : 'Del',
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
  Space: 'Space',
  Tab: '⇥',
};

export function formatAccelerator(accel: string): string {
  if (!accel) return '—';
  const parts = accel.split('+');
  const modifiers = parts.slice(0, -1).map((p) => symbolMap[p] ?? p);
  const key = symbolMap[parts[parts.length - 1]] ?? parts[parts.length - 1];
  const sep = isMac ? '' : '+';
  return modifiers.join(sep) + (isMac ? '' : modifiers.length ? '+' : '') + key;
}

export function isValidAccelerator(accel: string): boolean {
  if (!accel) return false;
  const parts = accel.split('+');
  if (parts.length < 1) return false;
  // Require at least one modifier when the key is a single character — otherwise the
  // hotkey would steal normal typing across the OS.
  const key = parts[parts.length - 1];
  const hasModifier = parts.length > 1;
  if (key.length === 1 && !hasModifier) return false;
  return true;
}
