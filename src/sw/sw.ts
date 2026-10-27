/// <reference lib="webworker" />
// Custom service worker: offline caching (as before) + showing push
// notifications sent by the Cloud Functions in /functions.
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';
import { initializeApp } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';
import { firebaseOptions } from '../firebaseOptions';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

// Same "update straight away" behaviour the generated worker had
self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Only called when the app isn't open in front of you — while it is, the
// screen already updates live, so no notification is needed
const messaging = getMessaging(initializeApp(firebaseOptions));
onBackgroundMessage(messaging, (payload) => {
  const data = payload.data ?? {};
  return self.registration.showNotification(data.title ?? 'Huishouden', {
    body: data.body ?? '',
    icon: `${import.meta.env.BASE_URL}icon-192.png`,
    badge: `${import.meta.env.BASE_URL}icon-192.png`,
    // Same tag replaces the previous one (e.g. several groceries in a row)
    tag: data.tag,
    data: { tab: data.tab ?? 'tasks' },
  });
});

// Tapping a notification opens the app on the right tab
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const tab: string = event.notification.data?.tab ?? 'tasks';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows[0];
      if (existing) {
        await existing.focus();
        existing.postMessage({ type: 'open-tab', tab });
      } else {
        await self.clients.openWindow(`${import.meta.env.BASE_URL}?tab=${tab}`);
      }
    })()
  );
});
