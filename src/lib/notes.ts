import { arrayUnion, deleteField, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

// Post-its on the Thuis board (stored in households/{id}/messages, the old chat)

// The four emoji you can react with. The same list is in firestore.rules;
// change both together.
export const REACTIONS = ['❤️', '👍', '😂', '🙏'] as const;

// A short written reply ("↳ Sam: Doe ik vanmiddag!")
export const REPLY_MAX = 80;
export interface NoteReply {
  uid: string;
  text: string;
  at: number;
}

export interface Note {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: number;
  color?: string;
  // uid → emoji, one reaction per person
  reactions?: Record<string, string>;
  replies?: NoteReply[];
}

// Each person writes in their own (readable) handwriting: the first member
// of the household in Kalam, the second in Patrick Hand. Patrick Hand runs a
// bit small, so it gets a slightly bigger size to look the same.
const HANDS = [
  { fontFamily: "'Kalam', 'Comic Sans MS', cursive", scale: 1 },
  { fontFamily: "'Patrick Hand', 'Comic Sans MS', cursive", scale: 1.1 },
];

export function handwriting(uid: string, memberIds: string[], size: number) {
  const index = Math.max(0, memberIds.indexOf(uid));
  const hand = HANDS[index % HANDS.length];
  return { fontFamily: hand.fontFamily, fontSize: Math.round(size * hand.scale) };
}

// Replies in the order they were written
export function sortedReplies(note: Note): NoteReply[] {
  return [...(note.replies ?? [])].sort((a, b) => a.at - b.at);
}

// Tap an emoji: set it, switch to it, or (same one again) take it back
export async function toggleReaction(householdId: string, note: Note, uid: string, emoji: string) {
  const mine = note.reactions?.[uid];
  await updateDoc(doc(db, 'households', householdId, 'messages', note.id), {
    [`reactions.${uid}`]: mine === emoji ? deleteField() : emoji,
  });
}

export async function addReply(householdId: string, noteId: string, uid: string, text: string) {
  const reply: NoteReply = { uid, text: text.trim().slice(0, REPLY_MAX), at: Date.now() };
  await updateDoc(doc(db, 'households', householdId, 'messages', noteId), { replies: arrayUnion(reply) });
}
