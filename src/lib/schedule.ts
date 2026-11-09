import type { Recurrence } from '../types';

// Fixed schedules for recurring tasks ("elke maandag", "de 1e van de maand",
// "de 2e dinsdag"). Tasks without a fixed day keep the old rhythm: counted
// from the last check-off (see nextDueAt in time.ts).
//
// Everything here works on day numbers (calendar days since 1970-01-01) so
// daylight saving time can't shift a day. The server has a copy of this
// logic in functions/schedule.js: change both together.

const DAY_MS = 86_400_000;

// Local calendar date of a moment, as a day number
export function dayNumber(ms: number): number {
  const d = new Date(ms);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
}

// Start of that day in local time (back to a normal timestamp)
export function dayStartMs(day: number): number {
  const d = new Date(day * DAY_MS);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).getTime();
}

// 0 = Monday … 6 = Sunday (day 0, 1 Jan 1970, was a Thursday)
export function weekdayOf(day: number): number {
  return (((day + 3) % 7) + 7) % 7;
}

export function hasFixedDays(r: Recurrence | null | undefined): r is Recurrence {
  if (!r) return false;
  if (r.unit === 'week') return !!r.weekdays && r.weekdays.length > 0;
  if (r.unit === 'month') return r.monthDay != null || (r.monthWeek != null && r.monthWeekday != null);
  return false;
}

function ymd(day: number) {
  const d = new Date(day * DAY_MS);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return { y, m, date: d.getUTCDate(), daysInMonth };
}

// Does the day fit the pattern, ignoring "om de week"/"elke 3 maanden"?
function fitsPattern(day: number, r: Recurrence): boolean {
  if (r.unit === 'week') return (r.weekdays ?? []).includes(weekdayOf(day));
  const { date, daysInMonth } = ymd(day);
  if (r.monthDay != null) {
    // 31st in a short month (or -1 = "last day"): the last day of that month
    const target = r.monthDay === -1 ? daysInMonth : Math.min(r.monthDay, daysInMonth);
    return date === target;
  }
  if (weekdayOf(day) !== r.monthWeekday) return false;
  return r.monthWeek === -1 ? date + 7 > daysInMonth : Math.ceil(date / 7) === r.monthWeek;
}

// How far to look back/ahead for the next match (a full cycle plus a bit)
function searchSpan(r: Recurrence): number {
  return r.unit === 'week' ? 7 * r.interval + 7 : 31 * r.interval + 62;
}

// The first matching day on or after the start: that week/month counts as
// "on" for every-other-week and every-N-months
function anchorDay(r: Recurrence): number {
  const start = r.startDay ?? 0;
  for (let d = start; d < start + 62; d++) if (fitsPattern(d, r)) return d;
  return start;
}

function matches(day: number, r: Recurrence, anchor: number): boolean {
  if (day < anchor || !fitsPattern(day, r)) return false;
  if (r.interval <= 1) return true;
  if (r.unit === 'week') {
    const weeks = Math.floor((day - weekdayOf(day) - (anchor - weekdayOf(anchor))) / 7);
    return weeks % r.interval === 0;
  }
  const a = ymd(anchor);
  const b = ymd(day);
  return (b.y * 12 + b.m - (a.y * 12 + a.m)) % r.interval === 0;
}

// Most recent scheduled day on or before `day` (null = not started yet)
export function lastOccurrence(day: number, r: Recurrence): number | null {
  const anchor = anchorDay(r);
  for (let d = day; d >= Math.max(anchor, day - searchSpan(r)); d--) if (matches(d, r, anchor)) return d;
  return null;
}

// First scheduled day after `day`
export function nextOccurrence(day: number, r: Recurrence): number | null {
  const anchor = anchorDay(r);
  const from = Math.max(day + 1, anchor);
  for (let d = from; d <= from + searchSpan(r); d++) if (matches(d, r, anchor)) return d;
  return null;
}

// Where a fixed-day task stands today:
// waiting = its first day hasn't come yet, open = due since `since`
export function fixedState(
  completedAt: number | null,
  r: Recurrence,
  now: number
): { open: boolean; since: number | null } {
  const since = lastOccurrence(dayNumber(now), r);
  if (since === null) return { open: false, since: null };
  const done = completedAt != null && dayNumber(completedAt) >= since;
  return { open: !done, since };
}
