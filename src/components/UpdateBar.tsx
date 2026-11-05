import { useEffect, useState } from 'react';
import { onUpdatePending, reloadNow } from '../lib/updates';
import { t } from '../i18n';

// Shown when a new version arrived while you were already using the app.
// Tapping reloads; ignoring it is fine too (next open uses the new version).
export default function UpdateBar() {
  const [pending, setPending] = useState(false);
  useEffect(() => onUpdatePending(setPending), []);
  if (!pending) return null;
  return (
    <div className="undo-toast update-bar" role="status">
      <span className="undo-text">{t('✨ Er is een nieuwe versie')}</span>
      <button className="undo-btn" onClick={reloadNow}>
        {t('Vernieuwen')}
      </button>
    </div>
  );
}
