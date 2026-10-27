export interface UserProfile {
  uid: string;
  displayName: string;
  householdId: string | null;
  createdAt: number;
  // Persisted so live tracking auto-resumes next time the app opens
  liveLocationEnabled?: boolean;
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
export interface MemberLocation {
  uid: string;
  lat: number;
  lng: number;
  updatedAt: number;
}
export interface ChatMessage {
  id: string;
  householdId: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: number;
}