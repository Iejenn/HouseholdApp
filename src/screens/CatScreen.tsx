import { useEffect, useRef, useState } from 'react';
import { addDoc, collection, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '../context/AuthContext';
import { useHousehold } from '../context/HouseholdContext';
import { useNow } from '../hooks/useNow';
import CatScene, { CatThumb } from '../components/CatScene';
import SectionCard from '../components/SectionCard';
import type { CatPose } from '../components/CatScene';
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
import { COATS } from '../data/catShop';
import type { CatCoat, CatMood, CosmeticSlot, ShopItem } from '../data/catShop';
import { isTaskDone } from '../lib/time';
import { dutchError } from '../lib/firebaseErrors';
import type { Purchase, Task } from '../types';
import { t } from '../i18n';

const DEFAULT_CAT_NAME = 'Poes';

function moodText(mood: CatMood, name: string, sleeping: boolean): string {
  if (sleeping) {
    return mood === 'hungry'
      ? t('{name} slaapt onrustig… de voerbak is leeg.', { name })
      : t('Sssst… {name} ligt te slapen. 😴', { name });
  }
  switch (mood) {
    case 'hungry':
      return t('Miauw! {name} heeft honger. Vul de voerbak!', { name });
    case 'bored':
      return t('{name} verveelt zich een beetje. Misschien een speeltje?', { name });
    case 'content':
      return t('{name} is tevreden.', { name });
    case 'happy':
      return t('{name} is superblij en spint! 💕', { name });
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
  if (sleeping) return t('Zzz… mrrrw… vijf minuutjes nog…');
  if (mood === 'hungry') return t('Ik heb hónger! Vul mijn bakje, alsjeblieft. 🥺');
  if (openTasks.length > 0 && Math.random() < 0.5) {
    const task = openTasks[Math.floor(Math.random() * openTasks.length)];
    return t('Psst… "{title}" moet nog gebeuren. 👀', { title: task.title });
  }
  return t(GENERIC_LINES[Math.floor(Math.random() * GENERIC_LINES.length)]);
}

const PLAY_LINES = ['Pak \'m! 🐾', 'Hebbes!', 'Nog een keer!', 'Kijk mij eens!', 'Wiebel wiebel…'];
const pick = (lines: string[]) => t(lines[Math.floor(Math.random() * lines.length)]);

// Each shop section is a card with its own header colour (week-menu look)
// (titles are translated where shown: module-level text is created before
// the language is known)
const SHOP_SECTIONS: { title: string; color: string; match: (i: ShopItem) => boolean }[] = [
  { title: '🥣 Eten & snoep', color: '#f8dfd2', match: (i) => i.kind === 'food' || i.kind === 'treat' },
  { title: '🧶 Speelgoed & meubels', color: '#dbe8f5', match: (i) => i.kind === 'permanent' },
  { title: '🖼️ Behang', color: '#e6ddf3', match: (i) => i.slot === 'wall' },
  { title: '🪵 Vloeren', color: '#f8ecc4', match: (i) => i.slot === 'floor' },
  { title: '🎀 Halsbandjes', color: '#f6dbe4', match: (i) => i.slot === 'collar' },
  { title: '👑 Hoedjes', color: '#dcefd9', match: (i) => i.slot === 'hat' },
];

export default function CatScreen() {
  const { user } = useAuth();
  const { householdId, household, purchases, balance, earned } = useHousehold();
  const [petting, setPetting] = useState(false);
  // "Jullie kat" popup (name + which cat) open
  const [editingCat, setEditingCat] = useState(false);
  const [speech, setSpeech] = useState<string | null>(null);
  const speechTimer = useRef<number | null>(null);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openTasks, setOpenTasks] = useState<Task[]>([]);
  const [pose, setPose] = useState<CatPose>('sit');
  const [activeToy, setActiveToy] = useState<string | null>(null);
  const poseTimer = useRef<number | null>(null);
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
      if (poseTimer.current) window.clearTimeout(poseTimer.current);
    },
    []
  );

  const cat = computeCat(purchases, now, household?.vacations);
  const name = household?.catName?.trim() || t(DEFAULT_CAT_NAME);
  const look = household?.catLook ?? {};
  const level = houseLevel(earned);
  const part = getDayPart(now);
  const sleeping = part === 'night';
  const next = HOUSE_LEVELS[level + 1];

  function say(line: string) {
    setSpeech(line);
    if (speechTimer.current) window.clearTimeout(speechTimer.current);
    speechTimer.current = window.setTimeout(() => setSpeech(null), 3500);
  }

  // Do something for a while, then go back to sitting
  function act(next: CatPose, ms: number, toy: string | null = null) {
    if (poseTimer.current) window.clearTimeout(poseTimer.current);
    setPose(next);
    setActiveToy(toy);
    poseTimer.current = window.setTimeout(() => {
      setPose('sit');
      setActiveToy(null);
    }, ms);
  }

  function pet() {
    // Purely for fun — petting is free and stored nowhere
    if (!sleeping && pose !== 'sit') act('sit', 0); // tapping wakes him from a nap/game
    setPetting(true);
    window.setTimeout(() => setPetting(false), 1200);
    say(pickLine(cat.mood, sleeping, openTasks));
  }

  function playWith(toy: string) {
    if (sleeping) return say(t('Zzz… morgen spelen…'));
    if (cat.mood === 'hungry') return say(t('Eerst eten! 🥣'));
    act('play', 2800, toy);
    say(pick(PLAY_LINES));
  }

  function napInBed() {
    if (sleeping) return say(t('Zzz…'));
    act('lie', 20_000);
    say(t('Even een dutje in mijn mand… 😌'));
  }

  function checkBowl() {
    if (sleeping) return say(t('Zzz…'));
    if (cat.fullness > 0) {
      act('groom', 3000);
      say(t('Mmm, smikkelen! 😋'));
    } else {
      say(t('Leeg… 😿 Vul je hem?'));
    }
  }

  // Now and then he does something by himself: a wash or a little lie-down
  const idleState = useRef({ sleeping, pose, hungry: cat.mood === 'hungry' });
  idleState.current = { sleeping, pose, hungry: cat.mood === 'hungry' };
  useEffect(() => {
    const id = window.setInterval(() => {
      const st = idleState.current;
      if (st.sleeping || st.hungry || st.pose !== 'sit' || Math.random() > 0.35) return;
      if (Math.random() < 0.6) act('groom', 3500);
      else act('lie', 25_000);
    }, 10_000);
    return () => window.clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


  async function wear(slot: CosmeticSlot, itemId: string | null) {
    setError(null);
    try {
      // Only this one field changes, so both of you can dress him up at once
      await updateDoc(doc(db, 'households', householdId), { [`catLook.${slot}`]: itemId });
    } catch (err) {
      setError(dutchError(err, t('Opslaan lukte niet.')));
    }
  }

  function unavailableReason(item: ShopItem): string | null {
    if ((item.kind === 'permanent' || item.kind === 'cosmetic') && cat.owned.has(item.id)) return t('In huis ✓');
    if (item.kind === 'food' && cat.fullness >= REFILL_ALLOWED_BELOW) return t('Bak is nog vol');
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
      setError(dutchError(err, t('Kopen lukte niet.')));
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
            <button className="cat-name-btn" onClick={() => setEditingCat(true)} aria-label={t('Naam en uiterlijk van de kat wijzigen')}>
              {name} <span className="cat-name-edit">✎</span>
            </button>
          </h2>
          <p style={{ fontSize: 13, color: 'var(--color-ink-soft)', marginTop: 2 }}>
            {t('Taken afvinken = punten voor {name}', { name })}
          </p>
        </div>
        <span className="points-pill" title={t('Punten om uit te geven')}>
          🐾 {balance}
        </span>
      </div>

      <div className="app-content">
        {/* Tablet/desktop: the cat on the left, the shop on the right */}
        <div className="cat-layout">
          <div className="cat-side">
            <div className="card cat-card">
              <div className="cat-stage">
                <CatScene
                  mood={petting && !sleeping ? 'happy' : cat.mood}
                  sleeping={sleeping}
                  // At night he sleeps curled up in a ball
                  pose={sleeping ? 'lie' : pose}
                  activeToy={activeToy}
                  onToy={playWith}
                  onBed={napInBed}
                  onBowl={checkBowl}
                  fullness={cat.fullness}
                  owned={cat.owned}
                  look={look}
                  coat={household?.catCoat}
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
              <p className="cat-hint">{t('Tik op {name}, zijn speeltjes, mand of voerbak', { name })}</p>

              <StatBar label={t('Voerbak')} emoji="🥣" value={cat.fullness} warn={cat.fullness < 25} />
              <StatBar label={t('Geluk')} emoji="💛" value={cat.happiness} warn={cat.happiness < 40} />
            </div>

            {/* House level: grows with the number of tasks done together */}
            <SectionCard color="#d4ece4" title={`🏡 ${t(HOUSE_LEVELS[level].name)}`} className="house-card">
              <div className="section-card-pad">
                {next ? (
                  <>
                    <p className="settings-note" style={{ marginBottom: 8 }}>
                      {next.at - earned === 1
                        ? t('Nog 1 taak tot {unlocks}.', { unlocks: t(next.unlocks) })
                        : t('Nog {n} taken tot {unlocks}.', { n: next.at - earned, unlocks: t(next.unlocks) })}
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
                    {t('Het huis is helemaal af! Samen al {n} taken gedaan. 🎉', { n: earned })}
                  </p>
                )}
              </div>
            </SectionCard>

            {wardrobeSlots.length > 0 && (
              <SectionCard color="#e6ddf3" title={t('🎨 Inrichten')} className="house-card">
                <div className="section-card-pad">
                  {wardrobeSlots.map((slot) => (
                    <div key={slot} style={{ marginBottom: 6 }}>
                      <span className="field-label">{t(SLOT_LABELS[slot].label)}</span>
                      <div className="chip-row" style={{ marginBottom: 6 }}>
                        <button className={`chip${!look[slot] ? ' active' : ''}`} onClick={() => wear(slot, null)}>
                          {t(SLOT_LABELS[slot].none)}
                        </button>
                        {ownedBySlot(slot).map((i) => (
                          <button
                            key={i.id}
                            className={`chip${look[slot] === i.id ? ' active' : ''}`}
                            onClick={() => wear(slot, i.id)}
                          >
                            {i.emoji} {t(i.name)}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}
          </div>
          <div className="cat-shop">
            {error && <p style={{ color: 'var(--color-danger)', fontSize: 13, margin: '12px 0' }}>{error}</p>}

            <p className="section-label">{t('Winkeltje')}</p>
            {SHOP_SECTIONS.map((section) => (
              <SectionCard key={section.title} color={section.color} title={t(section.title)}>
                {SHOP_ITEMS.filter(section.match).map((item) => {
                  const reason = unavailableReason(item);
                  const tooExpensive = balance < item.cost;
                  return (
                    <div className="shop-row" key={item.id}>
                      <span className="shop-emoji">{item.emoji}</span>
                      <div className="task-info">
                        <p className="task-title">{t(item.name)}</p>
                        <p className="task-meta">{t(item.description)}</p>
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
              </SectionCard>
            ))}

            <p className="cat-footnote">
              {earned === 1
                ? t('Samen al 1 taak afgevinkt. Elke taak = 1 🐾.')
                : t('Samen al {n} taken afgevinkt. Elke taak = 1 🐾.', { n: earned })}
            </p>
          </div>
        </div>
      </div>

      {editingCat && (
        <CatSettings
          householdId={householdId}
          name={name}
          coat={household?.catCoat ?? 'tuxedo'}
          onClose={() => setEditingCat(false)}
        />
      )}
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

// "Jullie kat": name plus which cat (zwart-wit, cyperse, rode kater), in the
// app's own style instead of the browser's plain prompt. Saved for the whole
// household, so you both see the same cat.
function CatSettings({
  householdId,
  name,
  coat,
  onClose,
}: {
  householdId: string;
  name: string;
  coat: CatCoat;
  onClose: () => void;
}) {
  const [nextName, setNextName] = useState(name);
  const [nextCoat, setNextCoat] = useState<CatCoat>(coat);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const trimmed = nextName.trim();
    if (!trimmed) {
      setError(t('Geef de kat een naam.'));
      return;
    }
    setBusy(true);
    try {
      await updateDoc(doc(db, 'households', householdId), { catName: trimmed.slice(0, 24), catCoat: nextCoat });
      onClose();
    } catch (err) {
      setError(dutchError(err, t('Opslaan lukte niet.')));
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{t('Jullie kat')}</h3>
        <span className="field-label">{t('Naam')}</span>
        <input
          className="input"
          value={nextName}
          onChange={(e) => setNextName(e.target.value)}
          maxLength={24}
          placeholder={t('Hoe heet jullie kat?')}
          style={{ marginBottom: 16 }}
        />
        <span className="field-label">{t('Welke kat?')}</span>
        <div className="coat-grid">
          {COATS.map((c) => (
            <button
              key={c.id}
              className={`coat-option${nextCoat === c.id ? ' active' : ''}`}
              onClick={() => setNextCoat(c.id)}
              aria-pressed={nextCoat === c.id}
            >
              <CatThumb coat={c.id} />
              <span className="coat-label">{t(c.label)}</span>
              {nextCoat === c.id && <span className="coat-selected">{t('Geselecteerd')}</span>}
            </button>
          ))}
        </div>
        {error && <p style={{ color: 'var(--color-danger)', fontSize: 13, marginBottom: 10 }}>{error}</p>}
        <button className="btn btn-primary btn-block" onClick={save} disabled={busy} style={{ margin: '16px 0 8px' }}>
          {busy ? t('Even geduld…') : t('Opslaan')}
        </button>
        <button className="btn btn-ghost btn-block" onClick={onClose}>
          {t('Annuleren')}
        </button>
      </div>
    </div>
  );
}
