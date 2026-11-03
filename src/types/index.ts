export interface UserProfile {
  uid: string;
  displayName: string;
  householdId: string | null;
  createdAt: number;
  // Which push notifications this person wants (missing = all on)
  notify?: NotifyPrefs;
}
export interface NotifyPrefs {
  chat?: boolean;
  groceries?: boolean;
  daily?: boolean;
  weekly?: boolean;
  nudge?: boolean;
}
export interface Household {
  id: string;
  name: string;
  inviteCode: string;
  memberIds: string[];
  createdAt: number;
  // Name of the household's digital cat (missing on older households)
  catName?: string;
  // Chosen wallpaper/floor/collar/hat for the cat (ids from data/catShop)
  catLook?: Partial<Record<'wall' | 'floor' | 'collar' | 'hat', string | null>>;
  // Where the weather on the home screen is for (rounded to ~1 km)
  location?: WeatherLocation;
}
export interface WeatherLocation {
  lat: number;
  lon: number;
  name: string;
}
export type RecurrenceUnit = 'day' | 'week' | 'month';
export interface Recurrence {
  unit: RecurrenceUnit;
  interval: number;
}
export interface Task {
  id: string;
  householdId: string;
  title: string;
  notes: string | null;
  createdBy: string;
  assignedTo: string | null;
  isRecurring: boolean;
  recurrence: Recurrence | null;
  dueAt: number | null;
  completedAt: number | null;
  completedBy: string | null;
  hearts: string[];
  createdAt: number;
  // Id of the standard task group (see data/taskCatalog), null for custom tasks.
  // Optional because tasks created before this existed don't have it.
  category?: string | null;
  // The check-off before the current one, so unchecking a mis-tap restores
  // "laatst gedaan" instead of resetting it to "nog nooit"
  previousCompletedAt?: number | null;
  previousCompletedBy?: string | null;
  // Last time someone poked the other about this task (set by the server)
  lastNudgedAt?: number;
  lastNudgedBy?: string;
}
// One doc per check-off in households/{id}/completions. Each one earns the
// household points to spend on the cat. Doc id is `${taskId}_${completedAt}`
// so unchecking can find and remove it.
export interface Completion {
  taskId: string;
  uid: string;
  points: number;
  completedAt: number;
}
// One doc per thing bought for the cat in households/{id}/purchases (append-only)
export interface Purchase {
  item: string;
  cost: number;
  uid: string;
  createdAt: number;
}
export interface GroceryItem {
  id: string;
  text: string;
  addedBy: string;
  createdAt: number;
  checkedAt: number | null;
  checkedBy: string | null;
}
// Recipe library (Gerechten) in households/{id}/recipes
export interface Recipe {
  id: string;
  name: string;
  ingredients: string[];
  createdAt: number;
  createdBy: string;
}
export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
// households/{id}/weekMenus/{weekId}, weekId like "2026-KW45".
// Per day: a recipe id, null = deliberately nothing, missing = default
// (Friday's default is patat).
export interface WeekMenu {
  days: Partial<Record<DayKey, string | null>>;
  updatedAt: number;
}
