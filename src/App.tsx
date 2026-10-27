import { useState } from 'react';
import './App.css';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginScreen from './screens/LoginScreen';
import HouseholdSetupScreen from './screens/HouseholdSetupScreen';
import TaskListScreen from './screens/TaskListScreen';
import ChatScreen from './screens/ChatScreen';
import InstallPrompt from './components/InstallPrompt';

// Location tab removed: reliable live location needs a native app, not a web app
type Tab = 'tasks' | 'chat';

function MainShell() {
  const { signOut } = useAuth();
  const [tab, setTab] = useState<Tab>('tasks');

  return (
    <div className="app-shell">
      {tab === 'tasks' ? <TaskListScreen /> : <ChatScreen />}
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
      {/* Android Chrome only: suggests installing the app to the home screen */}
      <InstallPrompt />
      <RootRouter />
    </AuthProvider>
  );
}