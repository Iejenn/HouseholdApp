import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { Recipe } from '../types';

// The household's recipe library, sorted by name
// Same, plus whether the first load is in (for the loading screen)
export function useRecipesState(householdId: string): { recipes: Recipe[]; loaded: boolean } {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'households', householdId, 'recipes'), (snap) => {
      const list = snap.docs.map((d) => ({ ...(d.data() as Recipe), id: d.id }));
      list.sort((a, b) => a.name.localeCompare(b.name, 'nl'));
      setRecipes(list);
      setLoaded(true);
    });
    return unsub;
  }, [householdId]);
  return { recipes, loaded };
}

export function useRecipes(householdId: string): Recipe[] {
  return useRecipesState(householdId).recipes;
}
