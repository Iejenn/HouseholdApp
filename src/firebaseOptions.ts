// Shared by the app and the service worker (which can't import
// firebaseConfig.ts, since that also loads Auth and Firestore)
export const firebaseOptions = {
  apiKey: 'AIzaSyAVHFPt03mTANJp8yHYsvH5Xf2s__eMzIs',
  authDomain: 'household-14b3e.firebaseapp.com',
  projectId: 'household-14b3e',
  storageBucket: 'household-14b3e.firebasestorage.app',
  messagingSenderId: '395619432798',
  appId: '1:395619432798:web:831fb232efd8878c7f77cf',
};

// Public "Web Push certificate" key from Firebase Console → Project settings →
// Cloud Messaging → Web Push certificates. Public by design, safe to commit.
// Empty = push notifications stay switched off in the app.
export const VAPID_KEY =
  'BM4Tm-sBeAkuC_1jym_Jt0zB2v7LZLF6ndhMHtFhA6Xw2JucO7D_XVtqHb5JPzpPFdfDa4bstgOjDG0kuRl0B5c';
