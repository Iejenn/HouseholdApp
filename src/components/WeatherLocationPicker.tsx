import { useState } from 'react';
import type { FormEvent } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useHousehold } from '../context/HouseholdContext';
import { currentPosition, searchPlaces } from '../lib/weather';
import { dutchError } from '../lib/firebaseErrors';
import type { WeatherLocation } from '../types';
import { t } from '../i18n';

// Set where the weather is for: the phone's location once, or a typed town.
// Stored on the household, so it only needs doing on one phone.
export default function WeatherLocationPicker({ onDone }: { onDone?: () => void }) {
  const { householdId, household } = useHousehold();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WeatherLocation[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(loc: WeatherLocation) {
    await updateDoc(doc(db, 'households', householdId), { location: loc });
    setResults(null);
    setQuery('');
    onDone?.();
  }

  async function useMyLocation() {
    setBusy(true);
    setError(null);
    try {
      await save(await currentPosition());
    } catch (err) {
      setError(dutchError(err, t('Locatie lukte niet.')));
    } finally {
      setBusy(false);
    }
  }

  async function search(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const found = await searchPlaces(query.trim());
      setResults(found);
      if (found.length === 0) setError(t('Geen plaats gevonden met die naam.'));
    } catch (err) {
      setError(dutchError(err, t('Zoeken lukte niet.')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {household?.location && (
        <p className="settings-note">
          {t('Nu:')} <strong>{household.location.name}</strong>
        </p>
      )}
      <button className="btn btn-secondary btn-block" onClick={useMyLocation} disabled={busy} style={{ marginBottom: 10 }}>
        {t('📍 Gebruik mijn locatie')}
      </button>
      <form onSubmit={search} style={{ display: 'flex', gap: 8 }}>
        <input
          className="input"
          placeholder={t('Of typ een plaats, bijv. Utrecht')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn btn-ghost header-btn" type="submit" disabled={busy || !query.trim()}>
          {t('Zoek')}
        </button>
      </form>
      {results && results.length > 0 && (
        <div className="chip-row" style={{ marginTop: 10 }}>
          {results.map((r) => (
            <button key={`${r.lat},${r.lon}`} className="chip" onClick={() => save(r)}>
              {r.name}
            </button>
          ))}
        </div>
      )}
      {error && <p className="settings-note" style={{ color: 'var(--color-danger)', marginTop: 8 }}>{error}</p>}
      <p className="settings-note" style={{ marginTop: 8, marginBottom: 0 }}>
        {t('De locatie wordt één keer gevraagd en afgerond op ongeveer 1 km. Hij wordt niet gevolgd.')}
      </p>
    </div>
  );
}
