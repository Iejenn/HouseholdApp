import { useEffect, useState } from 'react';
import { arrayRemove, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '../context/AuthContext';
import { useHousehold } from '../context/HouseholdContext';
import WeatherLocationPicker from '../components/WeatherLocationPicker';
import CalendarSettings from '../components/CalendarSettings';
import { disablePush, enablePush, pushStatus, sendTestPush } from '../lib/push';
import type { PushStatus } from '../lib/push';
import { dutchError } from '../lib/firebaseErrors';
import { activeVacation, setVacation } from '../lib/vacation';
import type { NotifyPrefs } from '../types';
import { LANGUAGES, locale, t, useLanguage } from '../i18n';
import WhatsNew from '../components/WhatsNew';
import { CHANGELOG } from '../data/changelog';

const PREFS: { key: keyof NotifyPrefs; label: string; description: string }[] = [
  { key: 'chat', label: 'Briefjes op het prikbord', description: 'Als je partner een post-it plakt' },
  { key: 'groceries', label: 'Boodschappen', description: 'Als je partner iets op de lijst zet' },
  { key: 'nudge', label: 'Porren', description: 'Als je partner je vraagt een taak te doen' },
  { key: 'daily', label: 'Dagelijkse herinnering', description: 'Om 8:30 als er taken te laat zijn of de kat honger heeft' },
  { key: 'weekly', label: 'Weekoverzicht', description: 'Maandag om 9:00: wie deed wat, en welke ruimte de meeste aandacht kreeg' },
];

export default function SettingsScreen() {
  const { user, profile, signOut } = useAuth();
  const { householdId, household, memberNames } = useHousehold();
  const { lang, setLang } = useLanguage();
  const [showChanges, setShowChanges] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const vacation = activeVacation(household);
  const [vacationError, setVacationError] = useState<string | null>(null);

  async function toggleVacation(on: boolean) {
    if (!user) return;
    setVacationError(null);
    try {
      await setVacation(householdId, user.uid, on);
    } catch (err) {
      setVacationError(dutchError(err, t('Vakantiemodus wijzigen lukte niet.')));
    }
  }

  // Takes someone off the member list. Their phone notices and goes back to
  // the create/join screen; the household and all its data stay with you.
  async function removeMember(memberUid: string) {
    const name = memberNames[memberUid] ?? t('deze persoon');
    if (!window.confirm(t('{name} uit het huishouden verwijderen? Met de uitnodigingscode kan diegene later opnieuw aansluiten.', { name }))) {
      return;
    }
    setRemoveError(null);
    try {
      await updateDoc(doc(db, 'households', householdId), { memberIds: arrayRemove(memberUid) });
    } catch (err) {
      setRemoveError(dutchError(err, t('Verwijderen lukte niet.')));
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
      setMessage({ text: dutchError(err, t('Meldingen aanzetten lukte niet.')), error: true });
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
      setMessage({ text: t('Testmelding verstuurd — hij komt zo binnen.') });
    } catch (err) {
      setMessage({ text: dutchError(err, t('Versturen lukte niet. Staan de Cloud Functions al online?')), error: true });
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
          <h2 className="household-name">{t('Instellingen')}</h2>
          <p style={{ fontSize: 13, color: 'var(--color-ink-soft)', marginTop: 2 }}>
            {t('Ingelogd als {name}', { name: profile?.displayName ?? '' })}
          </p>
        </div>
      </div>

      <div className="app-content narrow-content">
        {/* Language: in both languages, so you can always find it */}
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="card-title">🌐 Taal · Language</p>
          <div className="segmented" role="radiogroup" aria-label="Taal · Language" style={{ marginBottom: 0 }}>
            {LANGUAGES.map((l) => (
              <button
                key={l.id}
                role="radio"
                aria-checked={lang === l.id}
                className={`segmented-item${lang === l.id ? ' active' : ''}`}
                onClick={() => setLang(l.id).catch(() => {})}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <p className="card-title">{t('🔔 Push-meldingen op deze telefoon')}</p>

          {status === null && <p className="settings-note">{t('Even kijken…')}</p>}
          {status === 'not-configured' && (
            <p className="settings-note">{t('Meldingen zijn nog niet ingesteld in de app (de Web Push-sleutel ontbreekt).')}</p>
          )}
          {status === 'unsupported' && (
            <p className="settings-note">
              {t('Deze browser ondersteunt geen push-meldingen. Gebruik Chrome op Android en installeer de app op je startscherm.')}
            </p>
          )}
          {status === 'denied' && (
            <p className="settings-note">
              {t('Meldingen zijn geblokkeerd. Zet ze weer aan via Chrome: ⋮ → Instellingen → Site-instellingen → Meldingen, of houd het app-icoon ingedrukt → App-info → Meldingen.')}
            </p>
          )}
          {status === 'off' && (
            <button className="btn btn-primary btn-block" onClick={turnOn} disabled={busy}>
              {busy ? t('Even geduld…') : t('Meldingen aanzetten')}
            </button>
          )}
          {status === 'on' && (
            <>
              <p className="settings-note" style={{ color: 'var(--color-sage)', fontWeight: 700 }}>
                {t('✓ Staan aan op deze telefoon')}
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={test} disabled={busy}>
                  {t('Stuur testmelding')}
                </button>
                <button className="btn btn-ghost" onClick={turnOff} disabled={busy}>
                  {t('Uitzetten')}
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
          <p className="card-title">{t('📅 Google Agenda')}</p>
          <CalendarSettings />
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <p className="card-title">{t('🌤️ Weer op het startscherm')}</p>
          <WeatherLocationPicker />
        </div>

        {/* For the whole household: no reminders, and the cat doesn't get
            hungry. Tasks do keep ageing, so you see what's waiting when back. */}
        <div className="card" style={{ marginBottom: 16 }}>
          <label className="toggle-row" style={{ borderTop: 'none', paddingTop: 0 }}>
            <span>
              <span className="toggle-label">{t('🏖️ Vakantiemodus')}</span>
              <span className="toggle-description">
                {vacation
                  ? t('Staat aan sinds {date} ({name})', {
                      date: new Date(vacation.from).toLocaleDateString(locale(), { day: 'numeric', month: 'long' }),
                      name: memberNames[vacation.by] ?? '…',
                    })
                  : t('Voor jullie allebei: geen ochtendherinnering en geen weekoverzicht, en de kat krijgt geen honger. Taken lopen gewoon door, zodat je bij thuiskomst ziet wat er ligt.')}
              </span>
            </span>
            <input
              type="checkbox"
              className="switch"
              checked={!!vacation}
              onChange={(e) => toggleVacation(e.target.checked)}
            />
          </label>
          {vacationError && (
            <p className="settings-note" style={{ color: 'var(--color-danger)', marginTop: 8, marginBottom: 0 }}>
              {vacationError}
            </p>
          )}
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <p className="card-title">{t('Waarover wil je een melding?')}</p>
          {PREFS.map((p) => {
            const on = profile?.notify?.[p.key] !== false;
            return (
              <label className="toggle-row" key={p.key}>
                <span>
                  <span className="toggle-label">{t(p.label)}</span>
                  <span className="toggle-description">{t(p.description)}</span>
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
              {t('Uitnodigingscode:')} <span className="invite-code" style={{ marginTop: 0 }}>{household.inviteCode}</span>
            </p>
            {household.memberIds.map((memberUid) => (
              <div className="toggle-row" key={memberUid}>
                <span className="toggle-label">
                  {memberNames[memberUid] ?? '…'}
                  {memberUid === user?.uid ? ` ${t('(jij)')}` : ''}
                </span>
                {memberUid !== user?.uid && (
                  <button className="btn btn-ghost member-remove" onClick={() => removeMember(memberUid)}>
                    {t('Verwijderen')}
                  </button>
                )}
              </div>
            ))}
            {household.memberIds.length < 2 && (
              <p className="settings-note" style={{ marginTop: 10, marginBottom: 0 }}>
                {t('Nog plek voor één persoon: deel de code hierboven.')}
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
          onClick={() => window.confirm(t('Wil je uitloggen?')) && signOut()}
        >
          {t('🚪 Uitloggen')}
        </button>

        {/* Version = build date; the link shows the recent changes again */}
        <p className="app-version">
          {t('Versie {version}', { version: __APP_VERSION__ })} ·{' '}
          <button className="link-button" onClick={() => setShowChanges(true)}>
            {t('Wat is er nieuw?')}
          </button>
        </p>
        {showChanges && <WhatsNew entries={CHANGELOG.slice(0, 5)} onClose={() => setShowChanges(false)} />}
      </div>
    </>
  );
}
