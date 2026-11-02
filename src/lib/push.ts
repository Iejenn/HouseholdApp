import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { deleteToken, getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, db } from '../firebaseConfig';
import { VAPID_KEY } from '../firebaseOptions';

// This phone's token is remembered so it can be removed again on sign-out
const TOKEN_KEY = 'pushToken';

function savedToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function rememberToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // private mode: token just won't be cleaned up on sign-out
  }
}

export type PushStatus = 'unsupported' | 'not-configured' | 'denied' | 'off' | 'on';

export async function pushStatus(): Promise<PushStatus> {
  if (!VAPID_KEY) return 'not-configured';
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !(await isSupported())) {
    return 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';
  return Notification.permission === 'granted' && savedToken() ? 'on' : 'off';
}

// Gets this phone's push address from Firebase and stores it under the user,
// where the Cloud Functions look it up. Uses our own service worker (the
// default would look for /firebase-messaging-sw.js, which doesn't exist).
async function registerToken(uid: string): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(app), {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  });
  const previous = savedToken();
  if (previous && previous !== token) {
    await deleteDoc(doc(db, 'users', uid, 'pushTokens', previous)).catch(() => {});
  }
  await setDoc(doc(db, 'users', uid, 'pushTokens', token), {
    createdAt: Date.now(),
    userAgent: navigator.userAgent.slice(0, 200),
  });
  rememberToken(token);
}

// Must be called from a tap: browsers only show the permission popup then
export async function enablePush(uid: string): Promise<PushStatus> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  await registerToken(uid);
  return 'on';
}

// Tokens can change over time; refresh quietly each time the app opens
export async function refreshPush(uid: string): Promise<void> {
  if ((await pushStatus()) !== 'on') return;
  await registerToken(uid).catch((err) => console.warn('Push token refresh failed', err));
}

export async function disablePush(uid: string): Promise<void> {
  const token = savedToken();
  rememberToken(null);
  if (token) await deleteDoc(doc(db, 'users', uid, 'pushTokens', token)).catch(() => {});
  if (await isSupported()) await deleteToken(getMessaging(app)).catch(() => {});
}

// Asks the server to send the partner a "can you do this?" notification.
// Returns false when nobody can receive it (no partner, or they turned pokes off).
export async function nudgeTask(householdId: string, taskId: string): Promise<boolean> {
  const res = await httpsCallable<{ householdId: string; taskId: string }, { ok: boolean }>(
    getFunctions(app, 'europe-west1'),
    'nudgeTask'
  )({ householdId, taskId });
  return res.data.ok;
}

export async function sendTestPush(): Promise<void> {
  await httpsCallable(getFunctions(app, 'europe-west1'), 'sendTestPush')();
}

// While the app is open the service worker stays quiet (the screen updates
// live anyway) — except for the test message, so the test button visibly works
export async function listenForTestPush(): Promise<() => void> {
  if (!VAPID_KEY || !(await isSupported())) return () => {};
  return onMessage(getMessaging(app), async (payload) => {
    const data = payload.data ?? {};
    if (data.tag !== 'test') return;
    const registration = await navigator.serviceWorker.ready;
    registration.showNotification(data.title ?? 'Huishouden', {
      body: data.body,
      icon: `${import.meta.env.BASE_URL}icon-192.png`,
      tag: 'test',
    });
  });
}
