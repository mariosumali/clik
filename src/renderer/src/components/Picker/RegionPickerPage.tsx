import { useEffect, useRef, useState } from 'react';

interface DragState {
  originClientX: number;
  originClientY: number;
  currentClientX: number;
  currentClientY: number;
}

// Overlay that lets the user drag a rectangle and reports the rect in macOS
// screen points. `window.screenX/Y` are the overlay window's origin in screen
// space, so (clientX + screenX, clientY + screenY) is the cursor in global points.
export function RegionPickerPage() {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const committedRef = useRef(false);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      setHover({ x: e.clientX, y: e.clientY });
      setDrag((d) =>
        d
          ? { ...d, currentClientX: e.clientX, currentClientY: e.clientY }
          : d,
      );
    };
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      setDrag({
        originClientX: e.clientX,
        originClientY: e.clientY,
        currentClientX: e.clientX,
        currentClientY: e.clientY,
      });
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      setDrag((d) => {
        if (!d || committedRef.current) return null;
        const x0 = Math.min(d.originClientX, e.clientX);
        const y0 = Math.min(d.originClientY, e.clientY);
        const x1 = Math.max(d.originClientX, e.clientX);
        const y1 = Math.max(d.originClientY, e.clientY);
        const w = x1 - x0;
        const h = y1 - y0;
        if (w < 4 || h < 4) return null; // too small, ignore
        committedRef.current = true;
        const rect = {
          x: Math.round(window.screenX + x0),
          y: Math.round(window.screenY + y0),
          w: Math.round(w),
          h: Math.round(h),
        };
        void window.clik.regionPickerPick(rect);
        return null;
      });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        void window.clik.regionPickerCancel();
      }
    };
    const onContext = (e: MouseEvent) => {
      e.preventDefault();
      void window.clik.regionPickerCancel();
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('contextmenu', onContext);
    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('contextmenu', onContext);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const box = drag
    ? {
        x: Math.min(drag.originClientX, drag.currentClientX),
        y: Math.min(drag.originClientY, drag.currentClientY),
        w: Math.abs(drag.currentClientX - drag.originClientX),
        h: Math.abs(drag.currentClientY - drag.originClientY),
      }
    : null;

  const screenBox = box
    ? {
        x: Math.round(window.screenX + box.x),
        y: Math.round(window.screenY + box.y),
        w: Math.round(box.w),
        h: Math.round(box.h),
      }
    : null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        cursor: 'crosshair',
        background: 'rgba(11, 11, 11, 0.38)',
        color: 'var(--color-cream)',
        userSelect: 'none',
        overflow: 'hidden',
      }}
    >
      {hover && !drag && (
        <>
          <div style={crossStyle.horiz(hover.y)} />
          <div style={crossStyle.vert(hover.x)} />
        </>
      )}

      {box && (
        <div
          style={{
            position: 'absolute',
            left: box.x,
            top: box.y,
            width: box.w,
            height: box.h,
            border: '1px solid var(--color-accent)',
            background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
            pointerEvents: 'none',
          }}
        />
      )}

      {screenBox && (
        <div
          style={{
            position: 'absolute',
            left: Math.max(8, box!.x),
            top: Math.max(8, box!.y + box!.h + 10),
            padding: '6px 10px',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            letterSpacing: '0.08em',
            background: 'rgba(11, 11, 11, 0.9)',
            border: '1px solid var(--color-line)',
            color: 'var(--color-cream)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {screenBox.w} × {screenBox.h} · origin {screenBox.x}, {screenBox.y}
        </div>
      )}

      <div
        style={{
          position: 'absolute',
          top: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '10px 18px',
          background: 'rgba(11, 11, 11, 0.85)',
          border: '1px solid var(--color-line)',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--color-cream)',
          pointerEvents: 'none',
        }}
      >
        drag a region · esc to cancel
      </div>
    </div>
  );
}

const crossStyle = {
  horiz: (y: number): React.CSSProperties => ({
    position: 'absolute',
    left: 0,
    right: 0,
    top: y,
    height: 1,
    background: 'rgba(239, 234, 221, 0.45)',
    pointerEvents: 'none',
  }),
  vert: (x: number): React.CSSProperties => ({
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: x,
    width: 1,
    background: 'rgba(239, 234, 221, 0.45)',
    pointerEvents: 'none',
  }),
};
