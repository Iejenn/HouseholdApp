import { useState } from 'react';
import './App.css';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginScreen from './screens/LoginScreen';
import HouseholdSetupScreen from './screens/HouseholdSetupScreen';
import TaskListScreen from './screens/TaskListScreen';
import GroceriesScreen from './screens/GroceriesScreen';
import CatScreen from './screens/CatScreen';
import ChatScreen from './screens/ChatScreen';
import InstallPrompt from './components/InstallPrompt';
import { HouseholdProvider } from './context/HouseholdContext';

type Tab = 'tasks' | 'groceries' | 'cat' | 'chat';

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'tasks', icon: '✅', label: 'Taken' },
  { id: 'groceries', icon: '🛒', label: 'Boodschappen' },
  { id: 'cat', icon: '🐈‍⬛', label: 'Kat' },
  { id: 'chat', icon: '💬', label: 'Chat' },
];

function MainShell() {
  const { signOut } = useAuth();
  const [tab, setTab] = useState<Tab>('tasks');

  return (
    <HouseholdProvider>
      <div className="app-shell">
        {tab === 'tasks' && <TaskListScreen />}
        {tab === 'groceries' && <GroceriesScreen />}
        {tab === 'cat' && <CatScreen />}
        {tab === 'chat' && <ChatScreen />}
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
          <button
            className="tabbar-item"
            // With 5 tabs a mis-tap is easy, so ask first
            onClick={() => window.confirm('Wil je uitloggen?') && signOut()}
          >
            <span className="tabbar-icon">🚪</span>
            Uitloggen
          </button>
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
      <RootRouter />
    </AuthProvider>
  );
}