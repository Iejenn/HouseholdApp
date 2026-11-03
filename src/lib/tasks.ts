import { collection, doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { isTaskDone } from './time';
import type { Completion, Task } from '../types';

// Every check-off earns the household this many cat points
export const POINTS_PER_TASK = 1;

// Checks a task off (or un-checks it). Shared by the task list and the
// home screen. Returns true when it was checked off (so a +1 can be shown).
export async function toggleTaskDone(householdId: string, uid: string, task: Task): Promise<boolean> {
  const ref = doc(db, 'households', householdId, 'tasks', task.id);
  const completionsCol = collection(db, 'households', householdId, 'completions');
  // Task update and point record are written together, so you can't get
  // a point without the task actually being checked off (and vice versa)
  const batch = writeBatch(db);
  if (isTaskDone(task, Date.now())) {
    // Unchecking: put back the check-off before this one (keeps "laatst gedaan")
    batch.update(ref, {
      completedAt: task.previousCompletedAt ?? null,
      completedBy: task.previousCompletedBy ?? null,
      previousCompletedAt: null,
      previousCompletedBy: null,
    });
    // ...and take the point back
    batch.delete(doc(completionsCol, `${task.id}_${task.completedAt}`));
    await batch.commit();
    return false;
  }
  // Also used when a recurring task comes back: the old completion stays,
  // so every round earns a point
  const completedAt = Date.now();
  batch.update(ref, {
    completedAt,
    completedBy: uid,
    previousCompletedAt: task.completedAt ?? null,
    previousCompletedBy: task.completedBy ?? null,
    hearts: [],
  });
  const completion: Completion = { taskId: task.id, uid, points: POINTS_PER_TASK, completedAt };
  batch.set(doc(completionsCol, `${task.id}_${completedAt}`), completion);
  await batch.commit();
  return true;
}
