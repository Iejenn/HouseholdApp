import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '../context/AuthContext';
import { forgetCachedEvents, startCalendarLink, unlinkCalendar } from '../lib/calendar';
import { dutchError } from '../lib/firebaseErrors';
import { t } from '../i18n';

// "Agenda koppelen": read-only Google Calendar access. You pick which of your
// calendars are shown on the home screen (none until you tick one).
export default function CalendarSettings() {
  const { user, profile } = useAuth();
  const link = profile?.calendar;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      await startCalendarLink(); // leaves the app for Google's sign-in
    } catch (err) {
      setError(dutchError(err, t('Koppelen starten lukte niet.')));
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!window.confirm(t('Agenda ontkoppelen? De app kan je agenda dan niet meer lezen.'))) return;
    setBusy(true);
    setError(null);
    try {
      await unlinkCalendar();
    } catch (err) {
      setError(dutchError(err, t('Ontkoppelen lukte niet.')));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(id: string, on: boolean) {
    if (!user || !link) return;
    const selected = on ? [...new Set([...link.selected, id])] : link.selected.filter((s) => s !== id);
    // Only your own choice; the token itself never comes near the app
    await updateDoc(doc(db, 'users', user.uid), { 'calendar.selected': selected });
    forgetCachedEvents();
  }

  if (!link) {
    return (
      <>
        <p className="settings-note">
          {t('Zie jullie afspraken op het startscherm. De app krijgt alleen')} <strong>{t('leesrechten')}</strong>{' '}
          {t("en jij kiest welke agenda's zichtbaar zijn.")}
        </p>
        <button className="btn btn-secondary btn-block" onClick={connect} disabled={busy}>
          {busy ? t('Even geduld…') : t('📅 Agenda koppelen')}
        </button>
        <p className="settings-note" style={{ marginTop: 8, marginBottom: 0 }}>
          {t('Google laat eenmalig "app niet geverifieerd" zien: kies')} <em>{t('Geavanceerd → Ga naar Huishouden')}</em>.
        </p>
        {error && <p className="settings-note" style={{ color: 'var(--color-danger)', marginTop: 8 }}>{error}</p>}
      </>
    );
  }

  return (
    <>
      <p className="settings-note">
        {t('Gekoppeld met')} <strong>{link.email || 'Google'}</strong>.{' '}
        {t("Kies welke agenda's op het startscherm komen (voor jullie allebei zichtbaar):")}
      </p>
      {link.needsRelink && (
        <p className="settings-note" style={{ color: 'var(--color-danger)' }}>
          {t('De koppeling werkt niet meer (ingetrokken of verlopen). Ontkoppel en koppel opnieuw.')}
        </p>
      )}
      {link.available.map((c) => (
        <label className="toggle-row" key={c.id}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span className="calendar-dot" style={{ background: c.color }} />
            <span className="toggle-label" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {c.name}
              {c.primary ? ' (hoofdagenda)' : ''}
            </span>
          </span>
          <input
            type="checkbox"
            className="switch"
            checked={link.selected.includes(c.id)}
            onChange={(e) => toggle(c.id, e.target.checked)}
          />
        </label>
      ))}
      <button className="btn btn-ghost btn-block" onClick={disconnect} disabled={busy} style={{ marginTop: 8 }}>
        {t('Ontkoppelen')}
      </button>
      {error && <p className="settings-note" style={{ color: 'var(--color-danger)', marginTop: 8 }}>{error}</p>}
    </>
  );
}
