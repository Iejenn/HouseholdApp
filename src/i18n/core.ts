import { EN } from './en';

// Translations. The Dutch text itself is the key: t('Boodschappen') gives
// "Boodschappen" in Dutch and "Groceries" in English (from en.ts). Anything
// missing from en.ts simply stays Dutch, so nothing ever shows up empty.
//
// Variables go in {braces}: t('{n} te halen', { n: 4 }) → "4 te halen" /
// "4 to get".
//
// (No React in this file, so plain helpers and AuthContext can use it too.)

export type Lang = 'nl' | 'en';
export const LANGUAGES: { id: Lang; label: string }[] = [
  { id: 'nl', label: 'Nederlands' },
  { id: 'en', label: 'English' },
];

export const STORAGE_KEY = 'lang';

// Before the profile has loaded (or when logged out): the last choice on
// this phone, otherwise the phone's own language
function deviceLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'nl' || stored === 'en') return stored;
  } catch {
    // no storage: fall through
  }
  return navigator.language?.toLowerCase().startsWith('nl') ? 'nl' : 'en';
}

let current: Lang = deviceLang();

// Called by the LanguageProvider when the language changes
export function setCurrentLang(lang: Lang) {
  current = lang;
}

export function currentLang(): Lang {
  return current;
}

// For dates and numbers (Intl)
export function locale(): string {
  return current === 'nl' ? 'nl-NL' : 'en-GB';
}

export function t(nl: string, vars?: Record<string, string | number>): string {
  const text = current === 'en' ? (EN[nl] ?? nl) : nl;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}

