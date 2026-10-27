import type { Purchase } from '../types';

// Everything the cat's points can buy. Prices are also checked in the
// Firestore rules (purchases) — change both together.
export interface ShopItem {
  id: string;
  name: string;
  emoji: string;
  description: string;
  cost: number;
  kind: 'food' | 'treat' | 'permanent';
  happiness: number; // permanent: lasting bonus, treat: temporary bonus
}

export const SHOP_ITEMS: ShopItem[] = [
  { id: 'food', name: 'Voerbak vullen', emoji: '🥣', description: 'Twee dagen een volle buik.', cost: 2, kind: 'food', happiness: 0 },
  { id: 'treat', name: 'Kattensnoepje', emoji: '🐟', description: 'Een halve dag extra blij.', cost: 1, kind: 'treat', happiness: 10 },
  { id: 'toy_mouse', name: 'Speelmuisje', emoji: '🐭', description: 'Om achteraan te rennen.', cost: 5, kind: 'permanent', happiness: 10 },
  { id: 'toy_yarn', name: 'Bolletje wol', emoji: '🧶', description: 'Urenlang vermaak.', cost: 5, kind: 'permanent', happiness: 10 },
  { id: 'toy_rod', name: 'Hengel met veertjes', emoji: '🪶', description: 'Samen spelen!', cost: 8, kind: 'permanent', happiness: 12 },
  { id: 'bed', name: 'Kattenmand', emoji: '🛏️', description: 'Een zacht plekje om te slapen.', cost: 15, kind: 'permanent', happiness: 18 },
  { id: 'scratcher', name: 'Krabpaal', emoji: '🪵', description: 'Krabben mag hier wél.', cost: 25, kind: 'permanent', happiness: 20 },
];

export const FOOD_LASTS_MS = 48 * 60 * 60 * 1000;
const TREAT_LASTS_MS = 12 * 60 * 60 * 1000;
const BASE_HAPPINESS = 30;
// Refilling an almost-full bowl would just waste points
export const REFILL_ALLOWED_BELOW = 80;

export type CatMood = 'hungry' | 'bored' | 'content' | 'happy';

export interface CatState {
  fullness: number; // 0–100
  happiness: number; // 0–100
  mood: CatMood;
  owned: Set<string>;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

// Everything is derived from the purchase history + the clock, so there is
// no separate cat document that could get out of sync
export function computeCat(purchases: Purchase[], now: number): CatState {
  const owned = new Set<string>();
  let lastFoodAt = 0;
  let treatBonus = 0;
  for (const p of purchases) {
    const item = SHOP_ITEMS.find((i) => i.id === p.item);
    if (!item) continue;
    if (item.kind === 'permanent') owned.add(item.id);
    else if (item.kind === 'food') lastFoodAt = Math.max(lastFoodAt, p.createdAt);
    else if (item.kind === 'treat' && now - p.createdAt < TREAT_LASTS_MS) treatBonus += item.happiness;
  }

  const fullness = lastFoodAt ? clamp(100 * (1 - (now - lastFoodAt) / FOOD_LASTS_MS)) : 0;

  let happiness = BASE_HAPPINESS + Math.min(treatBonus, 20);
  for (const id of owned) happiness += SHOP_ITEMS.find((i) => i.id === id)!.happiness;
  if (fullness < 25) happiness /= 2; // a hungry cat isn't a happy cat
  happiness = clamp(happiness);

  const mood: CatMood =
    fullness < 25 ? 'hungry' : happiness >= 70 ? 'happy' : happiness >= 45 ? 'content' : 'bored';

  return { fullness, happiness, mood, owned };
}
