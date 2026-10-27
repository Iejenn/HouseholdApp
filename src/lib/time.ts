import type { Recurrence, Task } from '../types';

// Checked-off tasks and groceries disappear from the lists after this long
export const HIDE_DONE_AFTER_MS = 72 * 60 * 60 * 1000;

function startOfDay(ms: number): Date {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d;
}

// When a recurring task opens up again: counted from the start of the day it
// was done, so a daily task done at 22:00 is back the next morning
export function nextDueAt(completedAt: number, r: Recurrence): number {
  const d = startOfDay(completedAt);
  if (r.unit === 'day') d.setDate(d.getDate() + r.interval);
  else if (r.unit === 'week') d.setDate(d.getDate() + 7 * r.interval);
  else d.setMonth(d.getMonth() + r.interval);
  return d.getTime();
}

// A recurring task counts as open again once its next due moment has passed —
// computed on the fly, so no background job is needed to "reopen" it
export function isTaskDone(task: Task, now: number): boolean {
  if (!task.completedAt) return false;
  if (task.isRecurring && task.recurrence) {
    return now < nextDueAt(task.completedAt, task.recurrence);
  }
  return true;
}

export function isHiddenDone(doneAt: number | null, now: number): boolean {
  return doneAt !== null && now - doneAt > HIDE_DONE_AFTER_MS;
}
