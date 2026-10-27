import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyAVHFPt03mTANJp8yHYsvH5Xf2s__eMzIs',
  authDomain: 'household-14b3e.firebaseapp.com',
  projectId: 'household-14b3e',
  storageBucket: 'household-14b3e.firebasestorage.app',
  messagingSenderId: '395619432798',
  appId: '1:395619432798:web:831fb232efd8878c7f77cf',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app); // browser persistence (IndexedDB) is automatic
export const db = getFirestore(app);
