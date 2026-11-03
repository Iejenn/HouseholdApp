import { useEffect, useRef, useState } from 'react';
import { toggleTaskDone } from '../lib/tasks';
import { isTaskDone } from '../lib/time';
import type { Task } from '../types';

const UNDO_MS = 5000;

// "✓ Stofzuigen afgevinkt — Ongedaan maken": after a check-off, a short
// window to take a mis-tap back (also restores "laatst gedaan" and the point)
export function useUndoCheck(tasks: Task[], householdId: string, uid: string | undefined) {
  const [taskId, setTaskId] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  function clear() {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  }

  // Call right after checking a task off
  function checked(task: Task) {
    clear();
    setTaskId(task.id);
    timer.current = window.setTimeout(() => setTaskId(null), UNDO_MS);
  }

  async function undo() {
    clear();
    setTaskId(null);
    // Use the latest version from the database, which already has the check-off
    const task = tasks.find((t) => t.id === taskId);
    if (task && uid && isTaskDone(task, Date.now())) await toggleTaskDone(householdId, uid, task);
  }

  useEffect(() => clear, []);

  return { pending: tasks.find((t) => t.id === taskId) ?? null, checked, undo };
}
