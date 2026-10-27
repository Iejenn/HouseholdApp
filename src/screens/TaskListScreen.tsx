import { useEffect, useState } from 'react';
import {
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
import { useHousehold } from '../context/HouseholdContext';
import { useNow } from '../hooks/useNow';
import { TASK_GROUPS, findTaskGroup } from '../data/taskCatalog';
import { isHiddenDone, isTaskDone } from '../lib/time';
import { dutchError } from '../lib/firebaseErrors';
import type { Completion, Recurrence, RecurrenceUnit, Task } from '../types';

// Every check-off earns the household this many cat points
const POINTS_PER_TASK = 1;

const UNIT_LABELS: Record<RecurrenceUnit, [string, string]> = {
  day: ['dag', 'dagen'],
  week: ['week', 'weken'],
  month: ['maand', 'maanden'],
};

function formatRecurrence({ unit, interval }: Recurrence): string {
  if (interval === 1) return unit === 'day' ? 'elke dag' : `elke ${UNIT_LABELS[unit][0]}`;
  if (unit === 'week' && interval === 2) return 'om de week';
  return `elke ${interval} ${UNIT_LABELS[unit][1]}`;
}

export default function TaskListScreen() {
  const { user } = useAuth();
  const { householdId, household, memberNames, balance } = useHousehold();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [burstTaskId, setBurstTaskId] = useState<string | null>(null);
  const [pointPopId, setPointPopId] = useState<string | null>(null);
  const now = useNow();

  useEffect(() => {
    const q = query(
      collection(db, 'households', householdId, 'tasks'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setTasks(snap.docs.map((d) => ({ ...(d.data() as Task), id: d.id })));
    });
    return unsub;
  }, [householdId]);

  async function toggleComplete(task: Task) {
    if (!user) return;
    const ref = doc(db, 'households', householdId, 'tasks', task.id);
    const completionsCol = collection(db, 'households', householdId, 'completions');
    // Task update and point record are written together, so you can't get
    // a point without the task actually being checked off (and vice versa)
    const batch = writeBatch(db);
    if (isTaskDone(task, Date.now())) {
      batch.update(ref, { completedAt: null, completedBy: null });
      // Unchecking takes the point back
      batch.delete(doc(completionsCol, `${task.id}_${task.completedAt}`));
    } else {
      // Also used when a recurring task comes back: the old completion stays,
      // so every round earns a point
      const completedAt = Date.now();
      batch.update(ref, { completedAt, completedBy: user.uid, hearts: [] });
      const completion: Completion = {
        taskId: task.id,
        uid: user.uid,
        points: POINTS_PER_TASK,
        completedAt,
      };
      batch.set(doc(completionsCol, `${task.id}_${completedAt}`), completion);
      setPointPopId(task.id);
      window.setTimeout(() => setPointPopId((cur) => (cur === task.id ? null : cur)), 900);
    }
    await batch.commit();
  }

  async function toggleHeart(task: Task) {
    if (!user) return;
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
        <p style={{ color: 'var(--color-ink-soft)' }}>Huishouden laden…</p>
      </div>
    );
  }

  // Open tasks first, then recently finished ones; finished > 72h ago are hidden
  const withState = tasks.map((t) => ({ task: t, done: isTaskDone(t, now) }));
  const open = withState.filter((t) => !t.done);
  const done = withState.filter((t) => t.done && !isHiddenDone(t.task.completedAt, now));

  return (
    <>
      <div className="app-header">
        <div>
          <h2 className="household-name">{household.name}</h2>
          <span className="invite-code">{household.inviteCode}</span>
        </div>
        <span className="points-pill" title="Punten voor de kat">
          🐾 {balance}
        </span>
      </div>

      <div className="app-content">
        {open.length === 0 && done.length === 0 && (
          <p className="empty-state">Nog geen taken — tik op + om er een toe te voegen.</p>
        )}
        {open.length === 0 && done.length > 0 && (
          <p className="empty-state" style={{ padding: '24px 20px' }}>
            Alles gedaan! 🎉
          </p>
        )}

        {[...open, ...done].map(({ task: item, done: isDone }) => {
          const canHeart = isDone && item.completedBy !== user?.uid;
          const iHearted = user ? item.hearts.includes(user.uid) : false;
          const isBursting = burstTaskId === item.id;
          const group = findTaskGroup(item.category);

          return (
            <div className="task-row" key={item.id}>
              <button
                className={`task-checkbox${isDone ? ' done' : ''}`}
                onClick={() => toggleComplete(item)}
                aria-label={isDone ? 'Markeer als niet gedaan' : 'Markeer als gedaan'}
              >
                {isDone ? '✓' : ''}
                {pointPopId === item.id && <span className="point-pop">+1 🐾</span>}
              </button>
              <div className="task-info">
                <p className={`task-title${isDone ? ' done' : ''}`}>
                  {group && <span className="task-emoji">{group.emoji}</span>}
                  {item.title}
                </p>
                <p className="task-meta">
                  {isDone && item.completedBy
                    ? `Gedaan door ${memberNames[item.completedBy] ?? '…'}`
                    : item.assignedTo
                      ? memberNames[item.assignedTo] ?? '…'
                      : 'Allebei'}
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
                  aria-label={iHearted ? 'Hartje weghalen' : 'Stuur een hartje'}
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

      <button className="fab" onClick={() => setShowAddModal(true)} aria-label="Taak toevoegen">
        +
      </button>

      {showAddModal && (
        <AddTaskModal
          onClose={() => setShowAddModal(false)}
          householdId={householdId}
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
  const [kind, setKind] = useState<'standard' | 'custom'>('standard');
  const [groupId, setGroupId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const [isRecurring, setIsRecurring] = useState(false);
  const [unit, setUnit] = useState<RecurrenceUnit>('week');
  const [interval, setInterval] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const group = TASK_GROUPS.find((g) => g.id === groupId);

  function pickGroup(id: string) {
    setGroupId(id === groupId ? null : id);
    setPicked([]);
    setError(null);
  }

  function togglePicked(item: string) {
    setPicked((cur) => (cur.includes(item) ? cur.filter((i) => i !== item) : [...cur, item]));
    setError(null);
  }

  // Standard: one task per picked item (e.g. Stofzuigen on two floors = 2 tasks)
  const newTitles: { title: string; category: string | null }[] =
    kind === 'custom'
      ? title.trim()
        ? [{ title: title.trim(), category: null }]
        : []
      : group
        ? picked.map((item) => ({ title: group.title(item, group.label), category: group.id }))
        : [];

  async function handleAdd() {
    if (newTitles.length === 0) {
      setError(kind === 'custom' ? 'Geef de taak een naam.' : 'Kies minstens één taak.');
      return;
    }
    setBusy(true);
    try {
      const batch = writeBatch(db);
      const col = collection(db, 'households', householdId, 'tasks');
      const createdAt = Date.now();
      newTitles.forEach((t, i) => {
        const newTask: Omit<Task, 'id'> = {
          householdId,
          title: t.title,
          category: t.category,
          notes: null,
          createdBy,
          assignedTo,
          isRecurring,
          recurrence: isRecurring ? { unit, interval } : null,
          dueAt: null,
          completedAt: null,
          completedBy: null,
          hearts: [],
          // -i keeps the picked order in the (newest-first) list
          createdAt: createdAt - i,
        };
        batch.set(doc(col), newTask);
      });
      await batch.commit();
      onClose();
    } catch (err) {
      setError(dutchError(err, 'Kon de taak niet toevoegen.'));
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Nieuwe taak</h3>

        <div className="segmented" role="tablist">
          <button
            className={`segmented-item${kind === 'standard' ? ' active' : ''}`}
            onClick={() => {
              setKind('standard');
              setError(null);
            }}
          >
            Standaard taak
          </button>
          <button
            className={`segmented-item${kind === 'custom' ? ' active' : ''}`}
            onClick={() => {
              setKind('custom');
              setError(null);
            }}
          >
            Eigen taak
          </button>
        </div>

        {kind === 'standard' ? (
          <>
            <span className="field-label">Ruimte of onderwerp</span>
            <div className="group-grid">
              {TASK_GROUPS.map((g) => (
                <button
                  key={g.id}
                  className={`group-tile${groupId === g.id ? ' active' : ''}`}
                  onClick={() => pickGroup(g.id)}
                >
                  <span className="group-tile-emoji">{g.emoji}</span>
                  {g.label}
                </button>
              ))}
            </div>

            {group && (
              <>
                <span className="field-label">
                  {group.emoji} {group.label} — kies er een of meer
                </span>
                <div className="chip-row">
                  {group.items.map((item) => (
                    <button
                      key={item}
                      className={`chip${picked.includes(item) ? ' active' : ''}`}
                      onClick={() => togglePicked(item)}
                    >
                      {picked.includes(item) ? '✓ ' : ''}
                      {item}
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <div style={{ marginBottom: 16 }}>
            <input
              className="input"
              placeholder="Wat moet er gebeuren?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>
        )}

        <span className="field-label">Voor wie</span>
        <div className="chip-row">
          <button
            className={`chip${assignedTo === null ? ' active' : ''}`}
            onClick={() => setAssignedTo(null)}
          >
            Allebei
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
            Herhalen
          </span>
        </label>

        {isRecurring && (
          <>
            <span className="field-label">Snel kiezen</span>
            <div className="chip-row">
              {([
                { label: 'Dagelijks', unit: 'day', interval: 1 },
                { label: 'Wekelijks', unit: 'week', interval: 1 },
                { label: 'Om de week', unit: 'week', interval: 2 },
                { label: 'Maandelijks', unit: 'month', interval: 1 },
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

            <span className="field-label">Of zelf instellen</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span style={{ fontSize: 14, color: 'var(--color-ink-soft)' }}>Elke</span>
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
                {(['day', 'week', 'month'] as const).map((u) => (
                  <option key={u} value={u}>
                    {UNIT_LABELS[u][interval > 1 ? 1 : 0]}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {error && (
          <p style={{ color: 'var(--color-danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>
        )}

        <button
          className="btn btn-primary btn-block"
          onClick={handleAdd}
          disabled={busy}
          style={{ marginBottom: 8 }}
        >
          {newTitles.length > 1 ? `${newTitles.length} taken toevoegen` : 'Taak toevoegen'}
        </button>
        <button className="btn btn-ghost btn-block" onClick={onClose}>
          Annuleren
        </button>
      </div>
    </div>
  );
}
