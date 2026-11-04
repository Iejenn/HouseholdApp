// Small summary documents per household, so the app doesn't have to load
// every check-off, cat purchase and grocery item ever on each open (that
// would get slower and more expensive the longer you use the app).
//
//   households/{id}/stats/points     earned, spent, owned cat items, lastFoodAt
//   households/{id}/stats/groceries  per item: how often bought + when last
//
// Only these functions write them (the app may only read them, see
// firestore.rules). The original collections stay the source of truth.
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { onDocumentCreated, onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';

const db = getFirestore();
const TIME_ZONE = 'Europe/Amsterdam';

// Checked-off groceries older than this are cleaned up at night (their
// counts are already in stats/groceries, so suggestions keep working)
const GROCERY_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

const pointsRef = (householdId) => db.doc(`households/${householdId}/stats/points`);
const groceryStatsRef = (householdId) => db.doc(`households/${householdId}/stats/groceries`);

// Same key as the app (src/lib/groceries.ts): "Melk", " melk" → "melk"
const groceryKey = (text) => String(text ?? '').trim().toLowerCase();

// ── Points and cat ─────────────────────────────────────────────────

// Counts everything from scratch. readAt = the moments the two lists were
// read: changes from before those are included in the totals.
async function countPoints(householdId) {
  const base = db.collection('households').doc(householdId);
  const completions = await base.collection('completions').get();
  const purchases = await base.collection('purchases').get();
  let earned = 0;
  for (const c of completions.docs) earned += c.get('points') ?? 0;
  let spent = 0;
  let lastFoodAt = 0;
  const owned = new Set();
  for (const p of purchases.docs) {
    spent += p.get('cost') ?? 0;
    const item = p.get('item');
    if (item === 'food') lastFoodAt = Math.max(lastFoodAt, p.get('createdAt') ?? 0);
    else if (item !== 'treat') owned.add(item); // toys and cosmetics are kept forever
  }
  return {
    earned,
    spent,
    owned: [...owned].sort(),
    lastFoodAt,
    completionsReadAt: completions.readTime.toMillis(),
    purchasesReadAt: purchases.readTime.toMillis(),
  };
}

export async function recountPoints(householdId) {
  const totals = await countPoints(householdId);
  await pointsRef(householdId).set(totals);
  return totals;
}

// Applies one change to the totals. Without a summary yet (households from
// before this existed), it counts everything once instead. A change that
// happened before the last full count is already in it, so it's skipped.
async function applyPointsChange(householdId, eventTime, readAtField, change) {
  const ref = pointsRef(householdId);
  const snap = await ref.get();
  if (!snap.exists) {
    await recountPoints(householdId);
    return;
  }
  if (Date.parse(eventTime) <= (snap.get(readAtField) ?? 0)) return;
  await db.runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    tx.update(ref, change(cur));
  });
}

export const statsCompletionCreated = onDocumentCreated(
  'households/{householdId}/completions/{completionId}',
  async (event) => {
    const points = event.data?.get('points') ?? 0;
    await applyPointsChange(event.params.householdId, event.time, 'completionsReadAt', () => ({
      earned: FieldValue.increment(points),
    }));
  }
);

// Unchecking a task removes its completion, and with it the point
export const statsCompletionDeleted = onDocumentDeleted(
  'households/{householdId}/completions/{completionId}',
  async (event) => {
    const points = event.data?.get('points') ?? 0;
    await applyPointsChange(event.params.householdId, event.time, 'completionsReadAt', () => ({
      earned: FieldValue.increment(-points),
    }));
  }
);

export const statsPurchaseCreated = onDocumentCreated(
  'households/{householdId}/purchases/{purchaseId}',
  async (event) => {
    const item = event.data?.get('item');
    const cost = event.data?.get('cost') ?? 0;
    const createdAt = event.data?.get('createdAt') ?? 0;
    await applyPointsChange(event.params.householdId, event.time, 'purchasesReadAt', (cur) => {
      const change = { spent: FieldValue.increment(cost) };
      if (item === 'food') change.lastFoodAt = Math.max(cur.get('lastFoodAt') ?? 0, createdAt);
      else if (item !== 'treat') change.owned = FieldValue.arrayUnion(item);
      return change;
    });
  }
);

// ── Grocery suggestions ────────────────────────────────────────────

// Counts all grocery items once (for households from before this existed)
async function countGroceries(householdId) {
  const all = await db.collection(`households/${householdId}/groceries`).get();
  const items = {};
  for (const d of all.docs) {
    const key = groceryKey(d.get('text'));
    if (!key) continue;
    const createdAt = d.get('createdAt') ?? 0;
    const entry = items[key] ?? { label: String(d.get('text')).trim(), count: 0, last: 0 };
    entry.count += 1;
    if (createdAt >= entry.last) {
      entry.last = createdAt;
      entry.label = String(d.get('text')).trim(); // latest spelling wins
    }
    items[key] = entry;
  }
  await groceryStatsRef(householdId).set({ items, readAt: all.readTime.toMillis() });
}

export const statsGroceryCreated = onDocumentCreated(
  'households/{householdId}/groceries/{itemId}',
  async (event) => {
    const { householdId } = event.params;
    const text = String(event.data?.get('text') ?? '').trim();
    const key = groceryKey(text);
    if (!key) return;
    const ref = groceryStatsRef(householdId);
    const snap = await ref.get();
    if (!snap.exists) {
      await countGroceries(householdId);
      return;
    }
    if (Date.parse(event.time) <= (snap.get('readAt') ?? 0)) return;
    // set + merge with a nested object: the key is used as-is, even if it
    // contains dots ("1.5 l melk")
    await ref.set(
      { items: { [key]: { label: text, count: FieldValue.increment(1), last: event.data?.get('createdAt') ?? Date.now() } } },
      { merge: true }
    );
  }
);

// ── Nightly maintenance ────────────────────────────────────────────
// 03:30, when nobody is using the app: re-checks the point totals (in case a
// function ever ran twice or not at all) and removes old checked-off groceries.

export const nightlyMaintenance = onSchedule(
  { schedule: '30 3 * * *', timeZone: TIME_ZONE, timeoutSeconds: 300 },
  async () => {
    const households = await db.collection('households').get();
    for (const household of households.docs) {
      const id = household.id;
      try {
        // Points: only write when something is actually off
        const totals = await countPoints(id);
        const current = (await pointsRef(id).get()).data();
        const same =
          current &&
          current.earned === totals.earned &&
          current.spent === totals.spent &&
          current.lastFoodAt === totals.lastFoodAt &&
          JSON.stringify([...(current.owned ?? [])].sort()) === JSON.stringify(totals.owned);
        if (!same) await pointsRef(id).set(totals);

        // Groceries: make sure the suggestion counts exist before cleaning up
        if (!(await groceryStatsRef(id).get()).exists) await countGroceries(id);
        const old = await db
          .collection(`households/${id}/groceries`)
          .where('checkedAt', '<', Date.now() - GROCERY_KEEP_MS)
          .get();
        for (let i = 0; i < old.docs.length; i += 400) {
          const batch = db.batch();
          old.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      } catch (err) {
        // One broken household shouldn't stop the others
        console.error('Nightly maintenance failed for household', id, err);
      }
    }
  }
);
