import { groceryKey } from './groceries';
import type { DayKey, Recipe, WeekMenu } from '../types';

// Fixed dishes per weekday. Was { fri: 'Patat' } (our own Friday habit), but
// that would show up for every household, so it's empty now. The code below
// still supports it, should this become a per-household setting later.
export const DEFAULT_DISHES: Partial<Record<DayKey, string>> = {};

// What's on the plate for one day, resolved from the stored value
export type Planned =
  | { kind: 'recipe'; recipe: Recipe; isDefault: boolean }
  | { kind: 'default-missing'; name: string } // e.g. Patat, but no such recipe yet
  | { kind: 'deleted' } // picked a recipe that was later removed
  | { kind: 'none' };

export function resolveDay(key: DayKey, menu: WeekMenu | null, recipes: Recipe[]): Planned {
  const value = menu?.days[key];
  if (value === null) return { kind: 'none' };
  if (value !== undefined) {
    const recipe = recipes.find((r) => r.id === value);
    return recipe ? { kind: 'recipe', recipe, isDefault: false } : { kind: 'deleted' };
  }
  const defaultName = DEFAULT_DISHES[key];
  if (!defaultName) return { kind: 'none' };
  // The default links to the library by name, so "Patat" can have its own ingredients
  const recipe = recipes.find((r) => groceryKey(r.name) === groceryKey(defaultName));
  return recipe ? { kind: 'recipe', recipe, isDefault: true } : { kind: 'default-missing', name: defaultName };
}

// Search text without case or accents ("Crème" = "creme")
const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

// Recipes matching a search on name OR ingredient ("kip" finds Pasta Pesto
// via Kipfilet). Name matches come first.
export function searchRecipes(recipes: Recipe[], query: string): Recipe[] {
  const q = normalize(query);
  if (!q) return recipes;
  const byName = recipes.filter((r) => normalize(r.name).includes(q));
  const byIngredient = recipes.filter(
    (r) => !byName.includes(r) && r.ingredients.some((i) => normalize(i).includes(q))
  );
  return [...byName, ...byIngredient];
}
