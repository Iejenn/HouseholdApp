import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { groceryKey } from './groceries';
import type { GroceryItem } from '../types';

// The household's own shop order: a number per product ("tomaten" → 3.5),
// lower = higher on the list. Kept per product, not per list item, so
// Tomaten lands next to Komkommer again next week.
// Stored in households/{id}/settings/groceryOrder as { ranks, updatedAt }.
export type GroceryRanks = Record<string, number>;

export const groceryOrderRef = (householdId: string) => doc(db, 'households', householdId, 'settings', 'groceryOrder');

// Known products in shop order first; products you never moved go at the
// bottom, in the order they were added (newest last)
export function sortByShopOrder(items: GroceryItem[], ranks: GroceryRanks): GroceryItem[] {
  const rank = (i: GroceryItem) => ranks[groceryKey(i.text)];
  return [...items].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra != null && rb != null) return ra - rb || a.createdAt - b.createdAt;
    if (ra != null) return -1;
    if (rb != null) return 1;
    return a.createdAt - b.createdAt;
  });
}

// New ranks after moving list[from] to position `to`. Only the products that
// need a (new) number are returned, so one drag is one small write.
export function ranksAfterMove(list: GroceryItem[], ranks: GroceryRanks, from: number, to: number): GroceryRanks {
  const order = [...list];
  const [moved] = order.splice(from, 1);
  order.splice(to, 0, moved);
  const rankOf = (i: GroceryItem | undefined) => (i ? ranks[groceryKey(i.text)] : undefined);
  const below = order.slice(to + 1).find((i) => rankOf(i) != null);
  const above = rankOf(order[to - 1]);

  if (below) {
    // Dropped among products that already have a place: halfway between
    const b = rankOf(below)!;
    const value = above != null ? (above + b) / 2 : b - 1;
    // Halved too often (after many moves): number everything again 1, 2, 3…
    if (above != null && (value <= above || value >= b)) return renumber(order, ranks);
    return { [groceryKey(moved.text)]: value };
  }

  // Dropped among (or above) products without a place yet: give everything
  // from the top down to the dropped one a place after the last known one,
  // so what you see is what's remembered
  const update: GroceryRanks = {};
  let last = 0;
  for (let i = 0; i <= to; i++) {
    const key = groceryKey(order[i].text);
    const r = i === to ? undefined : ranks[key];
    if (r != null) last = r;
    else update[key] = last = last + 1;
  }
  return update;
}

// Fresh whole numbers for everything known, in the current order
function renumber(order: GroceryItem[], ranks: GroceryRanks): GroceryRanks {
  const visible = order.map((i) => groceryKey(i.text));
  const others = Object.entries(ranks)
    .filter(([key]) => !visible.includes(key))
    .sort(([, a], [, b]) => a - b);
  // Products not on the list now keep their spot relative to the visible ones
  const out: GroceryRanks = {};
  let n = 0;
  let o = 0;
  for (const key of visible) {
    const r = ranks[key];
    while (o < others.length && r != null && others[o][1] < r) out[others[o++][0]] = ++n;
    out[key] = ++n;
  }
  while (o < others.length) out[others[o++][0]] = ++n;
  return out;
}

export async function saveRanks(householdId: string, update: GroceryRanks) {
  // merge: only these products change, the rest of the order stays
  await setDoc(groceryOrderRef(householdId), { ranks: update, updatedAt: Date.now() }, { merge: true });
}
