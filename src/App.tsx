import { useState } from 'react';
import './App.css';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useLiveLocationSharing } from './hooks/useLiveLocationSharing';
import LoginScreen from './screens/LoginScreen';
import HouseholdSetupScreen from './screens/HouseholdSetupScreen';
import TaskListScreen from './screens/TaskListScreen';
import LocationScreen from './screens/LocationScreen';
import ChatScreen from './screens/ChatScreen';

type Tab = 'tasks' | 'location' | 'chat';

function MainShell() {
  const { signOut, profile } = useAuth();
  const [tab, setTab] = useState<Tab>('tasks');

  // Mounted here (not inside LocationScreen) so live tracking keeps running
  // as the user switches to Chat/Tasks and back — it only stops if this
  // component itself unmounts (sign-out) or the tab/app is fully closed.
  const { error: liveLocationError } = useLiveLocationSharing(profile?.liveLocationEnabled ?? false);

  return (
    <div className="app-shell">
      {liveLocationError && (
        <p style={{ color: 'var(--color-danger)', fontSize: 12, textAlign: 'center', padding: '6px 12px 0' }}>
          {liveLocationError}
        </p>
      )}
      {tab === 'tasks' ? <TaskListScreen /> : tab === 'location' ? <LocationScreen /> : <ChatScreen />}
      <nav className="tabbar">
        <button
          className={`tabbar-item${tab === 'tasks' ? ' active' : ''}`}
          onClick={() => setTab('tasks')}
        >
          <span className="tabbar-icon">✅</span>
          Tasks
        </button>
        <button
          className={`tabbar-item${tab === 'chat' ? ' active' : ''}`}
          onClick={() => setTab('chat')}
        >
          <span className="tabbar-icon">💬</span>
          Chat
        </button>
        <button
          className={`tabbar-item${tab === 'location' ? ' active' : ''}`}
          onClick={() => setTab('location')}
        >
          <span className="tabbar-icon">📍</span>
          Location
        </button>
        <button className="tabbar-item" onClick={signOut}>
          <span className="tabbar-icon">🚪</span>
          Sign out
        </button>
      </nav>
    </div>
  );
}

function RootRouter() {
  const { user, profile, loading } = useAuth();
  if (loading) {
    return (
      <div className="centered-screen">
        <p style={{ color: 'var(--color-ink-soft)' }}>Loading…</p>
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
      <RootRouter />
    </AuthProvider>
  );
}