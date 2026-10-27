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
}
export interface Household {
  id: string;
  name: string;
  inviteCode: string;
  memberIds: string[];
  createdAt: number;
  // Name of the household's digital cat (missing on older households)
  catName?: string;
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
export interface ChatMessage {
  id: string;
  householdId: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: number;
}
