import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
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
import SwipeToDelete from '../components/SwipeToDelete';
import UndoToast from '../components/UndoToast';
import { useUndoableDelete } from '../hooks/useUndoableDelete';
import { nudgeTask } from '../lib/push';
import { TASK_GROUPS, findTaskGroup } from '../data/taskCatalog';
import { formatAgo, isHiddenDone, isTaskDone, isTaskLate } from '../lib/time';
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
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [burstTaskId, setBurstTaskId] = useState<string | null>(null);
  const [pointPopId, setPointPopId] = useState<string | null>(null);
  const now = useNow();

  // Deleting the task doc itself, so a recurring task never comes back.
  // Points already earned with it are kept.
  const swipe = useUndoableDelete<Task>((task) => {
    deleteDoc(doc(db, 'households', householdId, 'tasks', task.id)).catch((err) =>
      console.error('Failed to delete task', err)
    );
  });

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
      // Unchecking: put back the check-off before this one (keeps "laatst gedaan")
      batch.update(ref, {
        completedAt: task.previousCompletedAt ?? null,
        completedBy: task.previousCompletedBy ?? null,
        previousCompletedAt: null,
        previousCompletedBy: null,
      });
      // ...and take the point back
      batch.delete(doc(completionsCol, `${task.id}_${task.completedAt}`));
    } else {
      // Also used when a recurring task comes back: the old completion stays,
      // so every round earns a point
      const completedAt = Date.now();
      batch.update(ref, {
        completedAt,
        completedBy: user.uid,
        previousCompletedAt: task.completedAt ?? null,
        previousCompletedBy: task.completedBy ?? null,
        hearts: [],
      });
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

  const visible = tasks.filter((t) => t.id !== swipe.pending?.id);
  const open = visible.filter((t) => !isTaskDone(t, now));
  // Finished more than 72h ago: hidden (recurring ones return when due)
  const done = visible.filter((t) => isTaskDone(t, now) && !isHiddenDone(t.completedAt, now));

  // Open tasks per room/topic, in catalog order, custom tasks without a room last.
  // Within a room the overdue (red) ones come first.
  const sections = [...TASK_GROUPS.map((g) => g.id), null].flatMap((groupId) => {
    const inGroup = open.filter((t) =>
      groupId === null ? !findTaskGroup(t.category) : t.category === groupId
    );
    if (inGroup.length === 0) return [];
    inGroup.sort((x, y) => Number(isTaskLate(y, now)) - Number(isTaskLate(x, now)));
    return [{ groupId, tasks: inGroup }];
  });

  function renderTask(item: Task, isDone: boolean) {
    const canHeart = isDone && item.completedBy !== user?.uid;
    const iHearted = user ? item.hearts.includes(user.uid) : false;
    const isBursting = burstTaskId === item.id;
    const group = findTaskGroup(item.category);
    const recurring = item.isRecurring && item.recurrence;
    const late = !isDone && isTaskLate(item, now);
    const who = item.assignedTo ? memberNames[item.assignedTo] ?? '…' : 'Allebei';
    const doneBy = item.completedBy ? memberNames[item.completedBy] ?? '…' : '…';

    // Recurring tasks show when they were last done instead of being struck through
    let meta: ReactNode;
    if (recurring) {
      const lastDone = item.completedAt
        ? isDone
          ? `${formatAgo(item.completedAt, now)} gedaan door ${doneBy}`
          : `laatst ${formatAgo(item.completedAt, now)}`
        : 'nog nooit gedaan';
      meta = (
        <>
          {!isDone && `${who} · `}
          {formatRecurrence(item.recurrence!)} ·{' '}
          <span className={late ? 'task-late-text' : undefined}>{lastDone}</span>
        </>
      );
    } else {
      meta = isDone ? `Gedaan door ${doneBy}` : who;
    }
    // Show for a day that someone asked for this to be done
    if (!isDone && item.lastNudgedAt && now - item.lastNudgedAt < 24 * 60 * 60 * 1000) {
      meta = (
        <>
          {meta} · <span className="task-nudged">👉 gepord</span>
        </>
      );
    }

    return (
      <SwipeToDelete
        key={item.id}
        onDelete={() => swipe.remove(item)}
        onSwipeLeft={() => setEditingTask(item)}
        leftLabel="✏️ Bewerken · 👉 Porren"
      >
        <div className={`task-row${late ? ' late' : ''}`}>
          <button
            className={`task-checkbox${isDone ? ' done' : ''}`}
            onClick={() => toggleComplete(item)}
            aria-label={isDone ? 'Markeer als niet gedaan' : 'Markeer als gedaan'}
          >
            {isDone ? '✓' : ''}
            {pointPopId === item.id && <span className="point-pop">+1 🐾</span>}
          </button>
          <div className="task-info">
            <p className={`task-title${isDone && !recurring ? ' done' : ''}`}>
              {/* Open tasks sit under their room header, so only done ones need the emoji */}
              {isDone && group && <span className="task-emoji">{group.emoji}</span>}
              {item.title}
            </p>
            <p className="task-meta">{meta}</p>
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
      </SwipeToDelete>
    );
  }

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

        {sections.map(({ groupId, tasks: groupTasks }) => {
          const group = findTaskGroup(groupId);
          const lateCount = groupTasks.filter((t) => isTaskLate(t, now)).length;
          return (
            <section key={groupId ?? 'overig'} className="task-section">
              <p className="section-label task-section-label">
                <span>{group ? `${group.emoji} ${group.label}` : '📌 Overig'}</span>
                <span className={`section-count${lateCount ? ' late' : ''}`}>
                  {lateCount ? `${lateCount} te laat · ` : ''}
                  {groupTasks.length}
                </span>
              </p>
              {groupTasks.map((t) => renderTask(t, false))}
            </section>
          );
        })}

        {done.length > 0 && (
          <section className="task-section">
            <p className="section-label task-section-label">
              <span>✓ Gedaan</span>
              <span className="section-count">{done.length}</span>
            </p>
            {done.map((t) => renderTask(t, true))}
          </section>
        )}

        {tasks.length > 0 && (
          <p className="swipe-hint">
            Swipe naar rechts om te verwijderen, naar links om te bewerken of te porren
          </p>
        )}
      </div>

      {swipe.pending && <UndoToast label={swipe.pending.title} onUndo={swipe.undo} />}

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

      {editingTask && (
        <AddTaskModal
          // key: fresh form state for each task
          key={editingTask.id}
          onClose={() => setEditingTask(null)}
          householdId={householdId}
          memberIds={household.memberIds}
          memberNames={memberNames}
          createdBy={user!.uid}
          editing={editingTask}
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
  editing,
}: {
  onClose: () => void;
  householdId: string;
  memberIds: string[];
  memberNames: Record<string, string>;
  createdBy: string;
  // Set when opened by swiping a task left: edit that task instead of adding
  editing?: Task;
}) {
  // Editing always uses the simple form (name + room), also for standard tasks
  const [kind, setKind] = useState<'standard' | 'custom'>(editing ? 'custom' : 'standard');
  const [groupId, setGroupId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState(editing?.title ?? '');
  const [assignedTo, setAssignedTo] = useState<string | null>(editing?.assignedTo ?? null);
  const [isRecurring, setIsRecurring] = useState(editing?.isRecurring ?? false);
  const [unit, setUnit] = useState<RecurrenceUnit>(editing?.recurrence?.unit ?? 'week');
  // Kept as text so the field can be emptied while typing (a number state
  // snapped straight back to 1, so you couldn't delete the digit)
  const [intervalText, setIntervalText] = useState(String(editing?.recurrence?.interval ?? 1));
  const interval = Math.min(365, Math.max(1, parseInt(intervalText) || 1));
  // Room for a custom task, so it lands in the right section of the list
  const [customCategory, setCustomCategory] = useState<string | null>(editing?.category ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nudgeState, setNudgeState] = useState<'idle' | 'busy' | 'sent'>('idle');
  const [nudgeError, setNudgeError] = useState<string | null>(null);
  const partner = memberIds.find((uid) => uid !== createdBy);

  async function handleNudge() {
    if (!editing) return;
    setNudgeState('busy');
    setNudgeError(null);
    try {
      const ok = await nudgeTask(householdId, editing.id);
      if (ok) setNudgeState('sent');
      else {
        setNudgeState('idle');
        setNudgeError('Je partner heeft porren uitgezet, of nog geen meldingen aan.');
      }
    } catch (err) {
      setNudgeState('idle');
      setNudgeError(dutchError(err, 'Porren lukte niet.'));
    }
  }

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
        ? [{ title: title.trim(), category: customCategory }]
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
    if (editing) {
      try {
        await updateDoc(doc(db, 'households', householdId, 'tasks', editing.id), {
          title: newTitles[0].title,
          category: newTitles[0].category,
          assignedTo,
          isRecurring,
          recurrence: isRecurring ? { unit, interval } : null,
        });
        onClose();
      } catch (err) {
        setError(dutchError(err, 'Opslaan lukte niet.'));
        setBusy(false);
      }
      return;
    }
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
        <h3 className="modal-title">{editing ? 'Taak bewerken' : 'Nieuwe taak'}</h3>

        {editing && partner && (
          <div className="nudge-box">
            <button
              className="btn btn-secondary btn-block"
              onClick={handleNudge}
              disabled={nudgeState !== 'idle'}
            >
              {nudgeState === 'sent'
                ? `✓ ${memberNames[partner] ?? 'Je partner'} is gepord`
                : nudgeState === 'busy'
                  ? 'Even geduld…'
                  : `👉 Por ${memberNames[partner] ?? 'je partner'}`}
            </button>
            <p className="settings-note" style={{ margin: '6px 0 0' }}>
              {nudgeError ??
                `${memberNames[partner] ?? 'Je partner'} krijgt een melding: "Kun je dit doen? 🙏"`}
            </p>
          </div>
        )}

        {!editing && (
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
        )}

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
          <>
            <div style={{ marginBottom: 16 }}>
              <input
                className="input"
                placeholder="Wat moet er gebeuren?"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />
            </div>
            <span className="field-label">Ruimte of onderwerp</span>
            <div className="chip-row">
              <button
                className={`chip${customCategory === null ? ' active' : ''}`}
                onClick={() => setCustomCategory(null)}
              >
                📌 Overig
              </button>
              {TASK_GROUPS.map((g) => (
                <button
                  key={g.id}
                  className={`chip${customCategory === g.id ? ' active' : ''}`}
                  onClick={() => setCustomCategory(g.id)}
                >
                  {g.emoji} {g.label}
                </button>
              ))}
            </div>
          </>
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
                    setIntervalText(String(p.interval));
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
                inputMode="numeric"
                value={intervalText}
                onChange={(e) => setIntervalText(e.target.value.replace(/\D/g, '').slice(0, 3))}
                // Left empty or 0: fall back to 1 when leaving the field
                onBlur={() => setIntervalText(String(interval))}
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
          {editing ? 'Opslaan' : newTitles.length > 1 ? `${newTitles.length} taken toevoegen` : 'Taak toevoegen'}
        </button>
        <button className="btn btn-ghost btn-block" onClick={onClose}>
          Annuleren
        </button>
      </div>
    </div>
  );
}
