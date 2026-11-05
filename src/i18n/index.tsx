import { Fragment, createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '../context/AuthContext';
import { STORAGE_KEY, currentLang, setCurrentLang } from './core';
import type { Lang } from './core';

export * from './core';

// Language switching for React; the translations themselves live in core.ts
const LanguageContext = createContext<{ lang: Lang; setLang: (lang: Lang) => Promise<void> }>({
  lang: currentLang(),
  setLang: async () => {},
});

export function useLanguage() {
  return useContext(LanguageContext);
}

function remember(lang: Lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang); // also read by the loading screen in index.html
  } catch {
    // fine without
  }
}

// Follows the language saved in your profile (users/{uid}.language), so it's
// the same on all your devices and the server sends notifications in it too
export function LanguageProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const [lang, setLangState] = useState<Lang>(currentLang());
  // Profiles from before languages existed have always used the app in
  // Dutch, so they stay Dutch (new accounts get their phone's language)
  const saved: Lang | undefined = profile ? (profile.language ?? 'nl') : undefined;
  const missing = !!profile && !profile.language;

  useEffect(() => {
    if (saved) {
      setLangState(saved);
      remember(saved);
    }
  }, [saved]);

  // ...and store that, so the server sends their notifications in Dutch too
  useEffect(() => {
    if (user && missing) {
      setDoc(doc(db, 'users', user.uid), { language: 'nl' }, { merge: true }).catch(() => {});
    }
  }, [user, missing]);

  async function setLang(next: Lang) {
    setLangState(next);
    remember(next);
    if (user) await setDoc(doc(db, 'users', user.uid), { language: next }, { merge: true });
  }

  // Set before the children render, so every t() call below uses it
  setCurrentLang(lang);
  document.documentElement.lang = lang;

  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      {/* key: switching language redraws every screen in the new language */}
      <Fragment key={lang}>{children}</Fragment>
    </LanguageContext.Provider>
  );
}
