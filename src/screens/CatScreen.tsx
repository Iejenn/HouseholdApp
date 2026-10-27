import { useState } from 'react';
import { addDoc, collection, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '../context/AuthContext';
import { useHousehold } from '../context/HouseholdContext';
import { useNow } from '../hooks/useNow';
import CatScene from '../components/CatScene';
import { REFILL_ALLOWED_BELOW, SHOP_ITEMS, computeCat } from '../data/catShop';
import type { CatMood, ShopItem } from '../data/catShop';
import { dutchError } from '../lib/firebaseErrors';
import type { Purchase } from '../types';

const DEFAULT_CAT_NAME = 'Poes';

function moodText(mood: CatMood, name: string): string {
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

export default function CatScreen() {
  const { user } = useAuth();
  const { householdId, household, purchases, balance, earned } = useHousehold();
  const [petting, setPetting] = useState(false);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = useNow(30_000);

  const cat = computeCat(purchases, now);
  const name = household?.catName?.trim() || DEFAULT_CAT_NAME;

  function pet() {
    // Purely for fun — petting is free and stored nowhere
    setPetting(true);
    window.setTimeout(() => setPetting(false), 1200);
  }

  async function rename() {
    const next = window.prompt('Hoe heet jullie kat?', name)?.trim();
    if (!next || next === name) return;
    try {
      await updateDoc(doc(db, 'households', householdId), { catName: next.slice(0, 24) });
    } catch (err) {
      setError(dutchError(err, 'Kon de naam niet opslaan.'));
    }
  }

  function unavailableReason(item: ShopItem): string | null {
    if (item.kind === 'permanent' && cat.owned.has(item.id)) return 'In huis ✓';
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
      pet();
    } catch (err) {
      setError(dutchError(err, 'Kopen lukte niet.'));
    } finally {
      setBusyItem(null);
    }
  }

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
              mood={petting ? 'happy' : cat.mood}
              fullness={cat.fullness}
              owned={cat.owned}
              petting={petting}
              onPet={pet}
            />
            {petting && (
              <>
                <span className="cat-heart" style={{ left: '44%', animationDelay: '0ms' }}>💕</span>
                <span className="cat-heart" style={{ left: '54%', animationDelay: '150ms' }}>❤️</span>
                <span className="cat-heart" style={{ left: '49%', animationDelay: '300ms' }}>💕</span>
              </>
            )}
          </div>
          <p className="cat-mood">{petting ? `Prrrr… ${name} spint.` : moodText(cat.mood, name)}</p>
          <p className="cat-hint">Tik op {name} om te aaien</p>

          <StatBar label="Voerbak" emoji="🥣" value={cat.fullness} warn={cat.fullness < 25} />
          <StatBar label="Geluk" emoji="💛" value={cat.happiness} warn={cat.happiness < 40} />
        </div>

        {error && (
          <p style={{ color: 'var(--color-danger)', fontSize: 13, margin: '12px 0' }}>{error}</p>
        )}

        <p className="section-label">Winkeltje</p>
        {SHOP_ITEMS.map((item) => {
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
