import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { firebaseOptions } from './firebaseOptions';

export const app = initializeApp(firebaseOptions);
export const auth = getAuth(app); // browser persistence (IndexedDB) is automatic
export const db = getFirestore(app);
