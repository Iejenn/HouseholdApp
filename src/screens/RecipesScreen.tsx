import { useState } from 'react';
import { addDoc, collection, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '../context/AuthContext';
import { useHousehold } from '../context/HouseholdContext';
import { useRecipes } from '../hooks/useRecipes';
import { useUndoableDelete } from '../hooks/useUndoableDelete';
import SwipeToDelete from '../components/SwipeToDelete';
import UndoToast from '../components/UndoToast';
import { addIngredientsToGroceries, addResultText, parseIngredients } from '../lib/groceries';
import { searchRecipes } from '../lib/menu';
import { dutchError } from '../lib/firebaseErrors';
import type { Recipe } from '../types';

// Recipe library (Gerechten). Opened from the Weekmenu and Boodschappen
// screens as a page on top, so it doesn't need a tab of its own.
export default function RecipesScreen({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const { householdId } = useHousehold();
  const recipes = useRecipes(householdId);
  const [editing, setEditing] = useState<Recipe | 'new' | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const swipe = useUndoableDelete<Recipe>((recipe) => {
    deleteDoc(doc(db, 'households', householdId, 'recipes', recipe.id)).catch((err) =>
      console.error('Failed to delete recipe', err)
    );
  });

  async function addAll(recipe: Recipe) {
    if (!user) return;
    setBusyId(recipe.id);
    try {
      flash(addResultText(await addIngredientsToGroceries(householdId, user.uid, recipe.ingredients)));
    } catch (err) {
      flash(dutchError(err, 'Toevoegen lukte niet.'));
    } finally {
      setBusyId(null);
    }
  }

  function flash(text: string) {
    setInfo(text);
    window.setTimeout(() => setInfo((cur) => (cur === text ? null : cur)), 3500);
  }

  const visible = searchRecipes(recipes, query).filter((r) => r.id !== swipe.pending?.id);

  return (
    <div className="page-overlay">
      <div className="app-header">
        <div>
          <button className="link-button back-button" onClick={onClose}>
            ‹ Terug
          </button>
          <h2 className="household-name">📖 Gerechten</h2>
          <p style={{ fontSize: 13, color: 'var(--color-ink-soft)', marginTop: 2 }}>
            {recipes.length === 0
              ? 'Jullie vaste gerechten, met ingrediënten'
              : `${recipes.length} ${recipes.length === 1 ? 'gerecht' : 'gerechten'}`}
          </p>
        </div>
      </div>

      <div className="app-content narrow-content">
        {recipes.length > 0 && (
          <input
            className="input recipe-search"
            type="search"
            placeholder="🔍 Zoek op gerecht of ingrediënt…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
        {query.trim() && visible.length === 0 && (
          <p className="empty-state" style={{ padding: '24px 20px' }}>
            Geen gerecht gevonden met "{query.trim()}".
          </p>
        )}
        {!query.trim() && visible.length === 0 && (
          <p className="empty-state">
            🍝
            <br />
            Nog geen gerechten. Tik op + om jullie eerste toe te voegen.
          </p>
        )}

        {visible.map((r) => (
          <SwipeToDelete key={r.id} onDelete={() => swipe.remove(r)} onSwipeLeft={() => setEditing(r)}>
            <div className="recipe-card">
              <div className="task-info" onClick={() => setEditing(r)} style={{ cursor: 'pointer' }}>
                <p className="task-title">{r.name}</p>
                <p className="task-meta recipe-ingredients">
                  {r.ingredients.length > 0 ? r.ingredients.join(', ') : 'Nog geen ingrediënten'}
                </p>
              </div>
              <button
                className="btn btn-secondary recipe-add"
                onClick={() => addAll(r)}
                disabled={busyId !== null || r.ingredients.length === 0}
              >
                {busyId === r.id ? '…' : '🛒 Alles'}
              </button>
            </div>
          </SwipeToDelete>
        ))}

        {visible.length > 0 && (
          <p className="swipe-hint">
            🛒 Alles = alle ingrediënten naar de boodschappen. Tik om te bewerken, swipe naar rechts om te verwijderen.
          </p>
        )}
      </div>

      {swipe.pending && <UndoToast label={swipe.pending.name} onUndo={swipe.undo} />}
      {info && !swipe.pending && <div className="undo-toast info-toast">{info}</div>}

      <button className="fab" onClick={() => setEditing('new')} aria-label="Gerecht toevoegen">
        +
      </button>

      {editing && (
        <RecipeEditor
          key={editing === 'new' ? 'new' : editing.id}
          recipe={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// Add or edit one recipe: a name plus ingredients (one per line or comma-separated)
export function RecipeEditor({
  recipe,
  onClose,
  onSaved,
  initialName = '',
}: {
  recipe: Recipe | null;
  onClose: () => void;
  onSaved?: (id: string) => void;
  // Pre-filled name for a new recipe, e.g. what you searched for
  initialName?: string;
}) {
  const { user } = useAuth();
  const { householdId } = useHousehold();
  const [name, setName] = useState(recipe?.name ?? initialName);
  const [ingredientsText, setIngredientsText] = useState(recipe?.ingredients.join('\n') ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsed = parseIngredients(ingredientsText);

  async function save() {
    if (!user) return;
    if (!name.trim()) {
      setError('Geef het gerecht een naam.');
      return;
    }
    if (parsed.length > 50) {
      setError('Maximaal 50 ingrediënten.');
      return;
    }
    setBusy(true);
    try {
      if (recipe) {
        await updateDoc(doc(db, 'households', householdId, 'recipes', recipe.id), {
          name: name.trim().slice(0, 60),
          ingredients: parsed,
        });
        onSaved?.(recipe.id);
      } else {
        const ref = await addDoc(collection(db, 'households', householdId, 'recipes'), {
          name: name.trim().slice(0, 60),
          ingredients: parsed,
          createdAt: Date.now(),
          createdBy: user.uid,
        });
        onSaved?.(ref.id);
      }
      onClose();
    } catch (err) {
      setError(dutchError(err, 'Opslaan lukte niet.'));
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{recipe ? 'Gerecht bewerken' : 'Nieuw gerecht'}</h3>

        <div style={{ marginBottom: 14 }}>
          <input
            className="input"
            placeholder="Naam, bijv. Pasta Pesto"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            autoFocus={!recipe}
          />
        </div>

        <span className="field-label">Ingrediënten</span>
        <textarea
          className="input recipe-textarea"
          placeholder={'Eén per regel, of met komma’s:\nKipfilet, Pasta, Groene pesto'}
          value={ingredientsText}
          onChange={(e) => setIngredientsText(e.target.value)}
          rows={7}
        />
        {parsed.length > 0 && (
          <div className="chip-row" style={{ marginTop: 8 }}>
            {parsed.map((i) => (
              <span key={i} className="chip chip-static">
                {i}
              </span>
            ))}
          </div>
        )}

        {error && <p style={{ color: 'var(--color-danger)', fontSize: 13, margin: '8px 0 12px' }}>{error}</p>}

        <button className="btn btn-primary btn-block" onClick={save} disabled={busy} style={{ margin: '12px 0 8px' }}>
          {busy ? 'Even geduld…' : 'Opslaan'}
        </button>
        <button className="btn btn-ghost btn-block" onClick={onClose}>
          Annuleren
        </button>
      </div>
    </div>
  );
}
