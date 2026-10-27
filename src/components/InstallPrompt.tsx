import { useEffect, useState } from 'react';

// Chrome-only event, not in TypeScript's DOM types
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'installPromptDismissedAt';
const DISMISS_FOR_MS = 7 * 24 * 60 * 60 * 1000; // ask again after a week

const isAndroidChrome =
  /Android/i.test(navigator.userAgent) &&
  /Chrome\//.test(navigator.userAgent) &&
  // Samsung Internet, Edge, Opera etc. also say "Chrome" — skip those
  !/SamsungBrowser|EdgA|OPR|Firefox|wv\)/i.test(navigator.userAgent);

function isInstalled(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches;
}

function recentlyDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return !!at && Date.now() - at < DISMISS_FOR_MS;
  } catch {
    return false;
  }
}

// Chrome can fire this before React has mounted, so catch it at module load
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // we show our own banner instead of Chrome's mini-infobar
  deferredPrompt = e as BeforeInstallPromptEvent;
  listeners.forEach((l) => l());
});

export default function InstallPrompt() {
  const [canPrompt, setCanPrompt] = useState(deferredPrompt !== null);
  const [hidden, setHidden] = useState(
    () => !isAndroidChrome || isInstalled() || recentlyDismissed()
  );

  useEffect(() => {
    const onReady = () => setCanPrompt(true);
    const onInstalled = () => setHidden(true);
    listeners.add(onReady);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      listeners.delete(onReady);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (hidden) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // private mode etc. — banner just comes back next visit
    }
    setHidden(true);
  }

  async function install() {
    if (!deferredPrompt) return;
    const prompt = deferredPrompt;
    deferredPrompt = null; // Chrome only allows prompt() once per event
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') setHidden(true);
    else dismiss();
  }

  return (
    <div className="install-banner">
      <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" className="install-icon" />
      <div className="install-text">
        <p className="install-title">Install Household</p>
        <p className="install-sub">
          {canPrompt
            ? 'Add it to your home screen for quick access.'
            : 'Tap ⋮ in Chrome, then "Add to home screen".'}
        </p>
      </div>
      {canPrompt && (
        <button className="btn btn-primary install-btn" onClick={install}>
          Install
        </button>
      )}
      <button className="install-close" onClick={dismiss} aria-label="Not now">
        ✕
      </button>
    </div>
  );
}
