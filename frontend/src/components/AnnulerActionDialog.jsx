import { useState } from "react";
import { revertAction } from "../services/actionLogService.js";
import { useToast } from "../context/ToastContext.jsx";

const REVERSIBLE = new Set([
  "modification_secteur",
  "modification_agent",
  "modification_materiel",
  "modification_recolteur",
  "soumission_fiche",
  "suppression_recolteur",
]);

export function canRevert(row) {
  return row && REVERSIBLE.has(row.action) && !row.annule;
}

const ACTION_LABELS = {
  modification_secteur:   "Modification secteur",
  modification_agent:     "Modification agent terrain",
  modification_materiel:  "Modification matériel",
  modification_recolteur: "Modification récolteur",
  soumission_fiche:       "Soumission fiche récolte",
  suppression_recolteur:  "Suppression récolteur",
};

export default function AnnulerActionDialog({ row, onClose, onReverted }) {
  const { pushToast } = useToast();
  const [raison, setRaison] = useState("");
  const [loading, setLoading] = useState(false);

  if (!row) return null;

  const parsed = row.detail_parsed || { label: row.detail || "" };
  const actionLabel = ACTION_LABELS[row.action] || row.action;

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await revertAction(row.id, raison);
      pushToast({
        type: "success",
        title: "Action annulée",
        message: "L'action a été annulée et le superviseur a été notifié.",
      });
      onReverted?.();
      onClose();
    } catch (err) {
      pushToast({ type: "error", title: "Erreur", message: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog"
        style={{ maxWidth: 480, padding: 0, overflow: "hidden" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div style={{
          background: "linear-gradient(135deg, #b71c1c 0%, #c62828 100%)",
          padding: "16px 20px 12px",
          color: "#fff",
          position: "relative",
        }}>
          <p style={{ margin: 0, fontSize: 11, opacity: 0.8, textTransform: "uppercase", letterSpacing: 1 }}>
            Annuler une action superviseur
          </p>
          <p style={{ margin: "4px 0 0", fontWeight: 700, fontSize: 14, paddingRight: 32 }}>
            {actionLabel}
          </p>
          <button
            onClick={onClose}
            style={{
              position: "absolute", top: 12, right: 14,
              background: "rgba(255,255,255,0.15)", border: "none",
              borderRadius: 6, color: "#fff", padding: "4px 10px",
              cursor: "pointer", fontSize: 12, fontWeight: 600,
            }}
          >✕</button>
        </div>

        {/* Corps */}
        <div style={{ padding: "18px 20px" }}>

          {/* Résumé de l'action concernée */}
          <div style={{
            background: "#fff8e1", border: "1px solid #ffe082",
            borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13,
          }}>
            <p style={{ margin: "0 0 4px", fontWeight: 700, color: "#e65100" }}>Action concernée</p>
            <p style={{ margin: 0, color: "#555" }}>{parsed.label || row.detail || "—"}</p>
            <p style={{ margin: "4px 0 0", color: "#888", fontSize: 12 }}>
              Par <strong>{row.acteur_display}</strong> · {new Date(row.timestamp).toLocaleString("fr-FR")}
            </p>
          </div>

          {/* Avertissement */}
          {row.action === "suppression_recolteur" ? (
            <p style={{ fontSize: 13, color: "#333", marginBottom: 14 }}>
              Cette opération va <strong>recréer le récolteur avec ses données originales</strong> et
              restaurer ses liens aux fiches de récolte existantes. Le superviseur sera notifié.
            </p>
          ) : (
            <p style={{ fontSize: 13, color: "#333", marginBottom: 14 }}>
              Cette opération va <strong>restaurer les valeurs précédentes</strong> et notifier
              le superviseur. L'action sera marquée comme annulée dans le journal.
            </p>
          )}

          {/* Champ raison */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 6 }}>
              Raison (optionnel)
            </label>
            <textarea
              value={raison}
              onChange={(e) => setRaison(e.target.value)}
              placeholder="Expliquez pourquoi vous annulez cette action..."
              rows={3}
              style={{
                width: "100%", boxSizing: "border-box",
                padding: "8px 10px", borderRadius: 6,
                border: "1px solid #ddd", fontSize: 13,
                resize: "vertical", fontFamily: "inherit",
              }}
            />
          </div>
        </div>

        {/* Pied */}
        <div style={{
          padding: "12px 20px", borderTop: "1px solid #f0f0f0",
          display: "flex", justifyContent: "flex-end", gap: 10,
        }}>
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              padding: "8px 18px", borderRadius: 6,
              border: "1px solid #ddd", background: "#fff",
              cursor: "pointer", fontSize: 13, color: "#555",
            }}
          >
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            style={{
              padding: "8px 20px", borderRadius: 6, border: "none",
              background: loading ? "#e57373" : "#c62828",
              color: "#fff", fontWeight: 700,
              fontSize: 13, cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Annulation en cours..." : "Confirmer l'annulation"}
          </button>
        </div>
      </div>
    </div>
  );
}
