import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { firebaseOptions } from './firebaseOptions';

export const app = initializeApp(firebaseOptions);
export const auth = getAuth(app); // browser persistence (IndexedDB) is automatic
// Long polling instead of Firestore's default streaming connection: on some
// networks (VPNs, virus scanners, certain routers) the stream kept dropping
// (ERR_QUIC_PROTOCOL_ERROR), so nothing loaded and login seemed stuck.
// Slightly more overhead, but it works everywhere.
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  // Keep a copy on the phone: the app shows data straight away when opened,
  // and reopening within ~30 min only downloads what changed (fewer reads).
  // Works with several tabs open at once.
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
