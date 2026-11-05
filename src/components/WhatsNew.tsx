import { CHANGELOG } from '../data/changelog';
import type { ChangelogEntry } from '../data/changelog';
import { currentLang, locale, t } from '../i18n';

// "Wat is er nieuw": after an update, once per device, the changelog entries
// you haven't seen yet. Also opened from Instellingen (all recent entries).

const SEEN_KEY = 'whatsNewSeen';

function versionDate(version: string): Date {
  const [y, m, d] = version.split('.').map(Number);
  return new Date(y, m - 1, d);
}

function readSeen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

export function markWhatsNewSeen() {
  try {
    localStorage.setItem(SEEN_KEY, CHANGELOG[0]?.version ?? '');
  } catch {
    // shows again next time, no harm
  }
}

// What to show right after opening the app (empty = nothing new).
// accountCreatedAt: a brand-new account has nothing "new" to hear about.
export function unseenEntries(accountCreatedAt: number | undefined): ChangelogEntry[] {
  const latest = CHANGELOG[0];
  if (!latest) return [];
  const seen = readSeen();
  if (!seen) {
    // First time on this device: only tell people who already used the app
    // before the latest change; new users just start fresh
    const isNewUser = !accountCreatedAt || accountCreatedAt >= versionDate(latest.version).getTime();
    if (isNewUser) {
      markWhatsNewSeen();
      return [];
    }
    return [latest];
  }
  // Versions are dates (2026.11.05), so comparing them as text works
  return CHANGELOG.filter((e) => e.version > seen).slice(0, 3);
}

export default function WhatsNew({ entries, onClose }: { entries: ChangelogEntry[]; onClose: () => void }) {
  const lang = currentLang();
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card whats-new" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{t('✨ Wat is er nieuw')}</h3>
        {entries.map((entry) => (
          <div key={entry.version} className="whats-new-entry">
            <p className="whats-new-date">
              {versionDate(entry.version).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
            <ul>
              {(lang === 'en' ? entry.en : entry.nl).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ))}
        <button className="btn btn-primary btn-block" onClick={onClose} style={{ marginTop: 8 }}>
          {t('Top!')}
        </button>
      </div>
    </div>
  );
}
