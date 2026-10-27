import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  type User,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { collection, doc, getDocs, limit, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { disablePush } from '../lib/push';
import type { UserProfile } from '../types';

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  // Logged in but the profile couldn't be loaded — shown on the login screen
  // instead of silently staying there
  profileError: string | null;
  // Logged in, but users/{uid} doesn't exist (so it can be rebuilt)
  profileMissing: boolean;
  repairProfile: (displayName: string) => Promise<void>;
  loading: boolean;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileMissing, setProfileMissing] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        setProfile(null);
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user) return;
    setProfileError(null);
    const ref = doc(db, 'users', user.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setProfileMissing(!snap.exists());
        if (snap.exists()) {
          setProfile(snap.data() as UserProfile);
          setProfileError(null);
        } else {
          setProfile(null);
          setProfileError(`Je account bestaat, maar je profiel ontbreekt in de database (users/${user.uid}).`);
        }
        setLoading(false);
      },
      (err) => {
        setProfile(null);
        setProfileError(`Je profiel kon niet geladen worden: ${err.code ?? err.message} (users/${user.uid})`);
        setLoading(false);
      }
    );
    return unsub;
  }, [user]);

  async function signUp(email: string, password: string, displayName: string) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const newProfile: UserProfile = {
      uid: cred.user.uid,
      displayName,
      householdId: null,
      createdAt: Date.now(),
    };
    await setDoc(doc(db, 'users', cred.user.uid), newProfile);
  }

  // Rebuilds a missing users/{uid} doc. The household is found again via its
  // member list, so you land back in the same household with all its data.
  async function repairProfile(displayName: string) {
    if (!user) return;
    const households = await getDocs(
      query(collection(db, 'households'), where('memberIds', 'array-contains', user.uid), limit(1))
    );
    const repaired: UserProfile = {
      uid: user.uid,
      displayName,
      householdId: households.empty ? null : households.docs[0].id,
      createdAt: Date.now(),
    };
    await setDoc(doc(db, 'users', user.uid), repaired);
  }

  async function signIn(email: string, password: string) {
    await signInWithEmailAndPassword(auth, email, password);
  }

  async function signOut() {
    // Stop this phone getting the other person's notifications once logged out
    if (user) await disablePush(user.uid).catch(() => {});
    await firebaseSignOut(auth);
  }

  // Firebase emails a link to a hosted page where a new password can be set
  async function resetPassword(email: string) {
    await sendPasswordResetEmail(auth, email);
  }

  return (
    <AuthContext.Provider value={{ user, profile, profileError, profileMissing, repairProfile, loading, signUp, signIn, signOut, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
