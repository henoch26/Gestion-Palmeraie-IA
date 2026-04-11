// Reusable confirmation modal
export default function ConfirmDialog({
  open,
  title = "Confirmer",
  message = "Voulez-vous continuer ?",
  onCancel,
  onConfirm,
  confirmLabel = "Confirmer",
}) {
  if (!open) return null;

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div className="dialog dialog-sm" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p>{message}</p>

        <div className="dialog-actions">
          <button onClick={onCancel}>Annuler</button>
          <button className="btn-danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
