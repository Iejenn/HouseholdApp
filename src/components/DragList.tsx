import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';

// A list you can reorder by dragging a handle (⠿). Only the handle starts a
// drag, so scrolling and swipe-to-delete on the row keep working. No library:
// pointer events cover both touch and mouse.

export interface DragHandleProps {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
}

interface DragState {
  index: number;
  target: number;
  dy: number;
}

// Scroll the list when the finger is this close to its top/bottom edge
const EDGE_PX = 70;
const SCROLL_STEP = 9;

export default function DragList<T>({
  items,
  getKey,
  render,
  onMove,
}: {
  items: T[];
  getKey: (item: T) => string;
  render: (item: T, handle: DragHandleProps, dragging: boolean) => ReactNode;
  onMove: (from: number, to: number) => void;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const rows = useRef<(HTMLDivElement | null)[]>([]);
  // Measured when the drag starts, in the scroll container's own coordinates,
  // so auto-scrolling while dragging doesn't throw the positions off
  const geo = useRef<{ scroller: HTMLElement; startY: number; mids: number[]; height: number; clientY: number } | null>(
    null
  );
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;

  function update(clientY: number) {
    const g = geo.current;
    const d = dragRef.current;
    if (!g || !d) return;
    g.clientY = clientY;
    const dy = clientY + g.scroller.scrollTop - g.startY;
    const center = g.mids[d.index] + dy;
    // Passed the middle of a neighbour: that's the new spot
    let target = d.index;
    for (let i = d.index + 1; i < g.mids.length; i++) if (center > g.mids[i]) target = i;
    for (let i = d.index - 1; i >= 0; i--) if (center < g.mids[i]) target = i;
    setDrag({ index: d.index, target, dy });
  }

  // Keep scrolling while the finger rests near an edge
  useEffect(() => {
    if (!drag) return;
    let frame = 0;
    const tick = () => {
      const g = geo.current;
      if (g) {
        const box = g.scroller.getBoundingClientRect();
        const step = g.clientY < box.top + EDGE_PX ? -SCROLL_STEP : g.clientY > box.bottom - EDGE_PX ? SCROLL_STEP : 0;
        if (step) {
          const before = g.scroller.scrollTop;
          g.scroller.scrollTop += step;
          if (g.scroller.scrollTop !== before) update(g.clientY);
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [drag !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleFor(index: number): DragHandleProps {
    return {
      onPointerDown: (e) => {
        // Not a swipe or a scroll: this one is ours
        e.stopPropagation();
        e.preventDefault();
        const el = rows.current[index];
        const scroller = (el?.closest('.app-content') as HTMLElement | null) ?? document.documentElement;
        const base = scroller.getBoundingClientRect().top - scroller.scrollTop;
        const rects = rows.current.slice(0, items.length).map((r) => r!.getBoundingClientRect());
        geo.current = {
          scroller,
          startY: e.clientY + scroller.scrollTop,
          mids: rects.map((r) => r.top - base + r.height / 2),
          height: rects[index].height,
          clientY: e.clientY,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag({ index, target: index, dy: 0 });
      },
      onPointerMove: (e) => {
        if (dragRef.current) update(e.clientY);
      },
      onPointerUp: () => {
        const d = dragRef.current;
        if (d && d.target !== d.index) onMove(d.index, d.target);
        setDrag(null);
        geo.current = null;
      },
      onPointerCancel: () => {
        setDrag(null);
        geo.current = null;
      },
    };
  }

  const h = geo.current?.height ?? 0;
  return (
    <>
      {items.map((item, i) => {
        let shift = 0;
        if (drag && i !== drag.index) {
          // Neighbours slide out of the way to show where it will land
          if (drag.index < i && i <= drag.target) shift = -h;
          if (drag.target <= i && i < drag.index) shift = h;
        }
        const isDragged = drag?.index === i;
        return (
          <div
            key={getKey(item)}
            ref={(el) => {
              rows.current[i] = el;
            }}
            className={`drag-row${isDragged ? ' dragging' : ''}`}
            style={{
              transform: `translateY(${isDragged ? drag.dy : shift}px)`,
              transition: isDragged || !drag ? 'none' : 'transform 0.15s ease-out',
            }}
          >
            {render(item, handleFor(i), isDragged)}
          </div>
        );
      })}
    </>
  );
}
