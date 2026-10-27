import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from './AuthContext';
import type { Completion, Household, Purchase, UserProfile } from '../types';

// Household data several tabs need (members, cat points), subscribed once
// here instead of separately in every screen
interface HouseholdContextValue {
  householdId: string;
  household: Household | null;
  memberNames: Record<string, string>;
  purchases: Purchase[];
  earned: number;
  balance: number;
}

const HouseholdContext = createContext<HouseholdContextValue | undefined>(undefined);

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const uid = user!.uid;
  const householdId = profile!.householdId!;
  const [household, setHousehold] = useState<Household | null>(null);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);

  useEffect(() => {
    // Removed from the household by the other member (or it can no longer be
    // read at all): clear our own householdId, which sends this phone back to
    // the create/join screen instead of leaving it stuck on errors
    const leave = () =>
      setDoc(doc(db, 'users', uid), { householdId: null }, { merge: true }).catch((err) =>
        console.error('Could not leave removed household', err)
      );
    const unsub = onSnapshot(
      doc(db, 'households', householdId),
      (snap) => {
        if (!snap.exists()) return;
        const data = { ...(snap.data() as Household), id: snap.id };
        if (!data.memberIds.includes(uid)) {
          leave();
          return;
        }
        setHousehold(data);
      },
      (err) => {
        // Only members (or anyone while there's room) may read a household, so
        // this means we're out. If it was a mistake, joining with the code again
        // puts us straight back (we'd still be in memberIds).
        if (err.code === 'permission-denied') leave();
      }
    );
    return unsub;
  }, [householdId, uid]);

  const memberKey = household?.memberIds.join(',') ?? '';
  useEffect(() => {
    if (!memberKey) return;
    const unsubs = memberKey.split(',').map((memberUid) =>
      onSnapshot(doc(db, 'users', memberUid), (snap) => {
        if (snap.exists()) {
          const data = snap.data() as UserProfile;
          setMemberNames((prev) => ({ ...prev, [memberUid]: data.displayName }));
        }
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [memberKey]);

  // Every check-off ever — fine for a 2-person household; if this ever gets
  // slow it can be replaced by a running total
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'households', householdId, 'completions'), (snap) => {
      setCompletions(snap.docs.map((d) => d.data() as Completion));
    });
    return unsub;
  }, [householdId]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'households', householdId, 'purchases'), (snap) => {
      setPurchases(snap.docs.map((d) => d.data() as Purchase));
    });
    return unsub;
  }, [householdId]);

  const earned = completions.reduce((sum, c) => sum + c.points, 0);
  const spent = purchases.reduce((sum, p) => sum + p.cost, 0);

  return (
    <HouseholdContext.Provider
      value={{ householdId, household, memberNames, purchases, earned, balance: earned - spent }}
    >
      {children}
    </HouseholdContext.Provider>
  );
}

export function useHousehold() {
  const ctx = useContext(HouseholdContext);
  if (!ctx) throw new Error('useHousehold must be used within a HouseholdProvider');
  return ctx;
}
