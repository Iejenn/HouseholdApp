import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { Recipe } from '../types';

// The household's recipe library, sorted by name
export function useRecipes(householdId: string): Recipe[] {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'households', householdId, 'recipes'), (snap) => {
      const list = snap.docs.map((d) => ({ ...(d.data() as Recipe), id: d.id }));
      list.sort((a, b) => a.name.localeCompare(b.name, 'nl'));
      setRecipes(list);
    });
    return unsub;
  }, [householdId]);
  return recipes;
}
