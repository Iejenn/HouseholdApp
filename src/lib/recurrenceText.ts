import type { Recurrence } from '../types';
import { currentLang, t } from '../i18n/core';
import { DAY_KEYS, dayNameInSentence } from './week';
import { hasFixedDays } from './schedule';

// How a repeat schedule reads in the task list and the task form:
// "elke week", "elke maandag en donderdag", "elke 2e dinsdag van de maand"

// "1e" / "1st", "2e" / "2nd", …
export function ordinal(n: number): string {
  if (currentLang() !== 'en') return `${n}e`;
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
  return `${n}${suffix}`;
}

// 0 = Monday … 6 = Sunday, as used in Recurrence.weekdays
export function weekdayName(i: number): string {
  return dayNameInSentence(DAY_KEYS[i]);
}

// "maandag", "maandag en donderdag", "maandag, woensdag en vrijdag"
function joinNames(names: string[]): string {
  if (names.length < 2) return names.join('');
  return t('{list} en {last}', { list: names.slice(0, -1).join(', '), last: names[names.length - 1] });
}

export function formatRecurrence(r: Recurrence): string {
  const { unit, interval } = r;
  if (hasFixedDays(r)) {
    if (unit === 'week') {
      const days = joinNames([...(r.weekdays ?? [])].sort((a, b) => a - b).map(weekdayName));
      if (interval === 1) return t('elke {days}', { days });
      if (interval === 2) return t('om de week op {days}', { days });
      return t('elke {n} weken op {days}', { n: interval, days });
    }
    if (r.monthDay != null) {
      const day = r.monthDay === -1 ? t('de laatste dag') : t('de {nth}', { nth: ordinal(r.monthDay) });
      return interval === 1 ? t('elke maand op {day}', { day }) : t('elke {n} maanden op {day}', { n: interval, day });
    }
    const nth = r.monthWeek === -1 ? t('laatste') : ordinal(r.monthWeek ?? 1);
    const day = weekdayName(r.monthWeekday ?? 0);
    return interval === 1
      ? t('elke {nth} {day} van de maand', { nth, day })
      : t('elke {n} maanden op de {nth} {day}', { n: interval, nth, day });
  }
  if (interval === 1) return unit === 'day' ? t('elke dag') : unit === 'week' ? t('elke week') : t('elke maand');
  if (unit === 'week' && interval === 2) return t('om de week');
  if (unit === 'day') return t('elke {n} dagen', { n: interval });
  return unit === 'week' ? t('elke {n} weken', { n: interval }) : t('elke {n} maanden', { n: interval });
}
