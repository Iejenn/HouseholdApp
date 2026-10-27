import { useEffect, useState } from 'react';
import './App.css';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginScreen from './screens/LoginScreen';
import HouseholdSetupScreen from './screens/HouseholdSetupScreen';
import TaskListScreen from './screens/TaskListScreen';
import GroceriesScreen from './screens/GroceriesScreen';
import CatScreen from './screens/CatScreen';
import ChatScreen from './screens/ChatScreen';
import SettingsScreen from './screens/SettingsScreen';
import { listenForTestPush, refreshPush } from './lib/push';
import InstallPrompt from './components/InstallPrompt';
import { ErrorBoundary, GlobalErrorBar } from './components/ErrorBoundary';
import { HouseholdProvider } from './context/HouseholdContext';

type Tab = 'tasks' | 'groceries' | 'cat' | 'chat' | 'settings';

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'tasks', icon: '✅', label: 'Taken' },
  { id: 'groceries', icon: '🛒', label: 'Boodschappen' },
  { id: 'cat', icon: '🐈‍⬛', label: 'Kat' },
  { id: 'chat', icon: '💬', label: 'Chat' },
  { id: 'settings', icon: '⚙️', label: 'Instellingen' },
];

function isTab(value: unknown): value is Tab {
  return TABS.some((t) => t.id === value);
}

// A tapped notification opens the app as …/?tab=chat
function tabFromUrl(): Tab {
  const tab = new URLSearchParams(window.location.search).get('tab');
  return isTab(tab) ? tab : 'tasks';
}

function MainShell() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>(tabFromUrl);

  useEffect(() => {
    // Notification tapped while the app was already open: switch tab
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'open-tab' && isTab(e.data.tab)) setTab(e.data.tab);
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage);
  }, []);

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
        {/* key={tab}: switching tabs clears a crash, so one broken screen
            never locks you out of the rest of the app */}
        <ErrorBoundary key={tab}>
          {tab === 'tasks' && <TaskListScreen />}
          {tab === 'groceries' && <GroceriesScreen />}
          {tab === 'cat' && <CatScreen />}
          {tab === 'chat' && <ChatScreen />}
          {tab === 'settings' && <SettingsScreen />}
        </ErrorBoundary>
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
  if (loading) {
    return (
      <div className="centered-screen">
        <p style={{ color: 'var(--color-ink-soft)' }}>Laden…</p>
      </div>
    );
  }
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