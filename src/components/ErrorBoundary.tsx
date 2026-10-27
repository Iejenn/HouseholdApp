import { Component, useEffect, useState } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

function errorText(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

// Catches a crash in one screen and shows the error instead of a white page,
// so the tab bar keeps working and the message can be sent to whoever fixes it
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Screen crashed', error, info.componentStack);
  }

  render() {
    if (this.state.error === null) return this.props.children;
    return <CrashMessage text={errorText(this.state.error)} />;
  }
}

function CrashMessage({ text }: { text: string }) {
  return (
    <div className="app-content" style={{ paddingTop: 24 }}>
      <div className="card crash-card">
        <p className="card-title">😿 Er ging iets mis</p>
        <p className="settings-note">
          Maak een screenshot van dit scherm en stuur het door. Je kunt intussen een ander tabblad gebruiken.
        </p>
        <pre className="crash-text">{text}</pre>
        <button className="btn btn-primary btn-block" onClick={() => window.location.replace(import.meta.env.BASE_URL)}>
          Opnieuw laden
        </button>
      </div>
    </div>
  );
}

// Errors outside React rendering (e.g. inside Firebase) never reach the
// boundary above, so show the most recent one in a small bar at the top
export function GlobalErrorBar() {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    const onError = (e: ErrorEvent) => setText(errorText(e.error ?? e.message));
    const onRejection = (e: PromiseRejectionEvent) => setText(errorText(e.reason));
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  if (!text) return null;
  return (
    <div className="error-bar" role="alert">
      <span className="error-bar-text">⚠️ {text}</span>
      <button className="error-bar-btn" onClick={() => window.location.replace(import.meta.env.BASE_URL)}>
        Herladen
      </button>
      <button className="error-bar-btn" onClick={() => setText(null)} aria-label="Sluiten">
        ✕
      </button>
    </div>
  );
}
