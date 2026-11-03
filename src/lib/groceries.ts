import { collection, doc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { GroceryItem } from '../types';

// Same key for "Ui", " ui " and "UI", so they count as the same thing
export const groceryKey = (text: string) => text.trim().toLowerCase();

// Turns "Kipfilet, Pasta\nRucola" into a clean, de-duplicated list
export function parseIngredients(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\n,;]+/)) {
    const text = part.trim();
    if (text && !seen.has(groceryKey(text))) {
      seen.add(groceryKey(text));
      out.push(text);
    }
  }
  return out;
}

// Puts ingredients on the grocery list in one go, skipping anything that is
// already on the list (still open — bought items don't count) or appears
// twice in the input. One batch: everything is saved, or nothing is.
export async function addIngredientsToGroceries(
  householdId: string,
  uid: string,
  ingredients: string[]
): Promise<{ added: number; skipped: number }> {
  const col = collection(db, 'households', householdId, 'groceries');
  const openSnap = await getDocs(query(col, where('checkedAt', '==', null)));
  const have = new Set(openSnap.docs.map((d) => groceryKey((d.data() as GroceryItem).text)));

  const batch = writeBatch(db);
  const createdAt = Date.now();
  let added = 0;
  let skipped = 0;
  for (const raw of ingredients) {
    const text = raw.trim();
    if (!text) continue;
    const key = groceryKey(text);
    if (have.has(key)) {
      skipped++;
      continue;
    }
    have.add(key);
    const item: Omit<GroceryItem, 'id'> = {
      text,
      addedBy: uid,
      // +added keeps the recipe order in the newest-first list
      createdAt: createdAt + added,
      checkedAt: null,
      checkedBy: null,
    };
    batch.set(doc(col), item);
    added++;
  }
  if (added > 0) await batch.commit();
  return { added, skipped };
}

export function addResultText({ added, skipped }: { added: number; skipped: number }): string {
  if (added === 0) return skipped > 0 ? 'Alles stond al op de lijst 👍' : 'Geen ingrediënten om toe te voegen';
  const main = `${added} ${added === 1 ? 'ding' : 'dingen'} op de boodschappenlijst gezet`;
  return skipped > 0 ? `${main}, ${skipped} stond${skipped === 1 ? '' : 'en'} er al op` : main;
}
