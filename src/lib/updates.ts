import { registerSW } from 'virtual:pwa-register';

// Getting a new version (after a deploy) onto the phone in one go.
//
// The service worker (src/sw/sw.ts) installs a new version straight away and
// takes over, but the page that's already open keeps running the old code.
// Before this, you had to close and reopen the app twice. Now:
// - we also look for updates when the app comes back from the background,
//   and every hour while it stays open;
// - once the new version has taken over, the page reloads right away if you
//   only just opened the app (nothing typed yet); otherwise a bar asks you
//   to tap "Vernieuwen", so a half-written note is never lost.

const CHECK_EVERY_MS = 60 * 60 * 1000;
// "Just opened": this long after starting, or after coming back from at
// least AWAY_MS in the background
const FRESH_MS = 10_000;
const AWAY_MS = 60_000;

let freshSince = Date.now();
let hiddenAt: number | null = null;
let pending = false;
const listeners = new Set<(pending: boolean) => void>();

export function onUpdatePending(listener: (pending: boolean) => void): () => void {
  listeners.add(listener);
  listener(pending);
  return () => listeners.delete(listener);
}

export function reloadNow() {
  window.location.reload();
}

function newVersionReady() {
  if (Date.now() - freshSince < FRESH_MS) {
    reloadNow(); // just opened: nothing to lose, the loading screen shows briefly
    return;
  }
  pending = true;
  listeners.forEach((l) => l(true));
}

export function startUpdates() {
  if (!('serviceWorker' in navigator)) return;

  // Only a *change* of service worker means "new version"; the very first
  // install on a fresh phone also takes control, but that's not an update.
  // Tracked per change (not once at start), so a page that was opened before
  // the first install still notices later updates.
  let controller = navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const wasControlled = !!controller;
    controller = navigator.serviceWorker.controller;
    if (wasControlled) newVersionReady();
  });

  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => {
        if (navigator.onLine) registration.update().catch(() => {});
      };
      window.setInterval(check, CHECK_EVERY_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          hiddenAt = Date.now();
          return;
        }
        const away = hiddenAt ? Date.now() - hiddenAt : 0;
        hiddenAt = null;
        if (away >= AWAY_MS) {
          // Back after a while: counts as freshly opened
          if (pending) {
            reloadNow();
            return;
          }
          freshSince = Date.now();
        }
        check();
      });
    },
  });
}
