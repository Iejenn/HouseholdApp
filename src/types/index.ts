export interface UserProfile {
  uid: string;
  displayName: string;
  householdId: string | null;
  createdAt: number;
}
export interface Household {
  id: string;
  name: string;
  inviteCode: string;
  memberIds: string[];
  createdAt: number;
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
}
// One doc per check-off in households/{id}/completions, so points survive
// even if the task is later edited, reopened or deleted.
// Doc id is `${taskId}_${completedAt}` so unchecking can find and remove it.
export interface Completion {
  taskId: string;
  uid: string;
  points: number;
  completedAt: number;
}
export interface ChatMessage {
  id: string;
  householdId: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: number;
}