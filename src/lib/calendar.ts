import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../firebaseConfig';
import type { CalendarEvent } from '../types';

// Everything with tokens happens in the Cloud Functions (functions/calendar.js);
// the app only starts/finishes the link and asks for events.
const fns = () => getFunctions(app, 'europe-west1');

// Sends the browser to Google's sign-in, which comes back to the app with ?code=…
export async function startCalendarLink(): Promise<void> {
  const res = await httpsCallable<void, { url: string }>(fns(), 'calendarAuthStart')();
  window.location.assign(res.data.url);
}

// Called when the app opens with ?code=…&state=… from Google
export async function finishCalendarLink(code: string, state: string): Promise<{ email: string; count: number }> {
  const res = await httpsCallable<{ code: string; state: string }, { email: string; count: number }>(
    fns(),
    'calendarAuthFinish'
  )({ code, state });
  return res.data;
}

export async function unlinkCalendar(): Promise<void> {
  await httpsCallable(fns(), 'calendarUnlink')();
  forgetCachedEvents();
}

const CACHE_KEY = 'calendarEvents';
const CACHE_MS = 10 * 60 * 1000;

export function forgetCachedEvents() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // nothing cached
  }
}

// Upcoming events of everyone in the household (only the calendars they chose)
export async function fetchEvents(force = false): Promise<{ linked: number; events: CalendarEvent[] }> {
  if (!force) {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
      if (cached && Date.now() - cached.at < CACHE_MS) return cached.data;
    } catch {
      // fetch fresh
    }
  }
  const res = await httpsCallable<{ days: number }, { linked: number; events: CalendarEvent[] }>(
    fns(),
    'calendarEvents'
  )({ days: 3 });
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data: res.data }));
  } catch {
    // fine without cache
  }
  return res.data;
}
