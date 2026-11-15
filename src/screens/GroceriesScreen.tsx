import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '../context/AuthContext';
import { useHousehold } from '../context/HouseholdContext';
import { useNow } from '../hooks/useNow';
import { useUndoableDelete } from '../hooks/useUndoableDelete';
import SwipeToDelete from '../components/SwipeToDelete';
import DragList from '../components/DragList';
import type { DragHandleProps } from '../components/DragList';
import UndoToast from '../components/UndoToast';
import { HIDE_DONE_AFTER_MS, isHiddenDone } from '../lib/time';
import { groceryKey } from '../lib/groceries';
import { groceryOrderRef, ranksAfterMove, saveRanks, sortByShopOrder } from '../lib/groceryOrder';
import type { GroceryRanks } from '../lib/groceryOrder';
import { dutchError } from '../lib/firebaseErrors';
import RecipesScreen from './RecipesScreen';
import SectionCard from '../components/SectionCard';
import type { GroceryItem } from '../types';
import { t } from '../i18n';

export default function GroceriesScreen() {
  const { user } = useAuth();
  const { householdId, memberNames } = useHousehold();
  // Only what the list shows: everything still open, plus what was checked
  // off in the last 72h. (The full history kept growing and was read on every
  // open; how often you buy something now lives in stats/groceries.)
  const [openItems, setOpenItems] = useState<GroceryItem[]>([]);
  const [recentChecked, setRecentChecked] = useState<GroceryItem[]>([]);
  const [history, setHistory] = useState<Record<string, { label: string; count: number; last: number }> | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showRecipes, setShowRecipes] = useState(false);
  // Shop order per product (dragged with ⠿), shared with the household
  const [ranks, setRanks] = useState<GroceryRanks>({});
  const now = useNow();

  useEffect(() => {
    const col = collection(db, 'households', householdId, 'groceries');
    const toItems = (snap: { docs: { id: string; data: () => unknown }[] }) =>
      snap.docs.map((d) => ({ ...(d.data() as GroceryItem), id: d.id }));
    const unsubs = [
      onSnapshot(query(col, where('checkedAt', '==', null)), (snap) => setOpenItems(toItems(snap))),
      onSnapshot(query(col, where('checkedAt', '>=', Date.now() - HIDE_DONE_AFTER_MS)), (snap) =>
        setRecentChecked(toItems(snap))
      ),
      onSnapshot(
        groceryOrderRef(householdId),
        (snap) => setRanks((snap.exists() ? snap.get('ranks') : null) ?? {}),
        // No order yet (or no access): just the order they were added in
        () => setRanks({})
      ),
      // Suggestion counts, kept by the Cloud Functions (functions/stats.js)
      onSnapshot(
        doc(db, 'households', householdId, 'stats', 'groceries'),
        (snap) => {
          if (snap.exists()) setHistory(snap.get('items') ?? {});
          else if (!snap.metadata.fromCache) setHistory(null); // see HouseholdContext
        },
        () => setHistory(null)
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [householdId]);

  // Newest first, like before. Right after checking something off it can sit
  // in both lists for a moment, so each item only once (by id).
  const items = [...new Map([...recentChecked, ...openItems].map((i) => [i.id, i])).values()].sort(
    (a, b) => b.createdAt - a.createdAt
  );

  function handleAdd(e: FormEvent) {
    e.preventDefault();
    addItem(text);
  }

  async function addItem(value: string) {
    const trimmed = value.trim();
    if (!trimmed || !user) return;
    setText('');
    setError(null);
    try {
      const item: Omit<GroceryItem, 'id'> = {
        text: trimmed,
        addedBy: user.uid,
        createdAt: Date.now(),
        checkedAt: null,
        checkedBy: null,
      };
      await addDoc(collection(db, 'households', householdId, 'groceries'), item);
    } catch (err) {
      setText(trimmed);
      setError(dutchError(err, t('Kon het niet toevoegen.')));
    }
  }

  async function toggleChecked(item: GroceryItem) {
    if (!user) return;
    const ref = doc(db, 'households', householdId, 'groceries', item.id);
    await updateDoc(
      ref,
      item.checkedAt
        ? { checkedAt: null, checkedBy: null }
        : { checkedAt: Date.now(), checkedBy: user.uid }
    );
  }

  // Swipe right to delete, same as tasks (with a few seconds to undo)
  const swipe = useUndoableDelete<GroceryItem>((item) => {
    deleteDoc(doc(db, 'households', householdId, 'groceries', item.id)).catch((err) =>
      console.error('Failed to delete grocery item', err)
    );
  });

  const visible = items.filter((i) => i.id !== swipe.pending?.id);
  // In your shop order; things you never moved at the bottom, newest last
  const open = sortByShopOrder(
    visible.filter((i) => !i.checkedAt),
    ranks
  );

  function moveItem(from: number, to: number) {
    const update = ranksAfterMove(open, ranks, from, to);
    // Show the new order straight away; the snapshot confirms it a moment later
    setRanks((cur) => ({ ...cur, ...update }));
    saveRanks(householdId, update).catch((err) => setError(dutchError(err, t('Volgorde opslaan lukte niet.'))));
  }
  // Got-it items stay visible for 72h so you can still undo a mis-tap
  const checked = visible
    .filter((i) => i.checkedAt && !isHiddenDone(i.checkedAt, now))
    .sort((a, b) => (b.checkedAt ?? 0) - (a.checkedAt ?? 0));

  // Quick-add buttons: things bought before (checked-off items stay in the
  // database), most often first. While typing they filter like autocomplete.
  const openNames = new Set(open.map((i) => groceryKey(i.text)));
  // From the summary; until that exists, from what's loaded now
  const counts = new Map<string, { label: string; count: number; last: number }>(Object.entries(history ?? {}));
  if (!history) {
    for (const i of items) {
      const key = groceryKey(i.text);
      const entry = counts.get(key) ?? { label: i.text.trim(), count: 0, last: 0 };
      entry.count += 1;
      if (i.createdAt > entry.last) entry.last = i.createdAt;
      counts.set(key, entry);
    }
  }
  const typed = groceryKey(text);
  const suggestions = [...counts.entries()]
    .filter(([key, e]) => !openNames.has(key) && (typed ? key.includes(typed) && key !== typed : e.count >= 2))
    .sort(([, a], [, b]) => b.count - a.count || b.last - a.last)
    .slice(0, 8)
    .map(([, e]) => e.label);

  if (showRecipes) return <RecipesScreen onClose={() => setShowRecipes(false)} />;

  return (
    <>
      <div className="app-header">
        <div>
          <h2 className="household-name">{t('Boodschappen')}</h2>
          <p style={{ fontSize: 13, color: 'var(--color-ink-soft)', marginTop: 2 }}>
            {open.length === 0
              ? t('Niets nodig op dit moment')
              : open.length === 1
                ? t('1 ding te halen')
                : t('{n} dingen te halen', { n: open.length })}
          </p>
        </div>
        <button className="btn btn-ghost header-btn" onClick={() => setShowRecipes(true)}>
          {t('📖 Gerechten')}
        </button>
      </div>

      <form className="grocery-add" onSubmit={handleAdd}>
        <input
          className="input"
          placeholder={t('Wat moet er gehaald worden?')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          enterKeyHint="done"
        />
        <button className="btn btn-primary" type="submit" disabled={!text.trim()}>
          {t('Toevoegen')}
        </button>
      </form>
      {suggestions.length > 0 && (
        <div className="grocery-suggestions">
          {suggestions.map((label) => (
            <button key={label} className="chip" onClick={() => addItem(label)}>
              + {label}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p style={{ color: 'var(--color-danger)', fontSize: 13, padding: '0 20px 8px' }}>{error}</p>
      )}

      <div className="app-content">
        {open.length === 0 && checked.length === 0 && (
          <p className="empty-state">
            🛒
            <br />
            {t('Het lijstje is leeg.')}
          </p>
        )}

        <div className="card-grid">
          {/* Same card look as the week menu */}
          {open.length > 0 && (
            <SectionCard color="#f8dfd2" title={t('🛒 Te halen')} aside={<span className="section-count">{open.length}</span>}>
              <DragList
                items={open}
                getKey={(item) => item.id}
                onMove={moveItem}
                render={(item, handle, dragging) => (
                  <GroceryRow
                    item={item}
                    meta={t('door {name}', { name: memberNames[item.addedBy] ?? '…' })}
                    onToggle={() => toggleChecked(item)}
                    onRemove={() => swipe.remove(item)}
                    handle={open.length > 1 ? handle : undefined}
                    dragging={dragging}
                  />
                )}
              />
            </SectionCard>
          )}

          {checked.length > 0 && (
            <SectionCard
              color="#e9e6e0"
              title={t('🧺 In het mandje')}
              aside={<span className="section-count">{checked.length}</span>}
            >
              {checked.map((item) => (
                <GroceryRow
                  key={item.id}
                  item={item}
                  meta={t('gehaald door {name}', { name: memberNames[item.checkedBy ?? ''] ?? '…' })}
                  onToggle={() => toggleChecked(item)}
                  onRemove={() => swipe.remove(item)}
                />
              ))}
            </SectionCard>
          )}
        </div>
        
        {items.length > 0 && (
          <p className="swipe-hint">
            {t('Swipe naar rechts om iets van de lijst te halen')}
            {open.length > 1 && (
              <>
                <br />
                {t('Sleep ⠿ om de volgorde van je winkel te maken')}
              </>
            )}
          </p>
        )}
      </div>

      {swipe.pending && <UndoToast label={swipe.pending.text} onUndo={swipe.undo} />}
    </>
  );
}

function GroceryRow({
  item,
  meta,
  onToggle,
  onRemove,
  handle,
  dragging = false,
}: {
  item: GroceryItem;
  meta: string;
  onToggle: () => void;
  onRemove: () => void;
  // Drag handle (⠿) for the shop order; only on the "Te halen" list
  handle?: DragHandleProps;
  dragging?: boolean;
}) {
  const isDone = !!item.checkedAt;
  const forDishes = (item.forRecipes ?? []).filter((r) => r.trim().toLowerCase() !== item.text.trim().toLowerCase());
  return (
    <SwipeToDelete onDelete={onRemove}>
      <div className={`task-row${dragging ? ' is-dragging' : ''}`}>
        <button
          className={`task-checkbox${isDone ? ' done' : ''}`}
          onClick={onToggle}
          aria-label={isDone ? t('Terug op de lijst') : t('Gehaald')}
        >
          {isDone ? '✓' : ''}
        </button>
        <div className="task-info">
          <p className={`task-title${isDone ? ' done' : ''}`}>{item.text}</p>
          <p className="task-meta">
            {/* Which dish(es) it's for, when added from a recipe ("Pasta voor
                Pasta" says nothing, so a dish named like the item is left out) */}
            {forDishes.length > 0 && <span className="grocery-for">🍽️ {t('voor {dishes}', { dishes: forDishes.join(', ') })} · </span>}
            {meta}
          </p>
        </div>
        {handle && (
          <span className="drag-handle" {...handle} role="button" aria-label={t('Sleep om te verplaatsen')}>
            ⠿
          </span>
        )}
      </div>
    </SwipeToDelete>
  );
}
