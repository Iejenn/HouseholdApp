import { t } from '../i18n';

// action: what happened to the item, e.g. "verwijderd" (swipe) or "afgevinkt"
export default function UndoToast({
  label,
  onUndo,
  action = 'verwijderd',
}: {
  label: string;
  onUndo: () => void;
  action?: string;
}) {
  return (
    <div className="undo-toast" role="status">
      <span className="undo-text">
        "{label}" {t(action)}
      </span>
      <button className="undo-btn" onClick={onUndo}>
        {t('Ongedaan maken')}
      </button>
    </div>
  );
}
