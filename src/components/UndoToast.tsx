export default function UndoToast({ label, onUndo }: { label: string; onUndo: () => void }) {
  return (
    <div className="undo-toast" role="status">
      <span className="undo-text">"{label}" verwijderd</span>
      <button className="undo-btn" onClick={onUndo}>
        Ongedaan maken
      </button>
    </div>
  );
}
