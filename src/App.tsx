import { useEffect, useState } from 'react';
import { releaseSplash } from './lib/splash';
import './App.css';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginScreen from './screens/LoginScreen';
import HouseholdSetupScreen from './screens/HouseholdSetupScreen';
import TaskListScreen from './screens/TaskListScreen';
import GroceriesScreen from './screens/GroceriesScreen';
import WeekMenuScreen from './screens/WeekMenuScreen';
import CatScreen from './screens/CatScreen';
import HomeScreen from './screens/HomeScreen';
import SettingsScreen from './screens/SettingsScreen';
import { listenForTestPush, refreshPush } from './lib/push';
import { finishCalendarLink, forgetCachedEvents } from './lib/calendar';
import { dutchError } from './lib/firebaseErrors';
import InstallPrompt from './components/InstallPrompt';
import { ErrorBoundary, GlobalErrorBar } from './components/ErrorBoundary';
import { HouseholdProvider } from './context/HouseholdContext';

type Tab = 'home' | 'tasks' | 'groceries' | 'menu' | 'cat' | 'settings';

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'home', icon: '🏠', label: 'Thuis' },
  { id: 'tasks', icon: '✅', label: 'Taken' },
  { id: 'groceries', icon: '🛒', label: 'Boodschappen' },
  { id: 'menu', icon: '🍽️', label: 'Weekmenu' },
  { id: 'cat', icon: '🐈‍⬛', label: 'Kat' },
];

function isTab(value: unknown): value is Tab {
  // Settings is no longer in the tab bar (⚙️ top right), but stays a valid tab
  return value === 'settings' || TABS.some((t) => t.id === value);
}

// The chat became the post-it board on Home; notifications (and old links)
// still say "chat", so send those to Home
function toTab(value: unknown): Tab | null {
  if (value === 'chat') return 'home';
  return isTab(value) ? value : null;
}

// A tapped notification opens the app as …/?tab=groceries
function tabFromUrl(): Tab {
  return toTab(new URLSearchParams(window.location.search).get('tab')) ?? 'home';
}

function MainShell() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>(tabFromUrl);
  // Where ⚙️ returns to when tapped again
  const [lastTab, setLastTab] = useState<Tab>('home');
  // Opened on another tab (e.g. from a notification): don't wait for Thuis
  useEffect(() => {
    if (tab !== 'home') releaseSplash();
  }, [tab]);
  const [notice, setNotice] = useState<string | null>(null);

  function toggleSettings() {
    if (tab === 'settings') setTab(lastTab);
    else {
      setLastTab(tab);
      setTab('settings');
    }
  }

  useEffect(() => {
    // Notification tapped while the app was already open: switch tab
    const onMessage = (e: MessageEvent) => {
      const next = e.data?.type === 'open-tab' ? toTab(e.data.tab) : null;
      if (next) setTab(next);
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage);
  }, []);

  // Back from Google's sign-in for "Agenda koppelen": ?code=…&state=…
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const denied = params.get('error');
    if (!state || (!code && !denied)) return;
    // Remove the one-time code from the address bar right away
    window.history.replaceState(null, '', import.meta.env.BASE_URL);
    setTab('settings');
    if (denied || !code) {
      setNotice('Agenda koppelen geannuleerd.');
      return;
    }
    setNotice('Agenda koppelen…');
    finishCalendarLink(code, state)
      .then(({ email }) => {
        forgetCachedEvents();
        setNotice(`Gekoppeld met ${email || 'Google'} ✓ Kies hieronder welke agenda's je deelt.`);
      })
      .catch((err) => setNotice(dutchError(err, 'Koppelen lukte niet. Probeer het opnieuw.')));
  }, []);

  useEffect(() => {
    if (!notice || notice.endsWith('…')) return;
    const id = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(id);
  }, [notice]);

  useEffect(() => {
    if (!user) return;
    refreshPush(user.uid);
    let stop = () => {};
    listenForTestPush().then((unsub) => (stop = unsub));
    return () => stop();
  }, [user]);

  return (
    <HouseholdProvider>
      <div className="app-shell">
        {/* Own container for the screen, so on tablets/desktops the tab bar
            can sit next to it as a sidebar */}
        <main className="app-main">
          {/* key={tab}: switching tabs clears a crash, so one broken screen
              never locks you out of the rest of the app */}
          <ErrorBoundary key={tab}>
            {tab === 'home' && <HomeScreen onNavigate={setTab} />}
            {tab === 'tasks' && <TaskListScreen />}
            {tab === 'groceries' && <GroceriesScreen />}
            {tab === 'menu' && <WeekMenuScreen />}
            {tab === 'cat' && <CatScreen />}
            {tab === 'settings' && <SettingsScreen />}
          </ErrorBoundary>
        </main>
        {/* Settings moved out of the tab bar to make room for Weekmenu */}
        <button
          className={`settings-btn${tab === 'settings' ? ' active' : ''}`}
          onClick={toggleSettings}
          aria-label={tab === 'settings' ? 'Instellingen sluiten' : 'Instellingen'}
        >
          {tab === 'settings' ? '✕' : '⚙️'}
        </button>
        {notice && <div className="undo-toast info-toast">{notice}</div>}
        <nav className="tabbar">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tabbar-item${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <span className="tabbar-icon">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>
      </div>
    </HouseholdProvider>
  );
}

function RootRouter() {
  const { user, profile, loading } = useAuth();
  const showsMain = !loading && !!user && !!profile?.householdId;
  // Login / set-up screens need no data: drop the loading screen right away.
  // (Thuis lifts it itself once its data is in, see HomeScreen.)
  useEffect(() => {
    if (!loading && !showsMain) releaseSplash();
  }, [loading, showsMain]);
  if (loading) return null; // the loading screen from index.html is still up
  if (!user || !profile) return <LoginScreen />;
  if (!profile.householdId) return <HouseholdSetupScreen />;
  return <MainShell />;
}

export default function App() {
  return (
    <AuthProvider>
      {/* Android Chrome only: suggests installing the app to the home screen */}
      <InstallPrompt />
      <GlobalErrorBar />
      <ErrorBoundary>
        <RootRouter />
      </ErrorBoundary>
    </AuthProvider>
  );
}