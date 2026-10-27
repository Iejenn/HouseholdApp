import { useEffect, useRef, useState } from 'react';

// How long the "Ongedaan maken" bar stays before a swiped item is really deleted
const UNDO_MS = 4000;

// Swipe-to-delete with a short undo window: the item is hidden right away,
// but only deleted from the database once the undo bar is gone
export function useUndoableDelete<T extends { id: string }>(commit: (item: T) => void) {
  const [pending, setPending] = useState<T | null>(null);
  const pendingRef = useRef<T | null>(null);
  const timer = useRef<number | null>(null);
  const commitRef = useRef(commit);
  commitRef.current = commit;

  function flush() {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    if (pendingRef.current) commitRef.current(pendingRef.current);
    pendingRef.current = null;
  }

  function remove(item: T) {
    flush(); // a second swipe finalises the previous one right away
    pendingRef.current = item;
    setPending(item);
    timer.current = window.setTimeout(() => {
      flush();
      setPending(null);
    }, UNDO_MS);
  }

  function undo() {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    pendingRef.current = null;
    setPending(null);
  }

  // Switching tabs mid-undo still deletes the item
  useEffect(() => flush, []);

  return { pending, remove, undo };
}
