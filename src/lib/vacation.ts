import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { Household, VacationPeriod } from '../types';

// Older periods don't matter for the cat any more (the bowl lasts 48h),
// so only a handful is kept on the household doc
const KEEP_PERIODS = 5;

export function activeVacation(household: Household | null | undefined): VacationPeriod | null {
  const last = household?.vacations?.at(-1);
  return last && last.to === null ? last : null;
}

// Turns vacation mode on or off for the whole household. A transaction, so
// both phones toggling at once can't leave a half-finished period behind.
export async function setVacation(householdId: string, uid: string, on: boolean): Promise<void> {
  const ref = doc(db, 'households', householdId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const periods: VacationPeriod[] = [...((snap.get('vacations') as VacationPeriod[] | undefined) ?? [])];
    const last = periods.at(-1);
    const isOn = !!last && last.to === null;
    if (on === isOn) return; // already how we want it
    if (on) periods.push({ from: Date.now(), to: null, by: uid });
    else periods[periods.length - 1] = { ...last!, to: Date.now() };
    tx.update(ref, { vacations: periods.slice(-KEEP_PERIODS) });
  });
}
