import { useEffect, useState } from 'react';
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '../context/AuthContext';
import PointsBoard from '../components/PointsBoard';
import type { Completion, Household, Recurrence, RecurrenceUnit, Task, UserProfile } from '../types';

// Every check-off is worth this many points
const POINTS_PER_TASK = 1;

function formatRecurrence(r: Recurrence): string {
  const { unit, interval } = r;
  const unitLabel = interval === 1 ? unit : `${unit}s`;
  if (interval === 1) {
    return `every ${unit}`;
  }
  if (unit === 'week' && interval === 2) return 'biweekly';
  return `every ${interval} ${unitLabel}`;
}

export default function TaskListScreen() {
  const { user, profile } = useAuth();
  const [household, setHousehold] = useState<Household | null>(null);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [burstTaskId, setBurstTaskId] = useState<string | null>(null);

  const householdId = profile?.householdId;

  useEffect(() => {
    if (!householdId) return;
    const unsub = onSnapshot(doc(db, 'households', householdId), (snap) => {
      if (snap.exists()) setHousehold(snap.data() as Household);
    });
    return unsub;
  }, [householdId]);

  useEffect(() => {
    if (!household) return;
    const unsubs = household.memberIds.map((uid) =>
      onSnapshot(doc(db, 'users', uid), (snap) => {
        if (snap.exists()) {
          const data = snap.data() as UserProfile;
          setMemberNames((prev) => ({ ...prev, [uid]: data.displayName }));
        }
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [household]);

  useEffect(() => {
    if (!householdId) return;
    const q = query(
      collection(db, 'households', householdId, 'tasks'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setTasks(snap.docs.map((d) => ({ ...(d.data() as Task), id: d.id })));
    });
    return unsub;
  }, [householdId]);

  // All check-offs in this household — small for a 2-person household, so
  // the weekly/total sums are done here instead of in a separate counter doc
  useEffect(() => {
    if (!householdId) return;
    const unsub = onSnapshot(collection(db, 'households', householdId, 'completions'), (snap) => {
      setCompletions(snap.docs.map((d) => d.data() as Completion));
    });
    return unsub;
  }, [householdId]);

  async function toggleComplete(task: Task) {
    if (!user || !householdId) return;
    const ref = doc(db, 'households', householdId, 'tasks', task.id);
    const completionsCol = collection(db, 'households', householdId, 'completions');
    // Task update and point record are written together, so you can't get
    // a point without the task actually being checked off (and vice versa)
    const batch = writeBatch(db);
    if (task.completedAt) {
      batch.update(ref, { completedAt: null, completedBy: null });
      // Unchecking takes the point back
      batch.delete(doc(completionsCol, `${task.id}_${task.completedAt}`));
    } else {
      const completedAt = Date.now();
      batch.update(ref, { completedAt, completedBy: user.uid });
      const completion: Completion = {
        taskId: task.id,
        uid: user.uid,
        points: POINTS_PER_TASK,
        completedAt,
      };
      batch.set(doc(completionsCol, `${task.id}_${completedAt}`), completion);
    }
    await batch.commit();
  }

  async function toggleHeart(task: Task) {
    if (!user || !householdId) return;
    const ref = doc(db, 'households', householdId, 'tasks', task.id);
    const alreadyHearted = task.hearts.includes(user.uid);
    if (!alreadyHearted) {
      setBurstTaskId(task.id);
      window.setTimeout(() => setBurstTaskId((cur) => (cur === task.id ? null : cur)), 650);
    }
    await updateDoc(ref, {
      hearts: alreadyHearted ? arrayRemove(user.uid) : arrayUnion(user.uid),
    });
  }

  if (!household) {
    return (
      <div className="centered-screen">
        <p style={{ color: 'var(--color-ink-soft)' }}>Loading your household…</p>
      </div>
    );
  }

  return (
    <>
      <div className="app-header">
        <div>
          <h2 className="household-name">{household.name}</h2>
          <span className="invite-code">{household.inviteCode}</span>
        </div>
      </div>

      <div className="app-content">
        <PointsBoard
          memberIds={household.memberIds}
          memberNames={memberNames}
          completions={completions}
          myUid={user?.uid}
        />

        {tasks.length === 0 && (
          <p className="empty-state">No tasks yet — tap + to add the first one.</p>
        )}

        {tasks.map((item) => {
          const isDone = !!item.completedAt;
          const canHeart = isDone && item.completedBy !== user?.uid;
          const iHearted = user ? item.hearts.includes(user.uid) : false;
          const isBursting = burstTaskId === item.id;

          return (
            <div className="task-row" key={item.id}>
              <button
                className={`task-checkbox${isDone ? ' done' : ''}`}
                onClick={() => toggleComplete(item)}
                aria-label={isDone ? 'Mark not done' : 'Mark done'}
              >
                {isDone ? '✓' : ''}
              </button>
              <div className="task-info">
                <p className={`task-title${isDone ? ' done' : ''}`}>{item.title}</p>
                <p className="task-meta">
                  {item.assignedTo ? memberNames[item.assignedTo] ?? '…' : 'Either of you'}
                  {item.isRecurring && item.recurrence
                    ? ` · ${formatRecurrence(item.recurrence)}`
                    : ''}
                </p>
              </div>
              {isDone && (
                <button
                  className={`heart-btn${isBursting ? ' just-hearted' : ''}`}
                  onClick={() => canHeart && toggleHeart(item)}
                  disabled={!canHeart}
                  aria-label={iHearted ? 'Remove heart' : 'Send a heart'}
                >
                  <span className="heart-emoji">{item.hearts.length > 0 ? '❤️' : '🤍'}</span>
                  {isBursting && (
                    <>
                      <span className="heart-particle" style={{ left: '38%', animationDelay: '0ms' }}>
                        ❤️
                      </span>
                      <span className="heart-particle" style={{ left: '62%', animationDelay: '80ms' }}>
                        ❤️
                      </span>
                      <span className="heart-particle" style={{ left: '50%', animationDelay: '150ms' }}>
                        ❤️
                      </span>
                    </>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <button className="fab" onClick={() => setShowAddModal(true)} aria-label="Add task">
        +
      </button>

      {showAddModal && (
        <AddTaskModal
          onClose={() => setShowAddModal(false)}
          householdId={householdId!}
          memberIds={household.memberIds}
          memberNames={memberNames}
          createdBy={user!.uid}
        />
      )}
    </>
  );
}

function AddTaskModal({
  onClose,
  householdId,
  memberIds,
  memberNames,
  createdBy,
}: {
  onClose: () => void;
  householdId: string;
  memberIds: string[];
  memberNames: Record<string, string>;
  createdBy: string;
}) {
  const [title, setTitle] = useState('');
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const [isRecurring, setIsRecurring] = useState(false);
  const [unit, setUnit] = useState<RecurrenceUnit>('week');
  const [interval, setInterval] = useState(1);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    if (!title.trim()) {
      setError('Give the task a name.');
      return;
    }
    const newTask: Omit<Task, 'id'> = {
      householdId,
      title: title.trim(),
      notes: null,
      createdBy,
      assignedTo,
      isRecurring,
      recurrence: isRecurring ? { unit, interval } : null,
      dueAt: null,
      completedAt: null,
      completedBy: null,
      hearts: [],
      createdAt: Date.now(),
    };
    await addDoc(collection(db, 'households', householdId, 'tasks'), newTask);
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">New task</h3>

        <div style={{ marginBottom: 16 }}>
          <input
            className="input"
            placeholder="What needs doing?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
        </div>

        <span className="field-label">Assign to</span>
        <div className="chip-row">
          <button
            className={`chip${assignedTo === null ? ' active' : ''}`}
            onClick={() => setAssignedTo(null)}
          >
            Either
          </button>
          {memberIds.map((uid) => (
            <button
              key={uid}
              className={`chip${assignedTo === uid ? ' active' : ''}`}
              onClick={() => setAssignedTo(uid)}
            >
              {memberNames[uid] ?? '…'}
            </button>
          ))}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={isRecurring}
            onChange={(e) => setIsRecurring(e.target.checked)}
            style={{ width: 18, height: 18 }}
          />
          <span className="field-label" style={{ margin: 0 }}>
            Repeats
          </span>
        </label>

        {isRecurring && (
          <>
            <span className="field-label">Quick presets</span>
            <div className="chip-row">
              {([
                { label: 'Daily', unit: 'day', interval: 1 },
                { label: 'Weekly', unit: 'week', interval: 1 },
                { label: 'Biweekly', unit: 'week', interval: 2 },
                { label: 'Monthly', unit: 'month', interval: 1 },
              ] as const).map((p) => (
                <button
                  key={p.label}
                  className={`chip${unit === p.unit && interval === p.interval ? ' active' : ''}`}
                  onClick={() => {
                    setUnit(p.unit as RecurrenceUnit);
                    setInterval(p.interval);
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <span className="field-label">Or customize</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span style={{ fontSize: 14, color: 'var(--color-ink-soft)' }}>Every</span>
              <input
                type="number"
                min={1}
                max={365}
                value={interval}
                onChange={(e) => setInterval(Math.max(1, parseInt(e.target.value) || 1))}
                className="input"
                style={{ width: 70, textAlign: 'center', padding: '10px 8px' }}
              />
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as RecurrenceUnit)}
                className="input"
                style={{ width: 'auto', padding: '10px 12px' }}
              >
                <option value="day">day{interval > 1 ? 's' : ''}</option>
                <option value="week">week{interval > 1 ? 's' : ''}</option>
                <option value="month">month{interval > 1 ? 's' : ''}</option>
              </select>
            </div>
          </>
        )}

        {error && (
          <p style={{ color: 'var(--color-danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>
        )}

        <button className="btn btn-primary btn-block" onClick={handleAdd} style={{ marginBottom: 8 }}>
          Add task
        </button>
        <button className="btn btn-ghost btn-block" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
