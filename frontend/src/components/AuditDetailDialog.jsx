import { AlertTriangle, X } from "lucide-react";

export default function AuditDetailDialog({ row, onClose }) {
  if (!row) return null;

  const parsed = row.detail_parsed || { label: row.detail || "" };
  const changes  = parsed.changes  || null;
  const snapshot = parsed.snapshot || null;
  const label    = parsed.label    || row.detail || "";
  const motif    = parsed.motif    || null;

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog"
        style={{ maxWidth: 560, padding: 0, overflow: "hidden" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div style={{
          background: "linear-gradient(135deg, #1f4e79 0%, #2e6da4 100%)",
          padding: "18px 20px 14px",
          color: "#fff",
          position: "relative",
        }}>
          <p style={{ margin: 0, fontSize: 11, opacity: 0.75, textTransform: "uppercase", letterSpacing: 1 }}>
            Détails de l'action
          </p>
          <p style={{ margin: "4px 0 0", fontWeight: 700, fontSize: 14, paddingRight: 32 }}>
            {label}
          </p>
          <button
            onClick={onClose}
            style={{
              position: "absolute", top: 12, right: 14,
              background: "rgba(255,255,255,0.15)", border: "none",
              borderRadius: 6, color: "#fff", padding: "4px 10px",
              cursor: "pointer", fontSize: 12, fontWeight: 600,
              display: "flex", alignItems: "center",
            }}
          ><X size={14} /></button>
        </div>

        {/* Métadonnées */}
        <div style={{
          display: "flex", gap: 24, flexWrap: "wrap",
          padding: "12px 20px", background: "#f8f9fa",
          borderBottom: "1px solid #e8e8e8", fontSize: 12, color: "#555",
        }}>
          <span><strong>Date :</strong> {new Date(row.timestamp).toLocaleString("fr-FR")}</span>
          <span><strong>Par :</strong> {row.acteur_display}</span>
          {row.superviseur_display && row.superviseur_display !== "—" && (
            <span><strong>Superviseur :</strong> {row.superviseur_display}</span>
          )}
        </div>

        {/* Motif de rejet (si présent) */}
        {motif && (
          <div style={{
            margin: "0", padding: "10px 20px",
            background: "#fff8e1", borderBottom: "1px solid #ffe082",
            display: "flex", alignItems: "flex-start", gap: 10,
          }}>
            <AlertTriangle size={16} color="#e65100" style={{ flexShrink: 0 }} />
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 12, color: "#e65100", textTransform: "uppercase", letterSpacing: 0.5 }}>
                Motif du rejet
              </p>
              <p style={{ margin: "3px 0 0", fontSize: 13, color: "#333" }}>{motif}</p>
            </div>
          </div>
        )}

        {/* Contenu */}
        <div style={{ padding: "16px 20px 20px", maxHeight: 420, overflowY: "auto" }}>

          {/* Modifications : tableau avant / après */}
          {changes && changes.length > 0 && (
            <>
              <p style={{ margin: "0 0 10px", fontWeight: 700, fontSize: 13, color: "#333" }}>
                Champs modifiés
              </p>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#1f4e79", color: "#fff" }}>
                    {["Champ", "Avant", "Après"].map((h) => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {changes.map((c, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? "#fafafa" : "#fff", borderBottom: "1px solid #f0f0f0" }}>
                      <td style={{ padding: "8px 12px", fontWeight: 600, color: "#333" }}>{c.field}</td>
                      <td style={{ padding: "8px 12px", color: "#c62828", textDecoration: "line-through" }}>
                        {c.old || <span style={{ color: "#aaa" }}>—</span>}
                      </td>
                      <td style={{ padding: "8px 12px", color: "#2e7d32", fontWeight: 600 }}>
                        {c.new || <span style={{ color: "#aaa" }}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* Pas de changements détectés */}
          {changes && changes.length === 0 && (
            <p style={{ color: "#888", fontSize: 13, fontStyle: "italic" }}>
              Aucun champ modifié enregistré.
            </p>
          )}

          {/* Snapshot : tableau label / valeur */}
          {snapshot && (
            <>
              <p style={{ margin: "0 0 10px", fontWeight: 700, fontSize: 13, color: "#333" }}>
                État de l'enregistrement
              </p>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <tbody>
                  {Object.entries(snapshot).filter(([, v]) => v !== "" && v !== "None").map(([k, v], i) => (
                    <tr key={k} style={{ background: i % 2 === 0 ? "#fafafa" : "#fff", borderBottom: "1px solid #f0f0f0" }}>
                      <td style={{ padding: "7px 12px", fontWeight: 600, color: "#555", width: "40%" }}>{k}</td>
                      <td style={{ padding: "7px 12px", color: "#222" }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* Fallback : aucune métadonnée structurée */}
          {!changes && !snapshot && label && (
            <p style={{ color: "#555", fontSize: 13 }}>{label}</p>
          )}
        </div>

        <div style={{ padding: "12px 20px", borderTop: "1px solid #f0f0f0", textAlign: "right" }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 20px", borderRadius: 6, border: "1px solid #ddd",
              background: "#fff", cursor: "pointer", fontSize: 13, color: "#555",
            }}
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
