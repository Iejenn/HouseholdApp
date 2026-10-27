import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { dutchError } from '../lib/firebaseErrors';

export default function LoginScreen() {
  const { user, profileError, signIn, signUp, signOut, resetPassword } = useAuth();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleForgotPassword() {
    setError(null);
    setInfo(null);
    if (!email.trim()) {
      setError('Vul eerst je e-mailadres in en tik dan opnieuw op "Wachtwoord vergeten?".');
      return;
    }
    setBusy(true);
    try {
      await resetPassword(email.trim());
      // Same message whether or not the account exists, so this can't be
      // used to check which emails are registered
      setInfo('Als er een account bij dit e-mailadres hoort, is er een resetlink onderweg. Kijk ook in je spam.');
    } catch (err) {
      setError(dutchError(err, 'Kon de resetmail niet versturen.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!email || !password || (mode === 'signUp' && !displayName)) {
      setError('Vul alle velden in.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signIn') {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password, displayName.trim());
      }
    } catch (err) {
      setError(dutchError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="centered-screen">
      <div className="auth-card">
        <h1 className="brand-title">🏠 Huishouden</h1>
        <p className="brand-subtitle">
          {mode === 'signIn' ? 'Welkom terug' : 'Maak je account aan'}
        </p>

        <form onSubmit={handleSubmit}>
          {mode === 'signUp' && (
            <div style={{ marginBottom: 12 }}>
              <input
                className="input"
                placeholder="Je naam"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="name"
              />
            </div>
          )}
          <div style={{ marginBottom: 12 }}>
            <input
              className="input"
              type="email"
              placeholder="E-mailadres"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <input
              className="input"
              type="password"
              placeholder="Wachtwoord"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
            />
          </div>

          {error && (
            <p style={{ color: 'var(--color-danger)', fontSize: 13, marginBottom: 12 }}>
              {error}
            </p>
          )}
          {user && profileError && (
            <div className="card crash-card" style={{ marginBottom: 12 }}>
              <p style={{ color: 'var(--color-danger)', fontSize: 13, marginBottom: 8 }}>
                Inloggen gelukt, maar: {profileError}
              </p>
              <button type="button" className="link-button" onClick={signOut}>
                Uitloggen en opnieuw proberen
              </button>
            </div>
          )}
          {info && (
            <p style={{ color: 'var(--color-sage)', fontSize: 13, marginBottom: 12 }}>
              {info}
            </p>
          )}

          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Even geduld…' : mode === 'signIn' ? 'Inloggen' : 'Account maken'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 18 }}>
          {mode === 'signIn' && (
            <button
              type="button"
              className="link-button"
              onClick={handleForgotPassword}
              disabled={busy}
              style={{ display: 'block', margin: '0 auto 8px' }}
            >
              Wachtwoord vergeten?
            </button>
          )}
          <button
            className="link-button"
            onClick={() => {
              setMode(mode === 'signIn' ? 'signUp' : 'signIn');
              setError(null);
              setInfo(null);
            }}
          >
            {mode === 'signIn'
              ? 'Nog geen account? Registreer je'
              : 'Al een account? Log in'}
          </button>
        </div>
      </div>
    </div>
  );
}
