import { useEffect, useState } from 'react';

export function PickerPage() {
  const [pos, setPos] = useState<{ x: number; y: number; sx: number; sy: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      // clientX/Y is relative to the overlay window; offset by the window's screen origin
      // to show what screen.getCursorScreenPoint() will return on click.
      setPos({
        x: e.clientX,
        y: e.clientY,
        sx: Math.round(window.screenX + e.clientX),
        sy: Math.round(window.screenY + e.clientY),
      });
    };
    const onClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      void window.clik.pickerPick();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        void window.clik.pickerCancel();
      }
    };
    const onContext = (e: MouseEvent) => {
      // Right-click also cancels so the user is never stuck in the picker.
      e.preventDefault();
      void window.clik.pickerCancel();
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mousedown', onClick);
    window.addEventListener('contextmenu', onContext);
    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('contextmenu', onContext);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        cursor: 'crosshair',
        background: 'rgba(11, 11, 11, 0.32)',
        color: 'var(--color-cream)',
        userSelect: 'none',
        overflow: 'hidden',
      }}
    >
      {pos && (
        <>
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: pos.y,
              height: 1,
              background: 'rgba(239, 234, 221, 0.55)',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: pos.x,
              width: 1,
              background: 'rgba(239, 234, 221, 0.55)',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: pos.x + 16,
              top: pos.y + 16,
              padding: '6px 10px',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              letterSpacing: '0.08em',
              background: 'rgba(11, 11, 11, 0.82)',
              border: '1px solid var(--color-line)',
              color: 'var(--color-cream)',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            x {pos.sx}&nbsp;&nbsp;y {pos.sy}
          </div>
        </>
      )}

      <div
        style={{
          position: 'absolute',
          top: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '10px 18px',
          background: 'rgba(11, 11, 11, 0.82)',
          border: '1px solid var(--color-line)',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--color-cream)',
          pointerEvents: 'none',
        }}
      >
        click to set · esc to cancel
      </div>
    </div>
  );
}
