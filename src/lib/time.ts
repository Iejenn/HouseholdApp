import type { Recurrence, Task } from '../types';
import { t } from '../i18n/core';

// Checked-off tasks and groceries disappear from the lists after this long
export const HIDE_DONE_AFTER_MS = 72 * 60 * 60 * 1000;

export function startOfDay(ms: number): Date {
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

export function calendarDaysBetween(from: number, to: number): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);
}

// "vandaag", "gisteren", "3 dagen geleden", "2 weken geleden", …
export function formatAgo(ms: number, now: number): string {
  const days = calendarDaysBetween(ms, now);
  if (days <= 0) return t('vandaag');
  if (days === 1) return t('gisteren');
  if (days < 14) return t('{n} dagen geleden', { n: days });
  if (days < 60) return t('{n} weken geleden', { n: Math.floor(days / 7) });
  const months = Math.floor(days / 30);
  return months === 1 ? t('1 maand geleden') : t('{n} maanden geleden', { n: months });
}

// Late = a whole extra period went by after it was due again. A daily task
// done yesterday is simply due today; done 3 days ago it turns red.
// One-off tasks with a deadline are late once that day is over.
export function isTaskLate(task: Task, now: number): boolean {
  if (!task.isRecurring) {
    return !task.completedAt && task.dueAt != null && calendarDaysBetween(task.dueAt, now) > 0;
  }
  if (!task.recurrence || !task.completedAt) return false;
  const due = nextDueAt(task.completedAt, task.recurrence);
  return now >= nextDueAt(due, task.recurrence);
}

const SHORT_WEEKDAYS = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
const SHORT_MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

// Text for a one-off task's deadline: "uiterlijk za 8 nov", "vandaag",
// "morgen" or "2 dagen over tijd". Tone tells the list which colour to use.
export function formatDeadline(dueAt: number, now: number): { text: string; tone: 'late' | 'today' | 'soon' } {
  const days = calendarDaysBetween(now, dueAt);
  if (days < 0) return { text: days === -1 ? t('1 dag over tijd') : t('{n} dagen over tijd', { n: -days }), tone: 'late' };
  if (days === 0) return { text: t('moet vandaag'), tone: 'today' };
  if (days === 1) return { text: t('uiterlijk morgen'), tone: 'soon' };
  const d = new Date(dueAt);
  // Short names are translated where shown (t('di') → "Tue")
  return {
    text: t('uiterlijk {date}', { date: `${t(SHORT_WEEKDAYS[d.getDay()])} ${d.getDate()} ${t(SHORT_MONTHS[d.getMonth()])}` }),
    tone: 'soon',
  };
}

// Sort helper: tasks with a deadline before those without, earliest first
export function byDeadline(a: Task, b: Task): number {
  return (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) || 0;
}
