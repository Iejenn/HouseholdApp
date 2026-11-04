import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '../context/AuthContext';
import { useHousehold } from '../context/HouseholdContext';
import { useNow } from '../hooks/useNow';
import { useRecipesState } from '../hooks/useRecipes';
import SectionCard from '../components/SectionCard';
import WeatherLocationPicker from '../components/WeatherLocationPicker';
import { computeCat } from '../data/catShop';
import { findTaskGroup } from '../data/taskCatalog';
import { cachedForecast, describeWeather, fetchForecast } from '../lib/weather';
import type { Forecast } from '../lib/weather';
import { resolveDay } from '../lib/menu';
import { DAY_KEYS, weekId } from '../lib/week';
import { byDeadline, formatDeadline, isTaskDone, isTaskLate } from '../lib/time';
import { activeVacation, setVacation } from '../lib/vacation';
import { useUndoCheck } from '../hooks/useUndoCheck';
import UndoToast from '../components/UndoToast';
import { toggleTaskDone } from '../lib/tasks';
import { dutchError } from '../lib/firebaseErrors';
import { cachedEvents, fetchEvents } from '../lib/calendar';
import { releaseSplash } from '../lib/splash';
import type { CalendarEvent, GroceryItem, Task, WeekMenu } from '../types';
import { REACTIONS, REPLY_MAX, addReply, handwriting, sortedReplies, toggleReaction } from '../lib/notes';
import type { Note } from '../lib/notes';

export type HomeTarget = 'tasks' | 'groceries' | 'menu' | 'cat';

const WEEKDAYS = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
const SHORT_DAYS = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

// Post-it colours to pick from
const NOTE_COLORS = ['#fdf0a6', '#fbd3dc', '#cfe6f7', '#d6efd0', '#fde0c2'];


function greeting(hour: number): string {
  if (hour < 6) return 'Goedenacht';
  if (hour < 12) return 'Goedemorgen';
  if (hour < 18) return 'Goedemiddag';
  return 'Goedenavond';
}

function shortAgo(ms: number, now: number): string {
  const mins = Math.floor((now - ms) / 60000);
  if (mins < 1) return 'zojuist';
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} u`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'gisteren' : `${days} dagen`;
}

// Small, stable tilt per note, so the board looks hand-stuck
function tilt(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return ((Math.abs(h) % 7) - 3) * 0.8;
}

// Home: today at a glance plus the post-it board (which replaces the chat)
export default function HomeScreen({ onNavigate }: { onNavigate: (to: HomeTarget) => void }) {
  const { user, profile } = useAuth();
  const { householdId, household, purchases, memberNames, ready: householdReady } = useHousehold();
  const { recipes, loaded: recipesLoaded } = useRecipesState(householdId);
  // Which first loads are in; the loading screen waits for all of them
  const [loaded, setLoaded] = useState({ tasks: false, groceries: false, menu: false, notes: false });
  const markLoaded = (part: keyof typeof loaded) =>
    setLoaded((cur) => (cur[part] ? cur : { ...cur, [part]: true }));
  const now = useNow();
  const today = new Date(now);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [groceries, setGroceries] = useState<GroceryItem[]>([]);
  const [menu, setMenu] = useState<WeekMenu | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [showAllNotes, setShowAllNotes] = useState(false);
  const [writing, setWriting] = useState(false);
  // Post-it opened to react or reply (by id, so it stays live while open)
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [freshForecast, setForecast] = useState<Forecast | null>(null);
  const [weatherError, setWeatherError] = useState(false);
  const [pickingPlace, setPickingPlace] = useState(false);
  // Starts with the last visit's events, so the card is there right away
  const [agenda, setAgenda] = useState<{ linked: number; events: CalendarEvent[] } | null>(cachedEvents);
  const undoCheck = useUndoCheck(tasks, householdId, user?.uid);
  const vacation = activeVacation(household);

  useEffect(() => {
    const unsubs = [
      onSnapshot(collection(db, 'households', householdId, 'tasks'), (snap) => {
        setTasks(snap.docs.map((d) => ({ ...(d.data() as Task), id: d.id })));
        markLoaded('tasks');
      }),
      // Only the open ones: that's all the tile shows (not the whole history)
      onSnapshot(query(collection(db, 'households', householdId, 'groceries'), where('checkedAt', '==', null)), (snap) => {
        setGroceries(snap.docs.map((d) => ({ ...(d.data() as GroceryItem), id: d.id })));
        markLoaded('groceries');
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [householdId]);

  const thisWeek = weekId(today);
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'households', householdId, 'weekMenus', thisWeek), (snap) => {
      setMenu(snap.exists() ? (snap.data() as WeekMenu) : { days: {}, updatedAt: 0 });
      markLoaded('menu');
    });
    return unsub;
  }, [householdId, thisWeek]);

  // The post-its are the old chat messages, newest first
  useEffect(() => {
    const q = query(
      collection(db, 'households', householdId, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(showAllNotes ? 60 : 12)
    );
    const unsub = onSnapshot(q, (snap) => {
      markLoaded('notes');
      setNotes(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            senderId: data.senderId,
            senderName: data.senderName ?? 'Iemand',
            text: data.text ?? '',
            // Just-sent notes have no server time yet
            createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
            color: data.color,
            reactions: data.reactions,
            replies: data.replies,
          };
        })
      );
    });
    return unsub;
  }, [householdId, showAllNotes]);

  // Everything Thuis shows is in: lift the loading screen. Weather and agenda
  // don't count (slow, and shown from the last visit's copy meanwhile).
  const allLoaded = householdReady && recipesLoaded && Object.values(loaded).every(Boolean);
  useEffect(() => {
    if (allLoaded) releaseSplash();
  }, [allLoaded]);

  const location = household?.location;
  // Until the fresh forecast is in, show the last one we had for this place
  const forecast = freshForecast ?? (location ? cachedForecast(location) : null);
  useEffect(() => {
    if (!location) return;
    setWeatherError(false);
    fetchForecast(location)
      .then(setForecast)
      .catch(() => setWeatherError(true));
  }, [location?.lat, location?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  // Calendar: re-asked when your own calendar choice changes; failures just
  // hide the card (the rest of the home screen shouldn't depend on Google)
  const calendarKey = `${profile?.calendar?.linkedAt ?? 0}:${(profile?.calendar?.selected ?? []).join(',')}`;
  useEffect(() => {
    fetchEvents()
      .then(setAgenda)
      .catch(() => setAgenda(null));
  }, [calendarKey]);

  const name = profile?.displayName ?? '';
  const todayKey = DAY_KEYS[(today.getDay() + 6) % 7];
  const tonight = resolveDay(todayKey, menu, recipes);

  const openTasks = tasks.filter((t) => !isTaskDone(t, now));
  const lateCount = openTasks.filter((t) => isTaskLate(t, now)).length;
  // Late first, then one-off tasks (loose jobs like "Oma bellen" that are easy
  // to forget), then the ones assigned to you, then the rest. Oldest first
  // within each group, so the order no longer jumps around. One-off tasks
  // with the nearest deadline come first.
  const topTasks = [...openTasks]
    .sort(
      (a, b) =>
        Number(isTaskLate(b, now)) - Number(isTaskLate(a, now)) ||
        Number(!b.isRecurring) - Number(!a.isRecurring) ||
        byDeadline(a, b) ||
        Number(b.assignedTo === user?.uid) - Number(a.assignedTo === user?.uid) ||
        (a.createdAt ?? 0) - (b.createdAt ?? 0)
    )
    .slice(0, 3);
  const openGroceries = groceries.filter((g) => !g.checkedAt).sort((a, b) => b.createdAt - a.createdAt);
  const cat = computeCat(purchases, now, household?.vacations);
  const catName = household?.catName?.trim() || 'Poes';
  const todayWeather = forecast ? describeWeather(forecast.currentCode) : null;
  const openNote = notes.find((n) => n.id === openNoteId) ?? null;

  return (
    <>
      <div className="app-header">
        <div>
          <h2 className="household-name">
            {greeting(today.getHours())}
            {name ? `, ${name}` : ''}
          </h2>
          <p style={{ fontSize: 13, color: 'var(--color-ink-soft)', marginTop: 2 }}>
            {WEEKDAYS[today.getDay()]} {today.getDate()} {MONTHS[today.getMonth()]}
            {forecast && todayWeather && ` · ${todayWeather.emoji} ${forecast.currentTemp}° · ${forecast.days[0].max}° / ${forecast.days[0].min}°`}
          </p>
        </div>
      </div>

      <div className="app-content">
        {/* Vacation mode: one tap to switch it off when you're back */}
        {vacation && (
          <div className="vacation-bar">
            <span>
              🏖️ Vakantiemodus staat aan
              <span className="vacation-sub">
                sinds {new Date(vacation.from).getDate()} {MONTHS[new Date(vacation.from).getMonth()]} ·{' '}
                {memberNames[vacation.by] ?? '…'}
              </span>
            </span>
            <button className="btn btn-primary" onClick={() => user && setVacation(householdId, user.uid, false)}>
              Ik ben thuis
            </button>
          </div>
        )}
        {/* Two columns on tablet/desktop: overview left, post-it board right */}
        <div className="home-layout">
          <div className="home-main">
            {/* Weather: 7 days, or ask where once */}
            {location && forecast && (
              <div className="weather-strip">
                {forecast.days.map((d, i) => {
                  const w = describeWeather(d.code);
                  const date = new Date(`${d.date}T12:00:00`);
                  return (
                    <div key={d.date} className={`weather-day${i === 0 ? ' today' : ''}`}>
                      <span className="weather-name">{i === 0 ? 'Vandaag' : SHORT_DAYS[date.getDay()]}</span>
                      <span className="weather-emoji">{w.emoji}</span>
                      <span className="weather-temp">
                        <strong>{d.max}°</strong> {d.min}°
                      </span>
                      <span className={`weather-rain${d.rain >= 40 ? ' wet' : ''}`}>💧{d.rain}%</span>
                    </div>
                  );
                })}
              </div>
            )}
            {location && weatherError && <p className="settings-note">Het weer kon niet geladen worden.</p>}
            {!location && (
              <SectionCard color="#dbe8f5" title="🌤️ Weer" className="home-card">
                <div className="section-card-pad">
                  {pickingPlace ? (
                    <WeatherLocationPicker onDone={() => setPickingPlace(false)} />
                  ) : (
                    <button className="btn btn-secondary btn-block" onClick={() => setPickingPlace(true)}>
                      Weer instellen
                    </button>
                  )}
                </div>
              </SectionCard>
            )}

            {agenda && agenda.linked > 0 && <AgendaCard events={agenda.events} now={now} />}

            <div className="home-grid">
              <button className="home-tile" style={{ '--card-color': '#f8ecc4' } as CSSProperties} onClick={() => onNavigate('menu')}>
                <span className="home-tile-head">🍽️ Vanavond</span>
                <span className="home-tile-main">
                  {tonight.kind === 'recipe'
                    ? tonight.recipe.name
                    : tonight.kind === 'default-missing'
                      ? `${tonight.name} 🍟`
                      : 'Nog niks gepland'}
                </span>
              </button>
              <button className="home-tile" style={{ '--card-color': '#f8dfd2' } as CSSProperties} onClick={() => onNavigate('groceries')}>
                <span className="home-tile-head">🛒 Boodschappen</span>
                <span className="home-tile-main">
                  {openGroceries.length === 0 ? 'Niks nodig' : `${openGroceries.length} te halen`}
                </span>
                {openGroceries.length > 0 && (
                  <span className="home-tile-sub">{openGroceries.slice(0, 4).map((g) => g.text).join(', ')}</span>
                )}
              </button>
            </div>

            <SectionCard
              color="#d4ece4"
              title="✅ Taken"
              className="home-card"
              aside={
                <button className="link-button home-more" onClick={() => onNavigate('tasks')}>
                  {openTasks.length} open{lateCount ? ` · ${lateCount} te laat` : ''} ›
                </button>
              }
            >
              {topTasks.length === 0 ? (
                <p className="settings-note section-card-pad" style={{ marginBottom: 0 }}>
                  Alles gedaan! 🎉
                </p>
              ) : (
                topTasks.map((t) => {
                  const late = isTaskLate(t, now);
                  const group = findTaskGroup(t.category);
                  const deadline = !t.isRecurring && t.dueAt != null ? formatDeadline(t.dueAt, now) : null;
                  return (
                    <div key={t.id} className={`task-row${late ? ' late' : ''}`}>
                      <button
                        className="task-checkbox"
                        onClick={() => {
                          if (!user) return;
                          undoCheck.checked(t);
                          toggleTaskDone(householdId, user.uid, t);
                        }}
                        aria-label="Markeer als gedaan"
                      />
                      <div className="task-info">
                        <p className="task-title">
                          {group && <span className="task-emoji">{group.emoji}</span>}
                          {t.title}
                        </p>
                        {deadline ? (
                          <p className={`task-meta deadline-${deadline.tone}`}>📅 {deadline.text}</p>
                        ) : (
                          late && <p className="task-meta task-late-text">te laat</p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </SectionCard>

            <button className="home-cat" onClick={() => onNavigate('cat')}>
              <span className="home-cat-emoji">🐈‍⬛</span>
              <span className="task-info">
                <span className="task-title" style={{ display: 'block' }}>
                  {cat.mood === 'hungry'
                    ? `${catName} heeft honger!`
                    : cat.mood === 'happy'
                      ? `${catName} is superblij`
                      : cat.mood === 'content'
                        ? `${catName} is tevreden`
                        : `${catName} verveelt zich`}
                </span>
                <span className="stat-track" style={{ display: 'block', marginTop: 6 }}>
                  <span className={`stat-fill${cat.fullness < 25 ? ' warn' : ''}`} style={{ display: 'block', width: `${cat.fullness}%` }} />
                </span>
              </span>
              <span className="home-more">›</span>
            </button>

          </div>
          <div className="home-board">
            {/* Post-it board: replaces the chat */}
            <div className="board-head">
              <p className="section-label" style={{ margin: 0 }}>📌 Prikbord</p>
              <button className="btn btn-primary board-add" onClick={() => setWriting(true)}>
                + Briefje
              </button>
            </div>
            {notes.length === 0 && <p className="empty-state" style={{ padding: '20px' }}>Nog geen briefjes. Plak de eerste!</p>}
            <div className="board">
              {notes.map((n) => (
                <PostIt
                  key={n.id}
                  note={n}
                  mine={n.senderId === user?.uid}
                  now={now}
                  householdId={householdId}
                  memberIds={household?.memberIds ?? []}
                  memberNames={memberNames}
                  onOpen={() => setOpenNoteId(n.id)}
                />
              ))}
            </div>
            {notes.length >= 12 && !showAllNotes && (
              <button className="link-button" style={{ display: 'block', margin: '8px auto 0' }} onClick={() => setShowAllNotes(true)}>
                Alle briefjes
              </button>
            )}
          </div>
        </div>
      </div>

      {writing && <NoteComposer onClose={() => setWriting(false)} />}
      {openNote && (
        <NoteDetail
          note={openNote}
          now={now}
          memberIds={household?.memberIds ?? []}
          memberNames={memberNames}
          onClose={() => setOpenNoteId(null)}
        />
      )}
      {undoCheck.pending && (
        <UndoToast label={undoCheck.pending.title} action="afgevinkt" onUndo={undoCheck.undo} />
      )}
    </>
  );
}

// Today and the next two days from the linked Google calendars
function AgendaCard({ events, now }: { events: CalendarEvent[]; now: number }) {
  const startOf = (e: CalendarEvent) => (e.allDay ? new Date(`${e.start}T00:00:00`) : new Date(e.start));
  const labelFor = (d: Date) => {
    const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86_400_000);
    if (diff === 0) return 'Vandaag';
    if (diff === 1) return 'Morgen';
    return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
  };

  // Group by day, keeping the order the server sorted them in
  const groups: { label: string; items: CalendarEvent[] }[] = [];
  for (const e of events) {
    const d = startOf(e);
    const label = labelFor(d);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(e);
    else groups.push({ label, items: [e] });
  }

  return (
    <SectionCard color="#e6ddf3" title="📅 Agenda" className="home-card">
      {groups.length === 0 ? (
        <p className="settings-note section-card-pad" style={{ marginBottom: 0 }}>
          Niets gepland de komende dagen.
        </p>
      ) : (
        groups.map((g) => (
          <div key={g.label}>
            <p className="event-day">{g.label}</p>
            {g.items.map((e, i) => (
              <div className="event-row" key={`${e.start}-${i}`}>
                <span className="event-time">
                  {e.allDay
                    ? 'hele dag'
                    : new Date(e.start).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="calendar-dot" style={{ background: e.color }} />
                <span className="event-title">{e.title}</span>
              </div>
            ))}
          </div>
        ))
      )}
    </SectionCard>
  );
}

// One post-it. Hold your own note to take it off the board.
function PostIt({
  note,
  mine,
  now,
  householdId,
  memberIds,
  memberNames,
  onOpen,
}: {
  note: Note;
  mine: boolean;
  now: number;
  householdId: string;
  memberIds: string[];
  memberNames: Record<string, string>;
  onOpen: () => void;
}) {
  const timer = useRef<number | null>(null);
  // A long press (delete) shouldn't also count as a tap (open)
  const held = useRef(false);

  function startHold() {
    held.current = false;
    if (!mine) return;
    timer.current = window.setTimeout(() => {
      held.current = true;
      if (window.confirm('Dit briefje van het prikbord halen?')) {
        deleteDoc(doc(db, 'households', householdId, 'messages', note.id)).catch((err) =>
          console.error('Failed to delete note', err)
        );
      }
    }, 550);
  }
  function cancelHold() {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  }

  const replies = sortedReplies(note);
  // The board shows the last two replies; the rest is in the opened note
  const shownReplies = replies.slice(-2);
  const reactions = Object.values(note.reactions ?? {});

  return (
    <button
      className="postit"
      style={{ background: note.color ?? NOTE_COLORS[0], transform: `rotate(${tilt(note.id)}deg)` }}
      onTouchStart={startHold}
      onTouchEnd={cancelHold}
      onTouchMove={cancelHold}
      onMouseDown={startHold}
      onMouseUp={cancelHold}
      onMouseLeave={cancelHold}
      onContextMenu={(e) => mine && e.preventDefault()}
      onClick={() => !held.current && onOpen()}
      aria-label={`Briefje van ${note.senderName}: reageren`}
    >
      <span className="postit-pin" aria-hidden>📌</span>
      <span className="postit-text" style={handwriting(note.senderId, memberIds, 17)}>
        {note.text}
      </span>
      {shownReplies.length > 0 && (
        <span className="postit-replies">
          {replies.length > shownReplies.length && (
            <span className="postit-more">+{replies.length - shownReplies.length} eerder</span>
          )}
          {shownReplies.map((r) => (
            <span key={`${r.uid}-${r.at}`} className="postit-reply" style={handwriting(r.uid, memberIds, 15)}>
              ↳ {memberNames[r.uid] ?? '…'}: {r.text}
            </span>
          ))}
        </span>
      )}
      <span className="postit-meta">
        {reactions.length > 0 && <span className="postit-reactions">{reactions.join('')}</span>}
        <span>
          — {note.senderName} · {shortAgo(note.createdAt, now)}
        </span>
      </span>
    </button>
  );
}

// An opened post-it: react with an emoji or write a short reply
function NoteDetail({
  note,
  now,
  memberIds,
  memberNames,
  onClose,
}: {
  note: Note;
  now: number;
  memberIds: string[];
  memberNames: Record<string, string>;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { householdId } = useHousehold();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mine = user ? note.reactions?.[user.uid] : undefined;

  async function react(emoji: string) {
    if (!user) return;
    setError(null);
    try {
      await toggleReaction(householdId, note, user.uid, emoji);
    } catch (err) {
      setError(dutchError(err, 'Reageren lukte niet.'));
    }
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!user || !text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await addReply(householdId, note.id, user.uid, text);
      setText('');
    } catch (err) {
      setError(dutchError(err, 'Versturen lukte niet.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="postit postit-open" style={{ background: note.color ?? NOTE_COLORS[0] }}>
          <span className="postit-pin" aria-hidden>📌</span>
          <span className="postit-text" style={handwriting(note.senderId, memberIds, 20)}>
            {note.text}
          </span>
          {sortedReplies(note).map((r) => (
            <span key={`${r.uid}-${r.at}`} className="postit-reply" style={handwriting(r.uid, memberIds, 17)}>
              ↳ {memberNames[r.uid] ?? '…'}: {r.text}
            </span>
          ))}
          <span className="postit-meta">
            <span />
            <span>
              — {note.senderName} · {shortAgo(note.createdAt, now)}
            </span>
          </span>
        </div>

        {/* One emoji per person; tap yours again to take it back */}
        <div className="reaction-row">
          {REACTIONS.map((emoji) => {
            const who = Object.entries(note.reactions ?? {})
              .filter(([, e]) => e === emoji)
              .map(([uid]) => memberNames[uid] ?? '…');
            return (
              <button
                key={emoji}
                className={`reaction-btn${mine === emoji ? ' active' : ''}`}
                onClick={() => react(emoji)}
                aria-pressed={mine === emoji}
              >
                <span className="reaction-emoji">{emoji}</span>
                {who.length > 0 && <span className="reaction-who">{who.join(', ')}</span>}
              </button>
            );
          })}
        </div>

        <form className="reply-form" onSubmit={send}>
          <input
            className="input"
            placeholder="Schrijf een reactie…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={REPLY_MAX}
            enterKeyHint="send"
          />
          <button className="btn btn-primary" type="submit" disabled={busy || !text.trim()}>
            {busy ? '…' : 'Stuur'}
          </button>
        </form>
        {text.length > REPLY_MAX - 15 && (
          <p className="settings-note" style={{ margin: '4px 0 0' }}>
            Nog {REPLY_MAX - text.length} tekens
          </p>
        )}
        {error && <p style={{ color: 'var(--color-danger)', fontSize: 13, marginTop: 8 }}>{error}</p>}

        <button className="btn btn-ghost btn-block" onClick={onClose} style={{ marginTop: 12 }}>
          Sluiten
        </button>
      </div>
    </div>
  );
}

function NoteComposer({ onClose }: { onClose: () => void }) {
  const { user, profile } = useAuth();
  const { householdId, household } = useHousehold();
  const [text, setText] = useState('');
  const [color, setColor] = useState(NOTE_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function stick() {
    if (!user || !profile || !text.trim()) return;
    setBusy(true);
    try {
      // Same shape as the old chat messages (+ a colour), so notifications
      // and the existing rules keep working unchanged
      await addDoc(collection(db, 'households', householdId, 'messages'), {
        senderId: user.uid,
        senderName: profile.displayName,
        text: text.trim(),
        color,
        createdAt: serverTimestamp(),
      });
      onClose();
    } catch (err) {
      setError(dutchError(err, 'Plakken lukte niet.'));
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Nieuw briefje</h3>
        <textarea
          className="input postit-input"
          // In your own handwriting, so you see how it will look on the board
          style={{ background: color, ...handwriting(user?.uid ?? '', household?.memberIds ?? [], 18) }}
          placeholder="Schrijf iets liefs, of: vergeet de pakketjes niet!"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={300}
          rows={4}
          autoFocus
        />
        <div className="chip-row" style={{ margin: '10px 0 14px' }}>
          {NOTE_COLORS.map((c) => (
            <button
              key={c}
              className={`color-dot${c === color ? ' active' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label="Kleur kiezen"
            />
          ))}
        </div>
        {error && <p style={{ color: 'var(--color-danger)', fontSize: 13, marginBottom: 10 }}>{error}</p>}
        <button className="btn btn-primary btn-block" onClick={stick} disabled={busy || !text.trim()} style={{ marginBottom: 8 }}>
          {busy ? 'Even geduld…' : '📌 Opplakken'}
        </button>
        <button className="btn btn-ghost btn-block" onClick={onClose}>
          Annuleren
        </button>
      </div>
    </div>
  );
}
