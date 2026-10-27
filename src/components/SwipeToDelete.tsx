import { useRef, useState } from 'react';
import type { PointerEvent, ReactNode } from 'react';

// Past this many pixels a drag counts as a swipe, not a tap
const DRAG_START_PX = 8;
// Release beyond this share of the row width (or this many px) to delete
const DELETE_AT_FRACTION = 0.35;
const DELETE_AT_MAX_PX = 140;

// Swipe the row to the right to delete it. Vertical movement is left to the
// browser (touch-action: pan-y), so scrolling the list still works normally.
export default function SwipeToDelete({
  onDelete,
  children,
}: {
  onDelete: () => void;
  children: ReactNode;
}) {
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const didDrag = useRef(false);
  const rowRef = useRef<HTMLDivElement>(null);

  function threshold() {
    const width = rowRef.current?.offsetWidth ?? 300;
    return Math.min(width * DELETE_AT_FRACTION, DELETE_AT_MAX_PX);
  }

  function onPointerDown(e: PointerEvent) {
    if (leaving) return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    didDrag.current = false;
  }

  function onPointerMove(e: PointerEvent) {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const moveX = e.clientX - s.x;
    const moveY = e.clientY - s.y;
    if (!didDrag.current) {
      // Mostly vertical: it's a scroll, let it go
      if (Math.abs(moveY) > DRAG_START_PX && Math.abs(moveY) > Math.abs(moveX)) {
        start.current = null;
        return;
      }
      if (moveX < DRAG_START_PX) return;
      didDrag.current = true;
      setDragging(true);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    setDx(Math.max(0, moveX));
  }

  function onPointerEnd() {
    if (!start.current && !didDrag.current) return;
    start.current = null;
    setDragging(false);
    if (!didDrag.current) return;
    if (dx >= threshold()) {
      // Slide fully out, then remove
      setLeaving(true);
      setDx(rowRef.current?.offsetWidth ?? 400);
      window.setTimeout(onDelete, 180);
    } else {
      setDx(0);
    }
  }

  const armed = dx >= threshold();

  return (
    <div className="swipe-wrap" ref={rowRef}>
      <div className={`swipe-bg${armed ? ' armed' : ''}`} style={{ opacity: dx > 0 ? 1 : 0 }}>
        🗑️ Verwijderen
      </div>
      <div
        className="swipe-content"
        style={{
          transform: `translateX(${dx}px)`,
          transition: dragging ? 'none' : 'transform 0.18s ease-out',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        // A swipe shouldn't also tick the checkbox or send a heart
        onClickCapture={(e) => {
          if (didDrag.current) {
            e.stopPropagation();
            e.preventDefault();
            didDrag.current = false;
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
