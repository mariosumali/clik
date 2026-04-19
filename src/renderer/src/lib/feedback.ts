// Lightweight audio + notification helpers used by the preferences' feedback
// toggles. Kept framework-agnostic so they can be called from anywhere without
// React context.

let ctx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = ctx ?? new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

export function playBeep(variant: 'start' | 'stop'): void {
  const ac = audioContext();
  if (!ac) return;
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(variant === 'start' ? 880 : 440, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
  osc.connect(gain).connect(ac.destination);
  osc.start(now);
  osc.stop(now + 0.14);
}

export function showNotification(title: string, body: string): void {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, silent: true });
  } catch {
    // Ignore — notifications are best-effort feedback.
  }
}
