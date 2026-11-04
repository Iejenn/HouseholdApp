import { useEffect, useState } from 'react';

// Chrome-only event, not in TypeScript's DOM types
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'installPromptDismissedAt';
const DISMISS_FOR_MS = 7 * 24 * 60 * 60 * 1000; // ask again after a week

const ua = navigator.userAgent;
const isAndroidChrome =
  /Android/i.test(ua) &&
  /Chrome\//.test(ua) &&
  // Samsung Internet, Edge, Opera etc. also say "Chrome" — skip those
  !/SamsungBrowser|EdgA|OPR|Firefox|wv\)/i.test(ua);
// iPhone/iPad: no install button exists there, so we explain the Share menu.
// (iPads pretend to be a Mac, but a Mac has no touch screen.)
const isMobile = /Android|iPhone|iPad|iPod/i.test(ua) || navigator.maxTouchPoints > 1;
const isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);

function isInstalled(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safari's own flag for "opened from the home screen"
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
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
  // Shown on Android Chrome and iPhone/iPad from the start; on a computer
  // (Chrome/Edge) only once the browser says installing is possible
  const [hidden, setHidden] = useState(() => isInstalled() || recentlyDismissed());
  const supported = canPrompt || isAndroidChrome || isIOS;

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

  if (hidden || !supported) return null;

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
        <p className="install-title">Installeer Huishouden</p>
        <p className="install-sub">
          {canPrompt
            ? isMobile
              ? 'Zet de app op je startscherm, dan heb je hem altijd bij de hand.'
              : 'Installeer de app op je computer: hij opent dan in een eigen venster.'
            : isIOS
              ? 'Tik op Deel ⬆️ en kies "Zet op beginscherm".'
              : 'Tik in Chrome op ⋮ en kies "Toevoegen aan startscherm".'}
        </p>
      </div>
      {canPrompt && (
        <button className="btn btn-primary install-btn" onClick={install}>
          Installeren
        </button>
      )}
      <button className="install-close" onClick={dismiss} aria-label="Niet nu">
        ✕
      </button>
    </div>
  );
}
