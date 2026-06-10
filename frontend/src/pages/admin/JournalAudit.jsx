import { useEffect, useState } from "react";
import { useToast } from "../../context/ToastContext.jsx";
import { listActionLogs } from "../../services/actionLogService.js";
import { apiGet } from "../../api/axios.js";
import AuditDetailDialog from "../../components/AuditDetailDialog.jsx";
import AnnulerActionDialog, { canRevert } from "../../components/AnnulerActionDialog.jsx";

const ACTION_LABELS = {
  // ── Admin ──────────────────────────────────────────────────────
  validation:               { label: "Validation",         color: "#2e7d32", bg: "#e8f5e9" },
  rejet:                    { label: "Rejet",              color: "#c62828", bg: "#ffebee" },
  modification_fiche:       { label: "Modif. fiche",       color: "#1565c0", bg: "#e3f2fd" },
  modification_bareme:      { label: "Modif. barème",      color: "#6a1b9a", bg: "#f3e5f5" },
  prix_officiel:            { label: "Prix officiel",      color: "#e65100", bg: "#fff3e0" },
  modification_recu:        { label: "Modif. reçu",        color: "#00838f", bg: "#e0f7fa" },
  suppression_recu:         { label: "Suppression reçu",   color: "#b71c1c", bg: "#ffebee" },
  validation_recu:          { label: "Validation reçu",    color: "#1b5e20", bg: "#e8f5e9" },
  // ── Superviseur — fiches & récolteurs ──────────────────────────
  creation_fiche:           { label: "Création fiche",     color: "#0277bd", bg: "#e1f5fe" },
  soumission_fiche:         { label: "Soumission fiche",   color: "#6a1b9a", bg: "#f3e5f5" },
  suppression_fiche:        { label: "Suppression fiche",  color: "#b71c1c", bg: "#ffebee" },
  creation_recolteur:       { label: "Créat. récolteur",   color: "#2e7d32", bg: "#f1f8e9" },
  modification_recolteur:   { label: "Modif. récolteur",   color: "#1565c0", bg: "#e8eaf6" },
  suppression_recolteur:    { label: "Suppr. récolteur",   color: "#c62828", bg: "#ffebee" },
  // ── Référentiels (secteurs, agents, matériels) ─────────────────
  creation_secteur:         { label: "Créat. secteur",     color: "#00695c", bg: "#e0f2f1" },
  modification_secteur:     { label: "Modif. secteur",     color: "#00695c", bg: "#e0f2f1" },
  suppression_secteur:      { label: "Suppr. secteur",     color: "#b71c1c", bg: "#ffebee" },
  creation_agent:           { label: "Créat. agent",       color: "#4527a0", bg: "#ede7f6" },
  modification_agent:       { label: "Modif. agent",       color: "#4527a0", bg: "#ede7f6" },
  suppression_agent:        { label: "Suppr. agent",       color: "#b71c1c", bg: "#ffebee" },
  creation_materiel:        { label: "Créat. matériel",    color: "#e65100", bg: "#fff3e0" },
  modification_materiel:    { label: "Modif. matériel",    color: "#e65100", bg: "#fff3e0" },
  suppression_materiel:     { label: "Suppr. matériel",    color: "#b71c1c", bg: "#ffebee" },
  // ── Fiches travaux ─────────────────────────────────────────────
  creation_travaux:         { label: "Créat. travaux",     color: "#0277bd", bg: "#e3f2fd" },
  soumission_travaux:       { label: "Soumis. travaux",    color: "#6a1b9a", bg: "#f3e5f5" },
  suppression_travaux:      { label: "Suppr. travaux",     color: "#b71c1c", bg: "#ffebee" },
  // ── Annulations ────────────────────────────────────────────────
  annulation_action:        { label: "Annulation",         color: "#4a148c", bg: "#f3e5f5" },
};

const fmtDate = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
};

export default function JournalAudit() {
  const { pushToast } = useToast();
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [superviseurs, setSuperviseurs] = useState([]);
  const [selectedRow, setSelectedRow]   = useState(null);
  const [revertRow, setRevertRow]       = useState(null);

  const today = new Date().toISOString().slice(0, 10);
  const [filters, setFilters] = useState({
    action: "", superviseur: "", date_debut: "", date_fin: today,
  });

  const load = async (f = filters) => {
    setLoading(true);
    try {
      const params = {};
      if (f.action)      params.action      = f.action;
      if (f.superviseur) params.superviseur  = f.superviseur;
      if (f.date_debut)  params.date_debut  = f.date_debut;
      if (f.date_fin)    params.date_fin    = f.date_fin;
      const data = await listActionLogs(params);
      setRows(Array.isArray(data) ? data : (data.results || []));
    } catch (err) {
      pushToast({ type: "error", title: "Journal", message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const loadSuperviseurs = async () => {
    try {
      const data = await apiGet("/users/");
      const list = Array.isArray(data) ? data : (data.results || []);
      setSuperviseurs(list.filter((u) => u.profile?.role !== "admin"));
    } catch {
      // silencieux
    }
  };

  useEffect(() => {
    load();
    loadSuperviseurs();
  }, []);

  const set = (field, value) => setFilters((p) => ({ ...p, [field]: value }));

  const handleFilter = () => load(filters);
  const handleReset  = () => {
    const reset = { action: "", superviseur: "", date_debut: "", date_fin: today };
    setFilters(reset);
    load(reset);
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2>Journal d'audit</h2>
          <p className="dashboard-subtitle">
            Traçabilité des actions admin et superviseurs sur les données
          </p>
        </div>
        <button className="btn-ghost" onClick={handleFilter} disabled={loading}>
          {loading ? "Chargement..." : "Actualiser"}
        </button>
      </div>

      {/* Filtres */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end",
        background: "#f8f9fa", borderRadius: 8, padding: "14px 16px", marginBottom: 20,
        border: "1px solid #e8e8e8",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 160 }}>
          <label style={{ fontSize: 12, color: "#555", fontWeight: 600 }}>Type d'action</label>
          <select
            style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}
            value={filters.action}
            onChange={(e) => set("action", e.target.value)}
          >
            <option value="">Toutes</option>
            {Object.entries(ACTION_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 180 }}>
          <label style={{ fontSize: 12, color: "#555", fontWeight: 600 }}>Superviseur</label>
          <select
            style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}
            value={filters.superviseur}
            onChange={(e) => set("superviseur", e.target.value)}
          >
            <option value="">Tous</option>
            {superviseurs.map((u) => (
              <option key={u.id} value={u.id}>
                {`${u.first_name} ${u.last_name}`.trim() || u.username}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 12, color: "#555", fontWeight: 600 }}>Du</label>
          <input
            type="date"
            style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}
            value={filters.date_debut}
            onChange={(e) => set("date_debut", e.target.value)}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 12, color: "#555", fontWeight: 600 }}>Au</label>
          <input
            type="date"
            style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}
            value={filters.date_fin}
            onChange={(e) => set("date_fin", e.target.value)}
          />
        </div>

        <div style={{ display: "flex", gap: 8, alignSelf: "flex-end" }}>
          <button
            onClick={handleFilter}
            style={{
              padding: "7px 18px", borderRadius: 6, border: "none",
              background: "#1f4e79", color: "#fff", fontWeight: 600,
              fontSize: 13, cursor: "pointer",
            }}
          >
            Filtrer
          </button>
          <button
            onClick={handleReset}
            style={{
              padding: "7px 14px", borderRadius: 6, border: "1px solid #ddd",
              background: "#fff", color: "#555", fontSize: 13, cursor: "pointer",
            }}
          >
            Réinitialiser
          </button>
        </div>
      </div>

      {/* Compteur */}
      {!loading && (
        <p style={{ fontSize: 13, color: "#888", marginBottom: 12 }}>
          {rows.length} entrée{rows.length !== 1 ? "s" : ""} trouvée{rows.length !== 1 ? "s" : ""}
        </p>
      )}

      {/* Tableau */}
      {loading ? (
        <p style={{ color: "#aaa", textAlign: "center", padding: 32 }}>Chargement...</p>
      ) : rows.length === 0 ? (
        <p style={{ color: "#aaa", textAlign: "center", padding: 32 }}>
          Aucune action enregistrée pour ces critères.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#1f4e79", color: "#fff" }}>
                {["Date & heure", "Action", "Acteur", "Superviseur concerné", "Fiche (date)", "Détail", "", ""].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const meta = ACTION_LABELS[row.action] || { label: row.action_display || row.action, color: "#555", bg: "#f5f5f5" };
                return (
                  <tr key={row.id} style={{ background: idx % 2 === 0 ? "#fafafa" : "#fff", borderBottom: "1px solid #f0f0f0" }}>
                    <td style={{ padding: "9px 14px", whiteSpace: "nowrap", color: "#555" }}>
                      {fmtDate(row.timestamp)}
                    </td>
                    <td style={{ padding: "9px 14px" }}>
                      <span style={{
                        display: "inline-block", padding: "3px 10px", borderRadius: 12,
                        background: meta.bg, color: meta.color,
                        fontWeight: 700, fontSize: 12, whiteSpace: "nowrap",
                      }}>
                        {meta.label}
                      </span>
                    </td>
                    <td style={{ padding: "9px 14px", fontWeight: 600 }}>
                      {row.acteur_display}
                    </td>
                    <td style={{ padding: "9px 14px", color: "#1565c0" }}>
                      {row.superviseur_display}
                    </td>
                    <td style={{ padding: "9px 14px", color: "#555" }}>
                      {row.fiche_date || "—"}
                    </td>
                    <td style={{ padding: "9px 14px", color: "#444", maxWidth: 240 }}>
                      {row.detail_parsed?.label || row.detail || "—"}
                    </td>
                    <td style={{ padding: "9px 14px" }}>
                      <button
                        onClick={() => setSelectedRow(row)}
                        style={{
                          padding: "4px 12px", borderRadius: 6, border: "1px solid #1f4e79",
                          background: "#fff", color: "#1f4e79", fontWeight: 600,
                          fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
                        }}
                      >
                        Voir
                      </button>
                    </td>
                    <td style={{ padding: "9px 14px" }}>
                      {canRevert(row) ? (
                        <button
                          onClick={() => setRevertRow(row)}
                          style={{
                            padding: "4px 12px", borderRadius: 6, border: "1px solid #c62828",
                            background: "#fff", color: "#c62828", fontWeight: 600,
                            fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
                          }}
                        >
                          Annuler
                        </button>
                      ) : row.annule ? (
                        <span style={{ fontSize: 11, color: "#aaa", fontStyle: "italic" }}>Annulée</span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    <AuditDetailDialog row={selectedRow} onClose={() => setSelectedRow(null)} />
    <AnnulerActionDialog
      row={revertRow}
      onClose={() => setRevertRow(null)}
      onReverted={() => load(filters)}
    />
    </div>
  );
}
