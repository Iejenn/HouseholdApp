import type { DayKey } from '../types';

export const DAY_KEYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const DAY_NAMES: Record<DayKey, string> = {
  mon: 'Maandag',
  tue: 'Dinsdag',
  wed: 'Woensdag',
  thu: 'Donderdag',
  fri: 'Vrijdag',
  sat: 'Zaterdag',
  sun: 'Zondag',
};

const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

// Monday 00:00 (local time) of the week that contains `date`
export function mondayOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// ISO week number: the week belongs to the year its Thursday falls in, so
// e.g. Mon 29 Dec 2025 is in 2026-KW01. Doc ids look like "2026-KW45".
export function weekId(date: Date): string {
  const thursday = addDays(mondayOf(date), 3);
  const year = thursday.getFullYear();
  const jan4 = new Date(year, 0, 4); // always in week 1
  const week = 1 + Math.round((thursday.getTime() - addDays(mondayOf(jan4), 3).getTime()) / (7 * 86_400_000));
  return `${year}-KW${String(week).padStart(2, '0')}`;
}

// "3 – 9 nov" or "29 dec – 4 jan"
export function weekRangeLabel(monday: Date): string {
  const sunday = addDays(monday, 6);
  const start =
    monday.getMonth() === sunday.getMonth() ? `${monday.getDate()}` : `${monday.getDate()} ${MONTHS[monday.getMonth()]}`;
  return `${start} – ${sunday.getDate()} ${MONTHS[sunday.getMonth()]}`;
}

export function shortDate(date: Date): string {
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}
