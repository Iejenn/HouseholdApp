// Fixed schedules for recurring tasks ("elke maandag", "de 1e van de maand",
// "de 2e dinsdag"). Tasks without a fixed day keep the old rhythm: counted
// from the last check-off (see nextDueAt in time.ts).
//
// Everything here works on day numbers (calendar days since 1970-01-01).
// Copy of src/lib/schedule.ts (the app): change both together. The server
// passes Dutch-time day numbers in, so only the day-number helpers differ.

const DAY_MS = 86_400_000;

// 0 = Monday … 6 = Sunday (day 0, 1 Jan 1970, was a Thursday)
export function weekdayOf(day) {
  return (((day + 3) % 7) + 7) % 7;
}

export function hasFixedDays(r) {
  if (!r) return false;
  if (r.unit === 'week') return !!r.weekdays && r.weekdays.length > 0;
  if (r.unit === 'month') return r.monthDay != null || (r.monthWeek != null && r.monthWeekday != null);
  return false;
}

function ymd(day) {
  const d = new Date(day * DAY_MS);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return { y, m, date: d.getUTCDate(), daysInMonth };
}

// Does the day fit the pattern, ignoring "om de week"/"elke 3 maanden"?
function fitsPattern(day, r) {
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
function searchSpan(r) {
  return r.unit === 'week' ? 7 * r.interval + 7 : 31 * r.interval + 62;
}

// The first matching day on or after the start: that week/month counts as
// "on" for every-other-week and every-N-months
function anchorDay(r) {
  const start = r.startDay ?? 0;
  for (let d = start; d < start + 62; d++) if (fitsPattern(d, r)) return d;
  return start;
}

function matches(day, r, anchor) {
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
export function lastOccurrence(day, r) {
  const anchor = anchorDay(r);
  for (let d = day; d >= Math.max(anchor, day - searchSpan(r)); d--) if (matches(d, r, anchor)) return d;
  return null;
}

// First scheduled day after `day`
export function nextOccurrence(day, r) {
  const anchor = anchorDay(r);
  const from = Math.max(day + 1, anchor);
  for (let d = from; d <= from + searchSpan(r); d++) if (matches(d, r, anchor)) return d;
  return null;
}

// Where a fixed-day task stands today (day numbers in Dutch time):
// waiting = its first day hasn't come yet (since null), open = due since `since`
export function fixedState(completedDay, r, today) {
  const since = lastOccurrence(today, r);
  if (since === null) return { open: false, since: null };
  return { open: completedDay == null || completedDay < since, since };
}
