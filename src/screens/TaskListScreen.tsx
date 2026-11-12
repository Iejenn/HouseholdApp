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
import { toggleTaskDone } from '../lib/tasks';
import { OTHER_GROUP_COLOR, TASK_GROUPS, findTaskGroup } from '../data/taskCatalog';
import SectionCard from '../components/SectionCard';
import { byDeadline, dayLabel, formatAgo, isHiddenDone, isTaskDone, isTaskLate, isTaskWaiting, startOfDay, taskDeadline } from '../lib/time';
import { formatRecurrence, ordinal, weekdayName } from '../lib/recurrenceText';
import { dayNumber, dayStartMs, hasFixedDays, lastOccurrence, nextOccurrence, weekdayOf } from '../lib/schedule';
import { useUndoCheck } from '../hooks/useUndoCheck';
import { dutchError } from '../lib/firebaseErrors';
import type { Recurrence, RecurrenceUnit, Task } from '../types';
import { t } from '../i18n';


const UNIT_LABELS: Record<RecurrenceUnit, [string, string]> = {
  day: ['dag', 'dagen'],
  week: ['week', 'weken'],
  month: ['maand', 'maanden'],
};

type RepeatPreset = 'day' | 'week' | '2week' | 'month' | 'custom';

const PRESETS: { id: RepeatPreset; label: string }[] = [
  { id: 'day', label: 'Dagelijks' },
  { id: 'week', label: 'Wekelijks' },
  { id: '2week', label: 'Om de week' },
  { id: 'month', label: 'Maandelijks' },
  { id: 'custom', label: 'Anders…' },
];

// Which quick choice an existing schedule belongs to
function presetOf(r: Recurrence | null): RepeatPreset {
  if (!r) return 'week';
  if (r.interval === 1 && r.unit !== 'day') return r.unit;
  if (r.interval === 1 && r.unit === 'day') return 'day';
  if (r.unit === 'week' && r.interval === 2) return '2week';
  return 'custom';
}

// The schedule without its start day, to see if the days were changed
function patternKey(r: Recurrence): string {
  return JSON.stringify([r.unit, r.interval, r.weekdays ?? null, r.monthDay ?? null, r.monthWeek ?? null, r.monthWeekday ?? null]);
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const SHORT_DAYS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];

export default function TaskListScreen() {
  const { user } = useAuth();
  const { householdId, household, memberNames, balance } = useHousehold();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [burstTaskId, setBurstTaskId] = useState<string | null>(null);
  const [pointPopId, setPointPopId] = useState<string | null>(null);
  const now = useNow();
  const undoCheck = useUndoCheck(tasks, householdId, user?.uid);

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
    // Show the +1 straight away; the write itself is in lib/tasks
    if (!isTaskDone(task, Date.now())) {
      setPointPopId(task.id);
      window.setTimeout(() => setPointPopId((cur) => (cur === task.id ? null : cur)), 900);
      undoCheck.checked(task);
    }
    await toggleTaskDone(householdId, user.uid, task);
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
        <p style={{ color: 'var(--color-ink-soft)' }}>{t('Huishouden laden…')}</p>
      </div>
    );
  }

  const visible = tasks.filter((t) => t.id !== swipe.pending?.id);
  const open = visible.filter((t) => !isTaskDone(t, now));
  // Finished more than 72h ago: hidden (recurring ones return when due)
  const done = visible.filter((t) => isTaskDone(t, now) && !isHiddenDone(t.completedAt, now));

  // Open tasks per room/topic, in catalog order, custom tasks without a room last.
  // Within a room the overdue (red) ones come first, then the nearest deadline.
  const sections = [...TASK_GROUPS.map((g) => g.id), null].flatMap((groupId) => {
    const inGroup = open.filter((t) =>
      groupId === null ? !findTaskGroup(t.category) : t.category === groupId
    );
    if (inGroup.length === 0) return [];
    inGroup.sort((x, y) => Number(isTaskLate(y, now)) - Number(isTaskLate(x, now)) || byDeadline(x, y));
    return [{ groupId, tasks: inGroup }];
  });

  function renderTask(item: Task, isDone: boolean) {
    const canHeart = isDone && item.completedBy !== user?.uid;
    const iHearted = user ? item.hearts.includes(user.uid) : false;
    const isBursting = burstTaskId === item.id;
    const group = findTaskGroup(item.category);
    const recurring = item.isRecurring && item.recurrence;
    const late = !isDone && isTaskLate(item, now);
    const waiting = isTaskWaiting(item, now);
    const who = item.assignedTo ? memberNames[item.assignedTo] ?? '…' : t('Allebei');
    const doneBy = item.completedBy ? memberNames[item.completedBy] ?? '…' : '…';

    // Recurring tasks show when they were last done instead of being struck through
    let meta: ReactNode;
    if (recurring && hasFixedDays(item.recurrence)) {
      // Fixed day: open ones show the day they were for (orange today, red
      // after), done ones when they come back
      const r = item.recurrence;
      const deadline = taskDeadline(item, now);
      const next = nextOccurrence(dayNumber(now), r);
      const nextText = next !== null ? t('volgende: {date}', { date: dayLabel(dayStartMs(next), now) }) : '';
      meta = deadline ? (
        <>
          {who} · {formatRecurrence(r)} · <span className={`deadline-${deadline.tone}`}>📅 {deadline.text}</span>
        </>
      ) : (
        <>
          {item.completedAt && !isTaskWaiting(item, now)
            ? t('{when} gedaan door {name}', { when: formatAgo(item.completedAt, now), name: doneBy })
            : formatRecurrence(r)}
          {nextText && ` · ${nextText}`}
        </>
      );
    } else if (recurring) {
      const lastDone = item.completedAt
        ? isDone
          ? t('{when} gedaan door {name}', { when: formatAgo(item.completedAt, now), name: doneBy })
          : t('laatst {when}', { when: formatAgo(item.completedAt, now) })
        : t('nog nooit gedaan');
      meta = (
        <>
          {!isDone && `${who} · `}
          {formatRecurrence(item.recurrence!)} ·{' '}
          <span className={late ? 'task-late-text' : undefined}>{lastDone}</span>
        </>
      );
    } else if (!isDone && item.dueAt != null) {
      // One-off task with a deadline: grey, orange on the day, red when missed
      const deadline = taskDeadline(item, now)!;
      meta = (
        <>
          {who} · <span className={`deadline-${deadline.tone}`}>📅 {deadline.text}</span>
        </>
      );
    } else {
      meta = isDone ? t('Gedaan door {name}', { name: doneBy }) : who;
    }
    // Show for a day that someone asked for this to be done
    if (!isDone && item.lastNudgedAt && now - item.lastNudgedAt < 24 * 60 * 60 * 1000) {
      meta = (
        <>
          {meta} · <span className="task-nudged">{t('👉 gepord')}</span>
        </>
      );
    }

    return (
      <SwipeToDelete
        key={item.id}
        onDelete={() => swipe.remove(item)}
        onSwipeLeft={() => setEditingTask(item)}
        leftLabel={t('✏️ Bewerken · 👉 Porren')}
      >
        <div className={`task-row${late ? ' late' : ''}`}>
          <button
            className={`task-checkbox${isDone ? ' done' : ''}`}
            onClick={() => toggleComplete(item)}
            // Before its first scheduled day there's nothing to check off yet
            disabled={waiting}
            aria-label={waiting ? t('Nog niet aan de beurt') : isDone ? t('Markeer als niet gedaan') : t('Markeer als gedaan')}
          >
            {isDone && !waiting ? '✓' : ''}
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
          {/* Nobody did it yet (fixed-day task before its first day): no heart */}
          {isDone && !(waiting && !item.completedAt) && (
            <button
              className={`heart-btn${isBursting ? ' just-hearted' : ''}`}
              onClick={() => canHeart && toggleHeart(item)}
              disabled={!canHeart}
              aria-label={iHearted ? t('Hartje weghalen') : t('Stuur een hartje')}
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
        <span className="points-pill" title={t('Punten voor de kat')}>
          🐾 {balance}
        </span>
      </div>

      <div className="app-content">
        {open.length === 0 && done.length === 0 && (
          <p className="empty-state">{t('Nog geen taken — tik op + om er een toe te voegen.')}</p>
        )}
        {open.length === 0 && done.length > 0 && (
          <p className="empty-state" style={{ padding: '24px 20px' }}>
            {t('Alles gedaan! 🎉')}
          </p>
        )}

        {/* Side-by-side columns on wide screens */}
        <div className="card-columns">
          {/* One card per room, with a coloured header like the week menu */}
          {sections.map(({ groupId, tasks: groupTasks }) => {
            const group = findTaskGroup(groupId);
            const lateCount = groupTasks.filter((t) => isTaskLate(t, now)).length;
            return (
              <SectionCard
                key={groupId ?? 'overig'}
                color={group?.color ?? OTHER_GROUP_COLOR}
                title={group ? `${group.emoji} ${t(group.label)}` : t('📌 Overig')}
                aside={
                  <span className={`section-count${lateCount ? ' late' : ''}`}>
                    {lateCount ? `${t('{n} te laat', { n: lateCount })} · ` : ''}
                    {groupTasks.length}
                  </span>
                }
              >
                {groupTasks.map((t) => renderTask(t, false))}
              </SectionCard>
            );
          })}

          {done.length > 0 && (
            <SectionCard
              color="#e9e6e0"
              title={t('✓ Gedaan')}
              aside={<span className="section-count">{done.length}</span>}
            >
              {done.map((t) => renderTask(t, true))}
            </SectionCard>
          )}
        </div>
        
        {tasks.length > 0 && (
          <p className="swipe-hint">
            {t('Swipe naar rechts om te verwijderen, naar links om te bewerken of te porren')}
          </p>
        )}
      </div>

      {swipe.pending && <UndoToast label={swipe.pending.title} onUndo={swipe.undo} />}
      {!swipe.pending && undoCheck.pending && (
        <UndoToast label={undoCheck.pending.title} action="afgevinkt" onUndo={undoCheck.undo} />
      )}

      <button className="fab" onClick={() => setShowAddModal(true)} aria-label={t('Taak toevoegen')}>
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
  const r0 = editing?.recurrence ?? null;
  // Which quick choice is active; anything else is "Anders…"
  const [preset, setPreset] = useState<RepeatPreset>(presetOf(r0));
  const [unit, setUnit] = useState<RecurrenceUnit>(r0?.unit ?? 'week');
  // Kept as text so the field can be emptied while typing (a number state
  // snapped straight back to 1, so you couldn't delete the digit)
  const [intervalText, setIntervalText] = useState(String(r0?.interval ?? 1));
  const interval = Math.min(365, Math.max(1, parseInt(intervalText) || 1));
  // Fixed days (optional). Month defaults come from today, so picking
  // "Datum" or "Weekdag" starts at something sensible.
  const today = dayNumber(Date.now());
  const [weekdays, setWeekdays] = useState<number[]>(r0?.weekdays ?? []);
  const [monthMode, setMonthMode] = useState<'free' | 'date' | 'weekday'>(
    r0?.monthDay != null ? 'date' : r0?.monthWeek != null ? 'weekday' : 'free'
  );
  const [monthDay, setMonthDay] = useState(r0?.monthDay ?? new Date().getDate());
  const [monthWeek, setMonthWeek] = useState(r0?.monthWeek ?? Math.min(4, Math.ceil(new Date().getDate() / 7)));
  const [monthWeekday, setMonthWeekday] = useState(r0?.monthWeekday ?? weekdayOf(today));
  // Room for a custom task, so it lands in the right section of the list
  const [customCategory, setCustomCategory] = useState<string | null>(editing?.category ?? null);
  // Deadline (one-off tasks only): start of the chosen day, or null
  const [dueAt, setDueAt] = useState<number | null>(editing?.dueAt ?? null);
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
        setNudgeError(t('Je partner heeft porren uitgezet, of nog geen meldingen aan.'));
      }
    } catch (err) {
      setNudgeState('idle');
      setNudgeError(dutchError(err, t('Porren lukte niet.')));
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
        ? picked.map((item) => ({ title: group.title(t(item), t(group.label)), category: group.id }))
        : [];

  // The schedule as saved on the task. Fields are left out rather than set
  // to undefined (Firestore refuses undefined values).
  function buildRecurrence(): Recurrence {
    let r: Recurrence;
    if (preset === 'day') r = { unit: 'day', interval: 1 };
    else if (preset === 'week' || preset === '2week') r = { unit: 'week', interval: preset === 'week' ? 1 : 2 };
    else if (preset === 'month') {
      r = { unit: 'month', interval: 1 };
      if (monthMode === 'date') r.monthDay = monthDay;
      if (monthMode === 'weekday') Object.assign(r, { monthWeek, monthWeekday });
    } else r = { unit, interval };
    if (r.unit === 'week' && preset !== 'day' && weekdays.length > 0) r.weekdays = [...weekdays].sort((a, b) => a - b);
    if (hasFixedDays(r)) {
      // Same days as before: keep the old start, so "om de week" doesn't
      // shift a week just because the task was renamed
      const same = r0 && hasFixedDays(r0) && patternKey(r0) === patternKey(r);
      r.startDay = same && r0.startDay != null ? r0.startDay : today;
    }
    return r;
  }
  const recurrence = buildRecurrence();
  const fixed = hasFixedDays(recurrence);
  // First scheduled day from today, for "Volgende: ma 16 nov"
  const firstDay = fixed
    ? lastOccurrence(today, recurrence) === today
      ? today
      : nextOccurrence(today, recurrence)
    : null;

  async function handleAdd() {
    if (newTitles.length === 0) {
      setError(kind === 'custom' ? t('Geef de taak een naam.') : t('Kies minstens één taak.'));
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
          recurrence: isRecurring ? recurrence : null,
          // Recurring tasks have their own rhythm, so no deadline
          dueAt: isRecurring ? null : dueAt,
        });
        onClose();
      } catch (err) {
        setError(dutchError(err, t('Opslaan lukte niet.')));
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
          recurrence: isRecurring ? recurrence : null,
          dueAt: isRecurring ? null : dueAt,
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
      setError(dutchError(err, t('Kon de taak niet toevoegen.')));
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{editing ? t('Taak bewerken') : t('Nieuwe taak')}</h3>

        {editing && partner && (
          <div className="nudge-box">
            <button
              className="btn btn-secondary btn-block"
              onClick={handleNudge}
              disabled={nudgeState !== 'idle'}
            >
              {nudgeState === 'sent'
                ? t('✓ {name} is gepord', { name: memberNames[partner] ?? t('Je partner') })
                : nudgeState === 'busy'
                  ? t('Even geduld…')
                  : t('👉 Por {name}', { name: memberNames[partner] ?? t('je partner') })}
            </button>
            <p className="settings-note" style={{ margin: '6px 0 0' }}>
              {nudgeError ??
                t('{name} krijgt een melding: "Kun je dit doen? 🙏"', { name: memberNames[partner] ?? t('Je partner') })}
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
              {t('Standaard taak')}
            </button>
            <button
              className={`segmented-item${kind === 'custom' ? ' active' : ''}`}
              onClick={() => {
                setKind('custom');
                setError(null);
              }}
            >
              {t('Eigen taak')}
            </button>
          </div>
        )}

        {kind === 'standard' ? (
          <>
            <span className="field-label">{t('Ruimte of onderwerp')}</span>
            <div className="group-grid">
              {TASK_GROUPS.map((g) => (
                <button
                  key={g.id}
                  className={`group-tile${groupId === g.id ? ' active' : ''}`}
                  onClick={() => pickGroup(g.id)}
                >
                  <span className="group-tile-emoji">{g.emoji}</span>
                  {t(g.label)}
                </button>
              ))}
            </div>

            {group && (
              <>
                <span className="field-label">
                  {group.emoji} {t('{group} — kies er een of meer', { group: t(group.label) })}
                </span>
                <div className="chip-row">
                  {group.items.map((item) => (
                    <button
                      key={item}
                      className={`chip${picked.includes(item) ? ' active' : ''}`}
                      onClick={() => togglePicked(item)}
                    >
                      {picked.includes(item) ? '✓ ' : ''}
                      {t(item)}
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
                placeholder={t('Wat moet er gebeuren?')}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />
            </div>
            <span className="field-label">{t('Ruimte of onderwerp')}</span>
            <div className="chip-row">
              <button
                className={`chip${customCategory === null ? ' active' : ''}`}
                onClick={() => setCustomCategory(null)}
              >
                {t('📌 Overig')}
              </button>
              {TASK_GROUPS.map((g) => (
                <button
                  key={g.id}
                  className={`chip${customCategory === g.id ? ' active' : ''}`}
                  onClick={() => setCustomCategory(g.id)}
                >
                  {g.emoji} {t(g.label)}
                </button>
              ))}
            </div>
          </>
        )}

        <span className="field-label">{t('Voor wie')}</span>
        <div className="chip-row">
          <button
            className={`chip${assignedTo === null ? ' active' : ''}`}
            onClick={() => setAssignedTo(null)}
          >
            {t('Allebei')}
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
            {t('Herhalen')}
          </span>
        </label>

        {!isRecurring && <DeadlinePicker value={dueAt} onChange={setDueAt} />}

        {isRecurring && (
          <>
            <span className="field-label">{t('Hoe vaak?')}</span>
            <div className="chip-row">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  className={`chip${preset === p.id ? ' active' : ''}`}
                  onClick={() => setPreset(p.id)}
                >
                  {t(p.label)}
                </button>
              ))}
            </div>

            {/* Extra choices only for the picked option, in one quiet panel */}
            {preset === 'custom' && (
              <div className="repeat-detail">
                <div className="repeat-sentence">
                  <span>{t('Elke')}</span>
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
                    style={{ width: 70, textAlign: 'center' }}
                  />
                  <select value={unit} onChange={(e) => setUnit(e.target.value as RecurrenceUnit)} className="input">
                    {(['day', 'week', 'month'] as const).map((u) => (
                      <option key={u} value={u}>
                        {t(UNIT_LABELS[u][interval > 1 ? 1 : 0])}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {(preset === 'week' || preset === '2week' || (preset === 'custom' && unit === 'week')) && (
              <div className="repeat-detail">
                <span className="field-label">
                  {t('Op welke dag?')} <span className="field-label-soft">{t('(optioneel)')}</span>
                </span>
                <div className="day-picker">
                  {SHORT_DAYS.map((d, i) => (
                    <button
                      key={d}
                      className={`weekday-btn${weekdays.includes(i) ? ' active' : ''}`}
                      onClick={() => setWeekdays((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]))}
                      aria-pressed={weekdays.includes(i)}
                      aria-label={weekdayName(i)}
                    >
                      {t(d)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {preset === 'month' && (
              <div className="repeat-detail">
                <div className="segmented" role="radiogroup">
                  {([
                    ['free', 'Na afvinken'],
                    ['date', 'Datum'],
                    ['weekday', 'Weekdag'],
                  ] as const).map(([id, label]) => (
                    <button
                      key={id}
                      role="radio"
                      aria-checked={monthMode === id}
                      className={`segmented-item${monthMode === id ? ' active' : ''}`}
                      onClick={() => setMonthMode(id)}
                    >
                      {t(label)}
                    </button>
                  ))}
                </div>
                {monthMode === 'date' && (
                  <div className="repeat-sentence">
                    <span>{t('Op de')}</span>
                    <select value={monthDay} onChange={(e) => setMonthDay(Number(e.target.value))} className="input">
                      {Array.from({ length: 31 }, (_, i) => (
                        <option key={i} value={i + 1}>
                          {ordinal(i + 1)}
                        </option>
                      ))}
                      <option value={-1}>{t('laatste dag')}</option>
                    </select>
                    <span>{t('van de maand')}</span>
                  </div>
                )}
                {monthMode === 'weekday' && (
                  <div className="repeat-sentence">
                    <span>{t('Op de')}</span>
                    <select value={monthWeek} onChange={(e) => setMonthWeek(Number(e.target.value))} className="input">
                      {[1, 2, 3, 4, -1].map((n) => (
                        <option key={n} value={n}>
                          {n === -1 ? t('laatste') : ordinal(n)}
                        </option>
                      ))}
                    </select>
                    <select value={monthWeekday} onChange={(e) => setMonthWeekday(Number(e.target.value))} className="input">
                      {SHORT_DAYS.map((d, i) => (
                        <option key={d} value={i}>
                          {weekdayName(i)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {monthMode === 'date' && monthDay > 28 && (
                  <p className="repeat-hint">{t('Heeft een maand geen {nth}? Dan de laatste dag.', { nth: ordinal(monthDay) })}</p>
                )}
              </div>
            )}

            {/* What you picked, in one sentence (like Outlook) */}
            <div className="repeat-summary">
              <span aria-hidden="true">🔁</span>
              <div>
                <strong>{capitalize(formatRecurrence(recurrence))}</strong>
                {fixed && firstDay !== null && (
                  <span className="repeat-summary-sub">{t('Volgende: {date}', { date: dayLabel(dayStartMs(firstDay), Date.now()) })}</span>
                )}
                {!fixed && preset !== 'day' && (
                  <span className="repeat-summary-sub">{t('Gerekend vanaf het afvinken')}</span>
                )}
              </div>
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
          {editing ? t('Opslaan') : newTitles.length > 1 ? t('{n} taken toevoegen', { n: newTitles.length }) : t('Taak toevoegen')}
        </button>
        <button className="btn btn-ghost btn-block" onClick={onClose}>
          {t('Annuleren')}
        </button>
      </div>
    </div>
  );
}

// "Uiterlijk op": quick picks plus a date field for anything else
function DeadlinePicker({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const today = startOfDay(Date.now());
  const plus = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return d.getTime();
  };
  // Saturday of this week (today when it's already weekend)
  const weekday = today.getDay();
  const weekend = plus(weekday === 0 ? 0 : weekday === 6 ? 0 : 6 - weekday);
  const picks = [
    { label: t('Geen'), value: null },
    { label: t('Vandaag'), value: plus(0) },
    { label: t('Morgen'), value: plus(1) },
    { label: t('Dit weekend'), value: weekend },
    { label: t('Over een week'), value: plus(7) },
  ];
  // <input type="date"> works with "YYYY-MM-DD" in local time
  const pad = (n: number) => String(n).padStart(2, '0');
  const asInput = (ms: number) => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  return (
    <>
      <span className="field-label">{t('Uiterlijk op')}</span>
      <div className="chip-row">
        {picks.map((p) => (
          <button
            key={p.label}
            className={`chip${value === p.value ? ' active' : ''}`}
            onClick={() => onChange(p.value)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <input
        type="date"
        className="input deadline-input"
        value={value != null ? asInput(value) : ''}
        min={asInput(today.getTime())}
        onChange={(e) => {
          const [y, m, d] = e.target.value.split('-').map(Number);
          onChange(e.target.value ? new Date(y, m - 1, d).getTime() : null);
        }}
      />
    </>
  );
}
