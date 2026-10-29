import { useEffect, useState } from 'react';
import { arrayRemove, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '../context/AuthContext';
import { useHousehold } from '../context/HouseholdContext';
import { disablePush, enablePush, pushStatus, sendTestPush } from '../lib/push';
import type { PushStatus } from '../lib/push';
import { dutchError } from '../lib/firebaseErrors';
import type { NotifyPrefs } from '../types';

const PREFS: { key: keyof NotifyPrefs; label: string; description: string }[] = [
  { key: 'chat', label: 'Chatberichten', description: 'Als je partner iets stuurt' },
  { key: 'groceries', label: 'Boodschappen', description: 'Als je partner iets op de lijst zet' },
  { key: 'nudge', label: 'Porren', description: 'Als je partner je vraagt een taak te doen' },
  { key: 'daily', label: 'Dagelijkse herinnering', description: 'Om 8:30 als er taken te laat zijn of de kat honger heeft' },
  { key: 'weekly', label: 'Weekoverzicht', description: 'Maandag om 9:00: wie deed wat, en welke ruimte de meeste aandacht kreeg' },
];

export default function SettingsScreen() {
  const { user, profile, signOut } = useAuth();
  const { householdId, household, memberNames } = useHousehold();
  const [removeError, setRemoveError] = useState<string | null>(null);

  // Takes someone off the member list. Their phone notices and goes back to
  // the create/join screen; the household and all its data stay with you.
  async function removeMember(memberUid: string) {
    const name = memberNames[memberUid] ?? 'deze persoon';
    if (!window.confirm(`${name} uit het huishouden verwijderen? Met de uitnodigingscode kan diegene later opnieuw aansluiten.`)) {
      return;
    }
    setRemoveError(null);
    try {
      await updateDoc(doc(db, 'households', householdId), { memberIds: arrayRemove(memberUid) });
    } catch (err) {
      setRemoveError(dutchError(err, 'Verwijderen lukte niet.'));
    }
  }
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    pushStatus().then(setStatus);
  }, []);

  async function turnOn() {
    if (!user) return;
    setBusy(true);
    setMessage(null);
    try {
      setStatus(await enablePush(user.uid));
    } catch (err) {
      setMessage({ text: dutchError(err, 'Meldingen aanzetten lukte niet.'), error: true });
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    if (!user) return;
    setBusy(true);
    await disablePush(user.uid);
    setStatus('off');
    setBusy(false);
  }

  async function test() {
    setBusy(true);
    setMessage(null);
    try {
      await sendTestPush();
      setMessage({ text: 'Testmelding verstuurd — hij komt zo binnen.' });
    } catch (err) {
      setMessage({ text: dutchError(err, 'Versturen lukte niet. Staan de Cloud Functions al online?'), error: true });
    } finally {
      setBusy(false);
    }
  }

  async function togglePref(key: keyof NotifyPrefs, value: boolean) {
    if (!user) return;
    // merge: only touches this one setting
    await setDoc(doc(db, 'users', user.uid), { notify: { [key]: value } }, { merge: true });
  }

  return (
    <>
      <div className="app-header">
        <div>
          <h2 className="household-name">Instellingen</h2>
          <p style={{ fontSize: 13, color: 'var(--color-ink-soft)', marginTop: 2 }}>
            Ingelogd als {profile?.displayName}
          </p>
        </div>
      </div>

      <div className="app-content">
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="card-title">🔔 Push-meldingen op deze telefoon</p>

          {status === null && <p className="settings-note">Even kijken…</p>}
          {status === 'not-configured' && (
            <p className="settings-note">Meldingen zijn nog niet ingesteld in de app (de Web Push-sleutel ontbreekt).</p>
          )}
          {status === 'unsupported' && (
            <p className="settings-note">
              Deze browser ondersteunt geen push-meldingen. Gebruik Chrome op Android en installeer de app op je
              startscherm.
            </p>
          )}
          {status === 'denied' && (
            <p className="settings-note">
              Meldingen zijn geblokkeerd. Zet ze weer aan via Chrome: ⋮ → Instellingen → Site-instellingen →
              Meldingen, of houd het app-icoon ingedrukt → App-info → Meldingen.
            </p>
          )}
          {status === 'off' && (
            <button className="btn btn-primary btn-block" onClick={turnOn} disabled={busy}>
              {busy ? 'Even geduld…' : 'Meldingen aanzetten'}
            </button>
          )}
          {status === 'on' && (
            <>
              <p className="settings-note" style={{ color: 'var(--color-sage)', fontWeight: 700 }}>
                ✓ Staan aan op deze telefoon
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={test} disabled={busy}>
                  Stuur testmelding
                </button>
                <button className="btn btn-ghost" onClick={turnOff} disabled={busy}>
                  Uitzetten
                </button>
              </div>
            </>
          )}
          {message && (
            <p
              className="settings-note"
              style={{ marginTop: 10, color: message.error ? 'var(--color-danger)' : 'var(--color-ink-soft)' }}
            >
              {message.text}
            </p>
          )}
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <p className="card-title">Waarover wil je een melding?</p>
          {PREFS.map((p) => {
            const on = profile?.notify?.[p.key] !== false;
            return (
              <label className="toggle-row" key={p.key}>
                <span>
                  <span className="toggle-label">{p.label}</span>
                  <span className="toggle-description">{p.description}</span>
                </span>
                <input
                  type="checkbox"
                  className="switch"
                  checked={on}
                  onChange={(e) => togglePref(p.key, e.target.checked)}
                />
              </label>
            );
          })}
        </div>

        {household && (
          <div className="card" style={{ marginBottom: 16 }}>
            <p className="card-title">🏠 {household.name}</p>
            <p className="settings-note">
              Uitnodigingscode: <span className="invite-code" style={{ marginTop: 0 }}>{household.inviteCode}</span>
            </p>
            {household.memberIds.map((memberUid) => (
              <div className="toggle-row" key={memberUid}>
                <span className="toggle-label">
                  {memberNames[memberUid] ?? '…'}
                  {memberUid === user?.uid ? ' (jij)' : ''}
                </span>
                {memberUid !== user?.uid && (
                  <button className="btn btn-ghost member-remove" onClick={() => removeMember(memberUid)}>
                    Verwijderen
                  </button>
                )}
              </div>
            ))}
            {household.memberIds.length < 2 && (
              <p className="settings-note" style={{ marginTop: 10, marginBottom: 0 }}>
                Nog plek voor één persoon: deel de code hierboven.
              </p>
            )}
            {removeError && (
              <p className="settings-note" style={{ color: 'var(--color-danger)', marginTop: 10, marginBottom: 0 }}>
                {removeError}
              </p>
            )}
          </div>
        )}

        <button
          className="btn btn-ghost btn-block"
          onClick={() => window.confirm('Wil je uitloggen?') && signOut()}
        >
          🚪 Uitloggen
        </button>
      </div>
    </>
  );
}
