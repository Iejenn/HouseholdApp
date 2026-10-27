import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
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
  const { profile } = useAuth();
  const householdId = profile!.householdId!;
  const [household, setHousehold] = useState<Household | null>(null);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'households', householdId), (snap) => {
      if (snap.exists()) setHousehold({ ...(snap.data() as Household), id: snap.id });
    });
    return unsub;
  }, [householdId]);

  const memberKey = household?.memberIds.join(',') ?? '';
  useEffect(() => {
    if (!memberKey) return;
    const unsubs = memberKey.split(',').map((uid) =>
      onSnapshot(doc(db, 'users', uid), (snap) => {
        if (snap.exists()) {
          const data = snap.data() as UserProfile;
          setMemberNames((prev) => ({ ...prev, [uid]: data.displayName }));
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
