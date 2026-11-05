import { collection, doc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import type { DocumentReference } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { GroceryItem, Recipe } from '../types';
import { t } from '../i18n/core';

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

// One ingredient to add, with the dish it's for (null when typed by hand)
export interface IngredientToAdd {
  text: string;
  recipe: string | null;
}

export const fromRecipe = (recipe: Recipe): IngredientToAdd[] =>
  recipe.ingredients.map((text) => ({ text, recipe: recipe.name }));

// Puts ingredients on the grocery list in one go. Anything already on the
// list (still open — bought items don't count) isn't added twice: it only
// gets the dish added to its "voor …" note, so "Ui · voor Risotto, Nasi"
// tells you to buy enough. One batch: everything is saved, or nothing is.
export async function addIngredientsToGroceries(
  householdId: string,
  uid: string,
  ingredients: IngredientToAdd[]
): Promise<{ added: number; skipped: number }> {
  const col = collection(db, 'households', householdId, 'groceries');
  const openSnap = await getDocs(query(col, where('checkedAt', '==', null)));

  // Everything per ingredient first, so an ingredient in two dishes of the
  // same week becomes one item "voor" both
  const plan = new Map<string, { text: string; ref: DocumentReference | null; had: string[]; recipes: string[] }>();
  for (const d of openSnap.docs) {
    const data = d.data() as GroceryItem;
    const key = groceryKey(data.text);
    if (!plan.has(key)) plan.set(key, { text: data.text, ref: d.ref, had: data.forRecipes ?? [], recipes: [...(data.forRecipes ?? [])] });
  }

  let added = 0;
  let skipped = 0;
  const order: string[] = [];
  for (const { text: raw, recipe } of ingredients) {
    const text = raw.trim();
    if (!text) continue;
    const key = groceryKey(text);
    const entry = plan.get(key);
    if (entry) {
      skipped++;
      if (recipe && !entry.recipes.includes(recipe)) entry.recipes.push(recipe);
      continue;
    }
    plan.set(key, { text, ref: null, had: [], recipes: recipe ? [recipe] : [] });
    order.push(key);
    added++;
  }

  const batch = writeBatch(db);
  let writes = 0;
  const createdAt = Date.now();
  // New items; +i keeps the recipe order in the newest-first list
  order.forEach((key, i) => {
    const entry = plan.get(key)!;
    const item: Omit<GroceryItem, 'id'> = {
      text: entry.text,
      addedBy: uid,
      createdAt: createdAt + i,
      checkedAt: null,
      checkedBy: null,
      ...(entry.recipes.length > 0 && { forRecipes: entry.recipes.slice(0, 10) }),
    };
    batch.set(doc(col), item);
    writes++;
  });
  // Items already on the list that are now also needed for another dish
  for (const entry of plan.values()) {
    if (entry.ref && entry.recipes.length > entry.had.length) {
      batch.update(entry.ref, { forRecipes: entry.recipes.slice(0, 10) });
      writes++;
    }
  }
  if (writes > 0) await batch.commit();
  return { added, skipped };
}

export function addResultText({ added, skipped }: { added: number; skipped: number }): string {
  if (added === 0) return skipped > 0 ? t('Alles stond al op de lijst 👍') : t('Geen ingrediënten om toe te voegen');
  const main = added === 1 ? t('1 ding op de boodschappenlijst gezet') : t('{n} dingen op de boodschappenlijst gezet', { n: added });
  if (skipped === 0) return main;
  return skipped === 1 ? t('{main}, 1 stond er al op', { main }) : t('{main}, {n} stonden er al op', { main, n: skipped });
}
