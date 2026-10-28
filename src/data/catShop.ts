import type { Purchase } from '../types';

// Everything the cat's points can buy. Prices are also checked in the
// Firestore rules (purchases) — change both together.
export type CosmeticSlot = 'wall' | 'floor' | 'collar' | 'hat';

export interface ShopItem {
  id: string;
  name: string;
  emoji: string;
  description: string;
  cost: number;
  kind: 'food' | 'treat' | 'permanent' | 'cosmetic';
  slot?: CosmeticSlot; // cosmetics: which spot it goes in (one at a time)
  happiness: number; // permanent/cosmetic: lasting bonus, treat: temporary bonus
}

export const SHOP_ITEMS: ShopItem[] = [
  { id: 'food', name: 'Voerbak vullen', emoji: '🥣', description: 'Twee dagen een volle buik.', cost: 2, kind: 'food', happiness: 0 },
  { id: 'treat', name: 'Kattensnoepje', emoji: '🐟', description: 'Een halve dag extra blij.', cost: 1, kind: 'treat', happiness: 10 },

  { id: 'toy_mouse', name: 'Speelmuisje', emoji: '🐭', description: 'Om achteraan te rennen.', cost: 5, kind: 'permanent', happiness: 10 },
  { id: 'toy_yarn', name: 'Bolletje wol', emoji: '🧶', description: 'Urenlang vermaak.', cost: 5, kind: 'permanent', happiness: 10 },
  { id: 'toy_rod', name: 'Hengel met veertjes', emoji: '🪶', description: 'Samen spelen!', cost: 8, kind: 'permanent', happiness: 12 },
  { id: 'bed', name: 'Kattenmand', emoji: '🛏️', description: 'Een zacht plekje om te slapen.', cost: 15, kind: 'permanent', happiness: 18 },
  { id: 'scratcher', name: 'Krabpaal', emoji: '🪵', description: 'Krabben mag hier wél.', cost: 25, kind: 'permanent', happiness: 20 },

  { id: 'wall_mint', name: 'Mintgroen', emoji: '🟩', description: 'Fris behang.', cost: 6, kind: 'cosmetic', slot: 'wall', happiness: 3 },
  { id: 'wall_stripes', name: 'Streepjes', emoji: '🎏', description: 'Klassiek streepjesbehang.', cost: 8, kind: 'cosmetic', slot: 'wall', happiness: 3 },
  { id: 'wall_flowers', name: 'Bloemetjes', emoji: '🌸', description: 'Vrolijk bloemetjesbehang.', cost: 10, kind: 'cosmetic', slot: 'wall', happiness: 3 },
  { id: 'wall_stars', name: 'Sterrenhemel', emoji: '🌌', description: 'Donkerblauw met gouden sterren.', cost: 12, kind: 'cosmetic', slot: 'wall', happiness: 3 },

  { id: 'floor_wood', name: 'Houten planken', emoji: '🪵', description: 'Warme houten vloer.', cost: 8, kind: 'cosmetic', slot: 'floor', happiness: 3 },
  { id: 'floor_tiles', name: 'Geblokte tegels', emoji: '🏁', description: 'Zwart-wit, net als de kat.', cost: 8, kind: 'cosmetic', slot: 'floor', happiness: 3 },
  { id: 'floor_carpet', name: 'Zacht tapijt', emoji: '🧺', description: 'Heerlijk voor warme pootjes.', cost: 10, kind: 'cosmetic', slot: 'floor', happiness: 3 },

  { id: 'collar_red', name: 'Rood halsbandje', emoji: '❤️', description: 'Simpel en stijlvol.', cost: 4, kind: 'cosmetic', slot: 'collar', happiness: 3 },
  { id: 'collar_bell', name: 'Halsband met belletje', emoji: '🔔', description: 'Je hoort hem aankomen.', cost: 6, kind: 'cosmetic', slot: 'collar', happiness: 3 },
  { id: 'collar_bow', name: 'Roze strikje', emoji: '🎀', description: 'Heel deftig.', cost: 6, kind: 'cosmetic', slot: 'collar', happiness: 3 },

  { id: 'hat_party', name: 'Feestmutsje', emoji: '🥳', description: 'Elke dag feest.', cost: 8, kind: 'cosmetic', slot: 'hat', happiness: 3 },
  { id: 'hat_flowers', name: 'Bloemenkransje', emoji: '🌼', description: 'Lente op zijn kop.', cost: 10, kind: 'cosmetic', slot: 'hat', happiness: 3 },
  { id: 'hat_crown', name: 'Gouden kroontje', emoji: '👑', description: 'Hij weet toch al dat hij de baas is.', cost: 20, kind: 'cosmetic', slot: 'hat', happiness: 3 },
];

export const SLOT_LABELS: Record<CosmeticSlot, { label: string; none: string }> = {
  wall: { label: 'Behang', none: 'Standaard' },
  floor: { label: 'Vloer', none: 'Standaard' },
  collar: { label: 'Halsband', none: 'Geen' },
  hat: { label: 'Hoedje', none: 'Geen' },
};

// What the cat currently wears / how the room looks (stored on the household)
export type CatLook = Partial<Record<CosmeticSlot, string | null>>;

// ── The house grows with the total number of tasks done together ──────
// Free milestones (no points spent), so working hard stays visible.
export const HOUSE_LEVELS = [
  { at: 0, name: 'Knus kamertje', unlocks: '' },
  { at: 25, name: 'Gezellig ingericht', unlocks: 'een vensterbank met plantjes en een fotolijstje' },
  { at: 75, name: 'Tweede kamer', unlocks: 'een tweede kamer met bank, lamp en kleed' },
  { at: 150, name: 'Met zolder', unlocks: 'een zolder met dakraam en hangmat' },
];

export function houseLevel(tasksDone: number): number {
  let level = 0;
  HOUSE_LEVELS.forEach((l, i) => {
    if (tasksDone >= l.at) level = i;
  });
  return level;
}

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
    if (item.kind === 'permanent' || item.kind === 'cosmetic') owned.add(item.id);
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

// ── Time of day and season (only in the app, nothing stored) ──────────
export type DayPart = 'day' | 'evening' | 'night';

export function dayPart(now: number): DayPart {
  const h = new Date(now).getHours();
  if (h >= 22 || h < 7) return 'night';
  if (h >= 18) return 'evening';
  return 'day';
}

export type Season = 'christmas' | 'halloween' | 'spring' | null;

export function season(now: number): Season {
  const m = new Date(now).getMonth(); // 0 = januari
  if (m === 11) return 'christmas';
  if (m === 9) return 'halloween';
  if (m >= 2 && m <= 4) return 'spring';
  return null;
}
