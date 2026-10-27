import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '../context/AuthContext';
import { useHousehold } from '../context/HouseholdContext';
import { useNow } from '../hooks/useNow';
import { isHiddenDone } from '../lib/time';
import { dutchError } from '../lib/firebaseErrors';
import type { GroceryItem } from '../types';

export default function GroceriesScreen() {
  const { user } = useAuth();
  const { householdId, memberNames } = useHousehold();
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const now = useNow();

  useEffect(() => {
    const q = query(
      collection(db, 'households', householdId, 'groceries'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setItems(snap.docs.map((d) => ({ ...(d.data() as GroceryItem), id: d.id })));
    });
    return unsub;
  }, [householdId]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
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
      setError(dutchError(err, 'Kon het niet toevoegen.'));
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

  async function remove(item: GroceryItem) {
    await deleteDoc(doc(db, 'households', householdId, 'groceries', item.id));
  }

  const open = items.filter((i) => !i.checkedAt);
  // Got-it items stay visible for 72h so you can still undo a mis-tap
  const checked = items
    .filter((i) => i.checkedAt && !isHiddenDone(i.checkedAt, now))
    .sort((a, b) => (b.checkedAt ?? 0) - (a.checkedAt ?? 0));

  return (
    <>
      <div className="app-header">
        <div>
          <h2 className="household-name">Boodschappen</h2>
          <p style={{ fontSize: 13, color: 'var(--color-ink-soft)', marginTop: 2 }}>
            {open.length === 0
              ? 'Niets nodig op dit moment'
              : `${open.length} ${open.length === 1 ? 'ding' : 'dingen'} te halen`}
          </p>
        </div>
      </div>

      <form className="grocery-add" onSubmit={handleAdd}>
        <input
          className="input"
          placeholder="Wat moet er gehaald worden?"
          value={text}
          onChange={(e) => setText(e.target.value)}
          enterKeyHint="done"
        />
        <button className="btn btn-primary" type="submit" disabled={!text.trim()}>
          Toevoegen
        </button>
      </form>
      {error && (
        <p style={{ color: 'var(--color-danger)', fontSize: 13, padding: '0 20px 8px' }}>{error}</p>
      )}

      <div className="app-content">
        {open.length === 0 && checked.length === 0 && (
          <p className="empty-state">
            🛒
            <br />
            Het lijstje is leeg.
          </p>
        )}

        {open.map((item) => (
          <GroceryRow
            key={item.id}
            item={item}
            meta={`door ${memberNames[item.addedBy] ?? '…'}`}
            onToggle={() => toggleChecked(item)}
            onRemove={() => remove(item)}
          />
        ))}

        {checked.length > 0 && (
          <>
            <p className="section-label">In het mandje</p>
            {checked.map((item) => (
              <GroceryRow
                key={item.id}
                item={item}
                meta={`gehaald door ${memberNames[item.checkedBy ?? ''] ?? '…'}`}
                onToggle={() => toggleChecked(item)}
                onRemove={() => remove(item)}
              />
            ))}
          </>
        )}
      </div>
    </>
  );
}

function GroceryRow({
  item,
  meta,
  onToggle,
  onRemove,
}: {
  item: GroceryItem;
  meta: string;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const isDone = !!item.checkedAt;
  return (
    <div className="task-row">
      <button
        className={`task-checkbox${isDone ? ' done' : ''}`}
        onClick={onToggle}
        aria-label={isDone ? 'Terug op de lijst' : 'Gehaald'}
      >
        {isDone ? '✓' : ''}
      </button>
      <div className="task-info">
        <p className={`task-title${isDone ? ' done' : ''}`}>{item.text}</p>
        <p className="task-meta">{meta}</p>
      </div>
      <button className="row-remove" onClick={onRemove} aria-label="Verwijderen">
        ✕
      </button>
    </div>
  );
}
