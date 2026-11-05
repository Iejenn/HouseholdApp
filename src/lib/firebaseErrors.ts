import { t } from '../i18n/core';

// Firebase error messages are technical — show friendly ones instead (in
// Dutch here, translated by t() when shown)
const MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'Onjuist e-mailadres of wachtwoord.',
  'auth/wrong-password': 'Onjuist e-mailadres of wachtwoord.',
  'auth/user-not-found': 'Onjuist e-mailadres of wachtwoord.',
  'auth/invalid-email': 'Dit is geen geldig e-mailadres.',
  'auth/email-already-in-use': 'Er bestaat al een account met dit e-mailadres.',
  'auth/weak-password': 'Kies een wachtwoord van minstens 6 tekens.',
  'auth/too-many-requests': 'Te veel pogingen. Probeer het over een paar minuten opnieuw.',
  'auth/network-request-failed': 'Geen verbinding. Controleer je internet.',
  'permission-denied': 'Geen toestemming voor deze actie.',
  unavailable: 'Geen verbinding. Controleer je internet.',
};

export function dutchError(err: unknown, fallback = t('Er ging iets mis.')): string {
  const code = typeof err === 'object' && err && 'code' in err ? String(err.code) : '';
  if (code && MESSAGES[code]) return t(MESSAGES[code]);
  // Our own thrown errors (and the Cloud Functions') are Dutch text, so they
  // go through t() too; Firebase's own ones start with "Firebase:"
  if (err instanceof Error && !err.message.startsWith('Firebase')) return t(err.message);
  return fallback;
}
