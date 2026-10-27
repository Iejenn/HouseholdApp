import { useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  runTransaction,
  setDoc,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '../context/AuthContext';
import type { Household } from '../types';

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export default function HouseholdSetupScreen() {
  const { user, profile } = useAuth();
  const [householdName, setHouseholdName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!user || !householdName.trim()) {
      setError('Give your household a name first.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const newHouseholdRef = doc(collection(db, 'households'));
      const household: Household = {
        id: newHouseholdRef.id,
        name: householdName.trim(),
        inviteCode: generateInviteCode(),
        memberIds: [user.uid],
        createdAt: Date.now(),
      };
      // Household must exist first — the inviteCodes write below is only
      // allowed once the referenced household is confirmed to exist with
      // this user as its sole member, so these stay sequential (not batched).
      await setDoc(newHouseholdRef, household);

      // New: register the code -> household mapping so non-members can look
      // up this household by code without needing read access to it first.
      await setDoc(doc(db, 'inviteCodes', household.inviteCode), {
        householdId: newHouseholdRef.id,
      });

      await setDoc(
        doc(db, 'users', user.uid),
        { householdId: newHouseholdRef.id },
        { merge: true }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create household.');
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin() {
    if (!user || !joinCode.trim()) {
      setError('Enter the invite code your partner shared.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const code = joinCode.trim().toUpperCase();

      // Look up the household ID via the invite-code mapping instead of
      // querying households directly — a non-member can't read/query the
      // households collection freely, but this narrow code -> id lookup is
      // open to any authenticated user.
      const codeSnap = await getDoc(doc(db, 'inviteCodes', code));
      if (!codeSnap.exists()) {
        setError("That code doesn't match a household. Double-check it.");
        return;
      }
      const data = codeSnap.data();
      const householdId = typeof data?.householdId === 'string' ? data.householdId : undefined;
      if (!householdId) {
        setError('This invite code is set up incorrectly. Ask them to recreate the household.');
        return;
      }
      const householdRef = doc(db, 'households', householdId);

      // Set our own householdId FIRST, before joining. Other members'
      // clients react the instant they see us added to memberIds and
      // immediately try to read our users/{uid} doc — if our own
      // householdId isn't set yet at that moment, their read fails the
      // household-mate rule check with permission-denied. Setting it first
      // closes that race. If the join transaction below fails, we roll it
      // back since we never actually joined.
      await setDoc(doc(db, 'users', user.uid), { householdId }, { merge: true });

      try {
        await runTransaction(db, async (tx) => {
          const freshSnap = await tx.get(householdRef);
          if (!freshSnap.exists()) {
            throw new Error('This household no longer exists.');
          }
          const data = freshSnap.data() as Household;
          if (data.memberIds.includes(user.uid)) return;
          if (data.memberIds.length >= 2) {
            throw new Error('This household already has two members.');
          }
          tx.update(householdRef, { memberIds: [...data.memberIds, user.uid] });
        });
      } catch (txErr) {
        // Join didn't actually happen — undo the premature householdId set
        await setDoc(doc(db, 'users', user.uid), { householdId: null }, { merge: true }).catch(() => {});
        throw txErr;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join household.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="centered-screen">
      <div className="auth-card">
        <h1 className="brand-title" style={{ fontSize: 26 }}>
          Hi {profile?.displayName ?? 'there'} 👋
        </h1>
        <p className="brand-subtitle">Set up or join your household</p>

        <div className="card" style={{ marginBottom: 16 }}>
          <p className="card-title">Create a new household</p>
          <div style={{ marginBottom: 12 }}>
            <input
              className="input"
              placeholder="Household name (e.g. Our place)"
              value={householdName}
              onChange={(e) => setHouseholdName(e.target.value)}
            />
          </div>
          <button className="btn btn-primary btn-block" onClick={handleCreate} disabled={busy}>
            {busy ? 'Please wait…' : 'Create household'}
          </button>
        </div>

        <p className="divider-text">— or —</p>

        <div className="card">
          <p className="card-title">Join with an invite code</p>
          <div style={{ marginBottom: 12 }}>
            <input
              className="input"
              placeholder="6-character code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
              style={{ fontFamily: 'var(--font-mono)', letterSpacing: 2 }}
            />
          </div>
          <button
            className="btn btn-secondary btn-block"
            onClick={handleJoin}
            disabled={busy}
          >
            {busy ? 'Please wait…' : 'Join household'}
          </button>
        </div>

        {error && (
          <p style={{ color: 'var(--color-danger)', fontSize: 13, marginTop: 16, textAlign: 'center' }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}