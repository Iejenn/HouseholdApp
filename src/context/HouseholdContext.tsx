import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { collection, doc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from './AuthContext';
import type { Completion, Household, Purchase, UserProfile } from '../types';

// Household data several tabs need (members, cat points), subscribed once
// here instead of separately in every screen
interface HouseholdContextValue {
  householdId: string;
  household: Household | null;
  memberNames: Record<string, string>;
  // For computeCat only: owned items, the last feeding and recent treats
  // (not the full history any more)
  purchases: Purchase[];
  earned: number;
  balance: number;
  // True once the household, points and cat purchases have loaded (used by
  // the loading screen, so the cat doesn't flash "hungry" with 0 data)
  ready: boolean;
}

// Kept up to date by the Cloud Functions (functions/stats.js), so the app
// doesn't need every check-off and purchase ever
interface PointsSummary {
  earned: number;
  spent: number;
  owned: string[];
  lastFoodAt: number;
}

// Treats make the cat happy for 12h, so only purchases this recent are loaded
const RECENT_PURCHASES_MS = 13 * 60 * 60 * 1000;

const HouseholdContext = createContext<HouseholdContextValue | undefined>(undefined);

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const uid = user!.uid;
  const householdId = profile!.householdId!;
  const [household, setHousehold] = useState<Household | null>(null);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  // undefined = still loading, null = no summary yet (older household, or the
  // functions aren't deployed yet): then we count the old way below
  const [summary, setSummary] = useState<PointsSummary | null | undefined>(undefined);
  const [recentPurchases, setRecentPurchases] = useState<Purchase[] | null>(null);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [completionsLoaded, setCompletionsLoaded] = useState(false);
  const [purchasesLoaded, setPurchasesLoaded] = useState(false);

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

  // Points and cat: one small summary doc instead of every check-off and
  // purchase ever (that list keeps growing, and every app open read it all)
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'households', householdId, 'stats', 'points'),
      (snap) => {
        if (snap.exists()) setSummary(snap.data() as PointsSummary);
        // "Not there" from the phone's cache only means "not downloaded yet":
        // wait for the server before falling back to the expensive way
        else if (!snap.metadata.fromCache) setSummary(null);
      },
      () => setSummary(null) // e.g. rules not deployed yet: count the old way
    );
    return unsub;
  }, [householdId]);

  // Recent purchases: treats (they count for 12h), and a new purchase shows
  // up on the cat right away instead of after the summary updates
  useEffect(() => {
    const since = Date.now() - RECENT_PURCHASES_MS;
    const q = query(collection(db, 'households', householdId, 'purchases'), where('createdAt', '>=', since));
    const unsub = onSnapshot(q, (snap) => setRecentPurchases(snap.docs.map((d) => d.data() as Purchase)));
    return unsub;
  }, [householdId]);

  // Fallback until the summary exists: every check-off and purchase ever
  const useFallback = summary === null;
  useEffect(() => {
    if (!useFallback) return;
    const unsubs = [
      onSnapshot(collection(db, 'households', householdId, 'completions'), (snap) => {
        setCompletions(snap.docs.map((d) => d.data() as Completion));
        setCompletionsLoaded(true);
      }),
      onSnapshot(collection(db, 'households', householdId, 'purchases'), (snap) => {
        setPurchases(snap.docs.map((d) => d.data() as Purchase));
        setPurchasesLoaded(true);
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [householdId, useFallback]);

  let earned: number;
  let spent: number;
  let catPurchases: Purchase[];
  if (summary) {
    earned = summary.earned;
    spent = summary.spent;
    // Rebuild what computeCat needs: owned items, the last feeding, recent treats
    catPurchases = [
      ...summary.owned.map((item) => ({ item, cost: 0, uid: '', createdAt: 0 })),
      ...(summary.lastFoodAt ? [{ item: 'food', cost: 0, uid: '', createdAt: summary.lastFoodAt }] : []),
      ...(recentPurchases ?? []),
    ];
  } else {
    earned = completions.reduce((sum, c) => sum + c.points, 0);
    spent = purchases.reduce((sum, p) => sum + p.cost, 0);
    catPurchases = purchases;
  }
  const pointsLoaded = summary ? recentPurchases !== null : summary === null && completionsLoaded && purchasesLoaded;

  return (
    <HouseholdContext.Provider
      value={{
        householdId,
        household,
        memberNames,
        purchases: catPurchases,
        earned,
        balance: earned - spent,
        ready: household !== null && pointsLoaded,
      }}
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
