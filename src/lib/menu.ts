import { groceryKey } from './groceries';
import type { DayKey, Recipe, WeekMenu } from '../types';

// Friday is chips day unless you pick something else for that week
export const DEFAULT_DISHES: Partial<Record<DayKey, string>> = { fri: 'Patat' };

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
