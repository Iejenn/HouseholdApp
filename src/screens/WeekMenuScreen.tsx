import { useEffect, useState } from 'react';
import { deleteField, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '../context/AuthContext';
import { useHousehold } from '../context/HouseholdContext';
import { useNow } from '../hooks/useNow';
import { useRecipes } from '../hooks/useRecipes';
import RecipesScreen, { RecipeEditor } from './RecipesScreen';
import { DAY_KEYS, DAY_NAMES, addDays, mondayOf, shortDate, weekId, weekRangeLabel } from '../lib/week';
import { addIngredientsToGroceries, addResultText } from '../lib/groceries';
import { DEFAULT_DISHES, resolveDay, searchRecipes } from '../lib/menu';
import { dutchError } from '../lib/firebaseErrors';
import type { DayKey, Recipe, WeekMenu } from '../types';

export default function WeekMenuScreen() {
  const { user } = useAuth();
  const { householdId } = useHousehold();
  const recipes = useRecipes(householdId);
  const now = useNow();
  const [weekOffset, setWeekOffset] = useState(0);
  const [menu, setMenu] = useState<WeekMenu | null>(null);
  const [picking, setPicking] = useState<DayKey | null>(null);
  const [showRecipes, setShowRecipes] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const monday = addDays(mondayOf(new Date(now)), weekOffset * 7);
  const id = weekId(monday);
  const todayKey = weekOffset === 0 ? DAY_KEYS[(new Date(now).getDay() + 6) % 7] : null;

  useEffect(() => {
    setMenu(null);
    const unsub = onSnapshot(doc(db, 'households', householdId, 'weekMenus', id), (snap) => {
      setMenu(snap.exists() ? (snap.data() as WeekMenu) : { days: {}, updatedAt: 0 });
    });
    return unsub;
  }, [householdId, id]);

  function flash(text: string) {
    setInfo(text);
    window.setTimeout(() => setInfo((cur) => (cur === text ? null : cur)), 3500);
  }

  // value: a recipe id, null = nothing, 'default' = back to the default (Patat)
  async function setDay(key: DayKey, value: string | null | 'default') {
    try {
      // merge: only this one day changes, so you can both plan at the same time
      await setDoc(
        doc(db, 'households', householdId, 'weekMenus', id),
        { days: { [key]: value === 'default' ? deleteField() : value }, updatedAt: Date.now() },
        { merge: true }
      );
    } catch (err) {
      flash(dutchError(err, 'Opslaan lukte niet.'));
    }
  }

  async function sendToGroceries(label: string, ingredients: string[]) {
    if (!user) return;
    setBusy(label);
    try {
      flash(addResultText(await addIngredientsToGroceries(householdId, user.uid, ingredients)));
    } catch (err) {
      flash(dutchError(err, 'Toevoegen lukte niet.'));
    } finally {
      setBusy(null);
    }
  }

  const planned = DAY_KEYS.map((key) => ({ key, plan: resolveDay(key, menu, recipes) }));
  const weekIngredients = planned.flatMap(({ plan }) => (plan.kind === 'recipe' ? plan.recipe.ingredients : []));

  if (showRecipes) return <RecipesScreen onClose={() => setShowRecipes(false)} />;

  return (
    <>
      <div className="app-header">
        <div>
          <h2 className="household-name">Weekmenu</h2>
          <div className="week-nav">
            <button className="week-arrow" onClick={() => setWeekOffset((w) => w - 1)} aria-label="Vorige week">
              ‹
            </button>
            <span className="week-label">
              {weekRangeLabel(monday)} · week {Number(id.slice(-2))}
            </span>
            <button className="week-arrow" onClick={() => setWeekOffset((w) => w + 1)} aria-label="Volgende week">
              ›
            </button>
            {weekOffset !== 0 && (
              <button className="link-button" onClick={() => setWeekOffset(0)} style={{ fontSize: 12 }}>
                Deze week
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="menu-actions">
        <button
          className="btn btn-primary"
          onClick={() => sendToGroceries('week', weekIngredients)}
          disabled={busy !== null || weekIngredients.length === 0}
        >
          {busy === 'week' ? 'Even geduld…' : '🛒 Hele week naar boodschappen'}
        </button>
        <button className="btn btn-ghost" onClick={() => setShowRecipes(true)}>
          📖 Gerechten
        </button>
      </div>

      <div className="app-content">
        {/* A grid of day cards on wide screens, one column on phones */}
        <div className="day-grid">
          {planned.map(({ key, plan }, i) => {
            const date = addDays(monday, i);
            const isToday = key === todayKey;
            return (
              <div key={key} className={`day-card day-${key}${isToday ? ' today' : ''}`}>
                <div className="day-head">
                  <span className="day-name">{DAY_NAMES[key]}</span>
                  <span className="day-date">{shortDate(date)}</span>
                  {isToday && <span className="day-today">Vandaag</span>}
                </div>
                <button className="day-body" onClick={() => setPicking(key)}>
                  {plan.kind === 'recipe' && (
                    <>
                      <span className="day-dish">
                        {plan.recipe.name}
                        {plan.isDefault && <span className="day-default"> · vaste {DAY_NAMES[key].toLowerCase()}</span>}
                      </span>
                      <span className="day-ingredients">
                        {plan.recipe.ingredients.join(', ') || 'Geen ingrediënten ingevuld'}
                      </span>
                    </>
                  )}
                  {plan.kind === 'default-missing' && (
                    <>
                      <span className="day-dish">{plan.name} 🍟</span>
                      <span className="day-ingredients">
                        Tip: maak een gerecht "{plan.name}" aan voor de ingrediënten
                      </span>
                    </>
                  )}
                  {plan.kind === 'deleted' && <span className="day-empty">Gerecht is verwijderd — kies opnieuw</span>}
                  {plan.kind === 'none' && <span className="day-empty">+ Kies een gerecht</span>}
                </button>
                {plan.kind === 'recipe' && (
                  <div className="day-buttons">
                    <button
                      className="btn btn-secondary day-btn"
                      onClick={() => sendToGroceries(key, plan.recipe.ingredients)}
                      disabled={busy !== null || plan.recipe.ingredients.length === 0}
                    >
                      {busy === key ? '…' : '🛒 Naar boodschappen'}
                    </button>
                    <button className="btn btn-ghost day-btn" onClick={() => setDay(key, null)}>
                      Wissen
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Hidden while choosing a dish, so it doesn't cover the list */}
      {info && !picking && <div className="undo-toast info-toast">{info}</div>}

      {picking && (
        <RecipePicker
          day={picking}
          recipes={recipes}
          current={menu?.days[picking]}
          onPick={(value) => {
            setDay(picking, value);
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      )}
    </>
  );
}

// Choose a dish for one day: one of the recipes, nothing, or a brand new one
function RecipePicker({
  day,
  recipes,
  current,
  onPick,
  onClose,
}: {
  day: DayKey;
  recipes: Recipe[];
  current: string | null | undefined;
  onPick: (value: string | null | 'default') => void;
  onClose: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState('');
  // Searches names and ingredients, so it stays usable with 20–30+ dishes
  const shown = searchRecipes(recipes, filter);

  if (creating) {
    // New recipe straight from the menu: save it and plan it on this day.
    // A search that found nothing becomes the suggested name.
    return (
      <RecipeEditor
        recipe={null}
        initialName={shown.length === 0 ? filter.trim() : ''}
        onClose={onClose}
        onSaved={(newId) => onPick(newId)}
      />
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Wat eten we {DAY_NAMES[day].toLowerCase()}?</h3>
        {recipes.length > 0 && (
          <input
            className="input"
            type="search"
            placeholder="🔍 Zoek op gerecht of ingrediënt…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            // Only jump into the search box when the list is long (saves a
            // keyboard popping up on phones for a short list)
            autoFocus={recipes.length > 8}
            style={{ marginBottom: 12 }}
          />
        )}
        <div className="picker-list">
          {shown.map((r) => (
            <button
              key={r.id}
              className={`picker-item${current === r.id ? ' active' : ''}`}
              onClick={() => onPick(r.id)}
            >
              <span className="picker-name">{r.name}</span>
              <span className="picker-sub">{r.ingredients.join(', ')}</span>
            </button>
          ))}
          {recipes.length === 0 && <p className="settings-note">Nog geen gerechten in de bibliotheek.</p>}
          {recipes.length > 0 && shown.length === 0 && (
            <p className="settings-note">Geen gerecht gevonden met "{filter.trim()}".</p>
          )}
        </div>
        <button className="btn btn-secondary btn-block" onClick={() => setCreating(true)} style={{ margin: '12px 0 8px' }}>
          {shown.length === 0 && filter.trim() ? `+ Nieuw gerecht "${filter.trim()}"` : '+ Nieuw gerecht'}
        </button>
        {DEFAULT_DISHES[day] && (
          // Clearing the stored value brings back the default (e.g. Patat)
          <button className="btn btn-ghost btn-block" onClick={() => onPick('default')}>
            Terug naar {DEFAULT_DISHES[day]}
          </button>
        )}
        <button className="btn btn-ghost btn-block" onClick={() => onPick(null)}>
          Niets plannen
        </button>
      </div>
    </div>
  );
}
