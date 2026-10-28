import { useEffect, useRef, useState } from 'react';
import { addDoc, collection, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '../context/AuthContext';
import { useHousehold } from '../context/HouseholdContext';
import { useNow } from '../hooks/useNow';
import CatScene from '../components/CatScene';
import {
  HOUSE_LEVELS,
  REFILL_ALLOWED_BELOW,
  SHOP_ITEMS,
  SLOT_LABELS,
  computeCat,
  dayPart as getDayPart,
  houseLevel,
  season as getSeason,
} from '../data/catShop';
import type { CatMood, CosmeticSlot, ShopItem } from '../data/catShop';
import { isTaskDone } from '../lib/time';
import { dutchError } from '../lib/firebaseErrors';
import type { Purchase, Task } from '../types';

const DEFAULT_CAT_NAME = 'Poes';

function moodText(mood: CatMood, name: string, sleeping: boolean): string {
  if (sleeping) {
    return mood === 'hungry'
      ? `${name} slaapt onrustig… de voerbak is leeg.`
      : `Sssst… ${name} ligt te slapen. 😴`;
  }
  switch (mood) {
    case 'hungry':
      return `Miauw! ${name} heeft honger. Vul de voerbak!`;
    case 'bored':
      return `${name} verveelt zich een beetje. Misschien een speeltje?`;
    case 'content':
      return `${name} is tevreden.`;
    case 'happy':
      return `${name} is superblij en spint! 💕`;
  }
}

const GENERIC_LINES = [
  'Miauw!',
  'Prrrr… nog even aaien?',
  'Ik zag een vogel! 🐦',
  'Wanneer is het etenstijd?',
  'Jullie doen het goed samen. 💕',
  'Ik heb een vlek op de bank gemaakt. Grapje!',
  'Mag ik op schoot?',
];

// What the cat says when tapped: sometimes about a real open task
function pickLine(mood: CatMood, sleeping: boolean, openTasks: Task[]): string {
  if (sleeping) return 'Zzz… mrrrw… vijf minuutjes nog…';
  if (mood === 'hungry') return 'Ik heb hónger! Vul mijn bakje, alsjeblieft. 🥺';
  if (openTasks.length > 0 && Math.random() < 0.5) {
    const t = openTasks[Math.floor(Math.random() * openTasks.length)];
    return `Psst… "${t.title}" moet nog gebeuren. 👀`;
  }
  return GENERIC_LINES[Math.floor(Math.random() * GENERIC_LINES.length)];
}

const SHOP_SECTIONS: { title: string; match: (i: ShopItem) => boolean }[] = [
  { title: 'Eten & snoep', match: (i) => i.kind === 'food' || i.kind === 'treat' },
  { title: 'Speelgoed & meubels', match: (i) => i.kind === 'permanent' },
  { title: 'Behang', match: (i) => i.slot === 'wall' },
  { title: 'Vloeren', match: (i) => i.slot === 'floor' },
  { title: 'Halsbandjes', match: (i) => i.slot === 'collar' },
  { title: 'Hoedjes', match: (i) => i.slot === 'hat' },
];

export default function CatScreen() {
  const { user } = useAuth();
  const { householdId, household, purchases, balance, earned } = useHousehold();
  const [petting, setPetting] = useState(false);
  const [speech, setSpeech] = useState<string | null>(null);
  const speechTimer = useRef<number | null>(null);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openTasks, setOpenTasks] = useState<Task[]>([]);
  const now = useNow(30_000);

  // Open tasks, only so the cat can nag about them
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'households', householdId, 'tasks'), (snap) => {
      const all = snap.docs.map((d) => ({ ...(d.data() as Task), id: d.id }));
      setOpenTasks(all.filter((t) => !isTaskDone(t, Date.now())));
    });
    return unsub;
  }, [householdId]);

  useEffect(
    () => () => {
      if (speechTimer.current) window.clearTimeout(speechTimer.current);
    },
    []
  );

  const cat = computeCat(purchases, now);
  const name = household?.catName?.trim() || DEFAULT_CAT_NAME;
  const look = household?.catLook ?? {};
  const level = houseLevel(earned);
  const part = getDayPart(now);
  const sleeping = part === 'night';
  const next = HOUSE_LEVELS[level + 1];

  function pet() {
    // Purely for fun — petting is free and stored nowhere
    setPetting(true);
    window.setTimeout(() => setPetting(false), 1200);
    setSpeech(pickLine(cat.mood, sleeping, openTasks));
    if (speechTimer.current) window.clearTimeout(speechTimer.current);
    speechTimer.current = window.setTimeout(() => setSpeech(null), 3500);
  }

  async function rename() {
    const nextName = window.prompt('Hoe heet jullie kat?', name)?.trim();
    if (!nextName || nextName === name) return;
    try {
      await updateDoc(doc(db, 'households', householdId), { catName: nextName.slice(0, 24) });
    } catch (err) {
      setError(dutchError(err, 'Kon de naam niet opslaan.'));
    }
  }

  async function wear(slot: CosmeticSlot, itemId: string | null) {
    setError(null);
    try {
      // Only this one field changes, so both of you can dress him up at once
      await updateDoc(doc(db, 'households', householdId), { [`catLook.${slot}`]: itemId });
    } catch (err) {
      setError(dutchError(err, 'Opslaan lukte niet.'));
    }
  }

  function unavailableReason(item: ShopItem): string | null {
    if ((item.kind === 'permanent' || item.kind === 'cosmetic') && cat.owned.has(item.id)) return 'In huis ✓';
    if (item.kind === 'food' && cat.fullness >= REFILL_ALLOWED_BELOW) return 'Bak is nog vol';
    return null; // not enough points shows as a greyed-out price instead
  }

  async function buy(item: ShopItem) {
    if (!user || balance < item.cost || unavailableReason(item)) return;
    setBusyItem(item.id);
    setError(null);
    try {
      const purchase: Purchase = { item: item.id, cost: item.cost, uid: user.uid, createdAt: Date.now() };
      await addDoc(collection(db, 'households', householdId, 'purchases'), purchase);
      // New look: put it on straight away
      if (item.kind === 'cosmetic' && item.slot) await wear(item.slot, item.id);
      pet();
    } catch (err) {
      setError(dutchError(err, 'Kopen lukte niet.'));
    } finally {
      setBusyItem(null);
    }
  }

  const ownedBySlot = (slot: CosmeticSlot) => SHOP_ITEMS.filter((i) => i.slot === slot && cat.owned.has(i.id));
  const wardrobeSlots = (Object.keys(SLOT_LABELS) as CosmeticSlot[]).filter((s) => ownedBySlot(s).length > 0);

  return (
    <>
      <div className="app-header">
        <div>
          <h2 className="household-name">
            <button className="cat-name-btn" onClick={rename} aria-label="Naam van de kat wijzigen">
              {name} <span className="cat-name-edit">✎</span>
            </button>
          </h2>
          <p style={{ fontSize: 13, color: 'var(--color-ink-soft)', marginTop: 2 }}>
            Taken afvinken = punten voor {name}
          </p>
        </div>
        <span className="points-pill" title="Punten om uit te geven">
          🐾 {balance}
        </span>
      </div>

      <div className="app-content">
        <div className="card cat-card">
          <div className="cat-stage">
            <CatScene
              mood={petting && !sleeping ? 'happy' : cat.mood}
              sleeping={sleeping}
              fullness={cat.fullness}
              owned={cat.owned}
              look={look}
              level={level}
              dayPart={part}
              season={getSeason(now)}
              petting={petting}
              onPet={pet}
            />
            {speech && <div className="cat-speech">{speech}</div>}
            {petting && (
              <>
                <span className="cat-heart" style={{ left: '44%', animationDelay: '0ms' }}>💕</span>
                <span className="cat-heart" style={{ left: '54%', animationDelay: '150ms' }}>❤️</span>
                <span className="cat-heart" style={{ left: '49%', animationDelay: '300ms' }}>💕</span>
              </>
            )}
          </div>
          <p className="cat-mood">{moodText(cat.mood, name, sleeping)}</p>
          <p className="cat-hint">Tik op {name} om te aaien</p>

          <StatBar label="Voerbak" emoji="🥣" value={cat.fullness} warn={cat.fullness < 25} />
          <StatBar label="Geluk" emoji="💛" value={cat.happiness} warn={cat.happiness < 40} />
        </div>

        {/* House level: grows with the number of tasks done together */}
        <div className="card house-card">
          <p className="card-title" style={{ marginBottom: 4 }}>
            🏡 {HOUSE_LEVELS[level].name}
          </p>
          {next ? (
            <>
              <p className="settings-note" style={{ marginBottom: 8 }}>
                Nog {next.at - earned} {next.at - earned === 1 ? 'taak' : 'taken'} tot {next.unlocks}.
              </p>
              <div className="stat-track">
                <div
                  className="stat-fill"
                  style={{
                    width: `${Math.round(
                      ((earned - HOUSE_LEVELS[level].at) / (next.at - HOUSE_LEVELS[level].at)) * 100
                    )}%`,
                  }}
                />
              </div>
            </>
          ) : (
            <p className="settings-note" style={{ marginBottom: 0 }}>
              Het huis is helemaal af! Samen al {earned} taken gedaan. 🎉
            </p>
          )}
        </div>

        {wardrobeSlots.length > 0 && (
          <div className="card house-card">
            <p className="card-title">🎨 Inrichten</p>
            {wardrobeSlots.map((slot) => (
              <div key={slot} style={{ marginBottom: 6 }}>
                <span className="field-label">{SLOT_LABELS[slot].label}</span>
                <div className="chip-row" style={{ marginBottom: 6 }}>
                  <button className={`chip${!look[slot] ? ' active' : ''}`} onClick={() => wear(slot, null)}>
                    {SLOT_LABELS[slot].none}
                  </button>
                  {ownedBySlot(slot).map((i) => (
                    <button
                      key={i.id}
                      className={`chip${look[slot] === i.id ? ' active' : ''}`}
                      onClick={() => wear(slot, i.id)}
                    >
                      {i.emoji} {i.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {error && <p style={{ color: 'var(--color-danger)', fontSize: 13, margin: '12px 0' }}>{error}</p>}

        {SHOP_SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="section-label">{section.title}</p>
            {SHOP_ITEMS.filter(section.match).map((item) => {
              const reason = unavailableReason(item);
              const tooExpensive = balance < item.cost;
              return (
                <div className="shop-row" key={item.id}>
                  <span className="shop-emoji">{item.emoji}</span>
                  <div className="task-info">
                    <p className="task-title">{item.name}</p>
                    <p className="task-meta">{item.description}</p>
                  </div>
                  {reason ? (
                    <span className="shop-status">{reason}</span>
                  ) : (
                    <button
                      className="btn btn-primary shop-buy"
                      onClick={() => buy(item)}
                      disabled={tooExpensive || busyItem !== null}
                    >
                      {item.cost} 🐾
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        <p className="cat-footnote">
          Samen al {earned} {earned === 1 ? 'taak' : 'taken'} afgevinkt. Elke taak = 1 🐾.
        </p>
      </div>
    </>
  );
}

function StatBar({ label, emoji, value, warn }: { label: string; emoji: string; value: number; warn: boolean }) {
  return (
    <div className="stat">
      <span className="stat-label">
        {emoji} {label}
      </span>
      <div className="stat-track">
        <div className={`stat-fill${warn ? ' warn' : ''}`} style={{ width: `${value}%` }} />
      </div>
      <span className="stat-value">{value}%</span>
    </div>
  );
}
