import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Minus } from "lucide-react";
import { listModeles, entrainerModeles } from "../../services/iaService.js";
import { useToast } from "../../context/ToastContext.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const ALGO_COLORS = {
  linear_regression:   "#3b82f6",
  random_forest:       "#22c55e",
  decision_tree:       "#f59e0b",
  logistic_regression: "#8b5cf6",
  isolation_forest:    "#ef4444",
};

export default function ListeModeles() {
  const { pushToast } = useToast();
  const { isAdmin }   = useAuth();
  const navigate      = useNavigate();

  useEffect(() => { if (!isAdmin) navigate("/ia", { replace: true }); }, [isAdmin, navigate]);

  const [modeles,     setModeles]     = useState([]);
  const [selected,    setSelected]    = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [training,    setTraining]    = useState(false);
  const [algoFilter,  setAlgoFilter]  = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = algoFilter ? { algorithme: algoFilter } : {};
      const data = await listModeles(params);
      setModeles(Array.isArray(data) ? data : data.results || []);
    } catch {
      pushToast({ type: "error", title: "Erreur", message: "Impossible de charger les modèles." });
    } finally { setLoading(false); }
  }, [pushToast, algoFilter]);

  useEffect(() => { load(); }, [load]);

  const handleEntrainer = async (algo) => {
    setTraining(true);
    try {
      const res = await entrainerModeles(algo ? [algo] : []);
      pushToast({ type: "success", title: "Entraîné", message: `${res.total} modèle(s) entraîné(s).` });
      res.erreurs?.forEach(err =>
        pushToast({ type: "warning", title: err.algorithme, message: err.erreur })
      );
      load();
    } catch (e) {
      pushToast({ type: "error", title: "Erreur", message: e?.message || "Entraînement échoué." });
    } finally { setTraining(false); }
  };

  const fmt3 = v => v != null ? Number(v).toFixed(3) : "—";
  const fmt1 = v => v != null ? Number(v).toFixed(1) : "—";

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Modèles entraînés</h1>
          <p className="page-subtitle">
            {modeles.length} modèle(s) — cliquez sur une ligne pour les détails
          </p>
        </div>
        <button className="btn btn-secondary" onClick={() => handleEntrainer(null)} disabled={training}>
          {training ? "Entraînement…" : "Tout ré-entraîner"}
        </button>
      </div>

      {/* Filtre algorithme */}
      <div style={{ marginBottom: 16 }}>
        <select className="form-control" style={{ width: "auto" }} value={algoFilter}
          onChange={e => setAlgoFilter(e.target.value)}>
          <option value="">Tous les algorithmes</option>
          <option value="linear_regression">Régression Linéaire</option>
          <option value="random_forest">Random Forest</option>
          <option value="decision_tree">Arbre de Décision</option>
          <option value="logistic_regression">Régression Logistique</option>
          <option value="isolation_forest">Isolation Forest</option>
        </select>
      </div>

      {/* Tableau */}
      {loading ? (
        <div className="page-loading">Chargement…</div>
      ) : modeles.length === 0 ? (
        <div className="empty-state">
          Aucun modèle trouvé. Cliquez sur « Tout ré-entraîner » pour démarrer.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Nom</th><th>Algorithme</th><th>Type de tâche</th>
                <th>Observations</th><th>RMSE</th><th>R²</th>
                <th>F1</th><th>Actif</th><th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {modeles.map(m => (
                <tr key={m.id}
                  onClick={() => setSelected(m)}
                  style={{ cursor: "pointer" }}
                  title="Cliquez pour voir les détails">
                  <td style={{ fontWeight: 600 }}>{m.nom}</td>
                  <td>
                    <span style={{
                      padding: "2px 8px", borderRadius: 999, fontSize: 11,
                      background: (ALGO_COLORS[m.algorithme] || "#6b7280") + "22",
                      color: ALGO_COLORS[m.algorithme] || "#6b7280",
                      fontWeight: 600,
                    }}>
                      {m.algorithme_display}
                    </span>
                  </td>
                  <td style={{ fontSize: 12 }}>{m.type_tache_display}</td>
                  <td>{m.nb_observations}</td>
                  <td>{fmt1(m.metriques?.rmse)}</td>
                  <td style={{ fontWeight: 600, color: scoreColor(m.metriques?.r2) }}>
                    {fmt3(m.metriques?.r2)}
                  </td>
                  <td style={{ fontWeight: 600, color: scoreColor(m.metriques?.f1) }}>
                    {fmt3(m.metriques?.f1)}
                  </td>
                  <td>
                    <span style={{ color: m.actif ? "#22c55e" : "#9ca3af", display: "inline-flex" }}>
                      {m.actif ? <Check size={16} /> : <Minus size={16} />}
                    </span>
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {new Date(m.date_entrainement).toLocaleDateString("fr-FR")}
                  </td>
                  <td>
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={e => { e.stopPropagation(); handleEntrainer(m.algorithme); }}
                      disabled={training}>
                      Ré-entraîner
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal détail modèle */}
      {selected && (
        <ModeleModal
          modele={selected}
          onClose={() => setSelected(null)}
          onEntrainer={(algo) => { handleEntrainer(algo); setSelected(null); }}
          training={training}
          fmt1={fmt1}
          fmt3={fmt3}
        />
      )}
    </div>
  );
}

/* ── Modal ─────────────────────────────────────────────────────── */
function ModeleModal({ modele: m, onClose, onEntrainer, training, fmt1, fmt3 }) {
  // Fermer avec Échap
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const importances  = m.metriques?.importances || {};
  const importEntries = Object.entries(importances)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const chartData = {
    labels: importEntries.map(([k]) => k),
    datasets: [{
      label: "Importance (%)",
      data: importEntries.map(([, v]) => (v * 100).toFixed(1)),
      backgroundColor: importEntries.map((_, i) => `hsl(${200 + i * 15},70%,50%)`),
      borderRadius: 4,
    }],
  };

  const metriques = [
    ["RMSE",      fmt1(m.metriques?.rmse),      "Erreur quadratique moyenne"],
    ["MAE",       fmt1(m.metriques?.mae),       "Erreur absolue moyenne"],
    ["R²",        fmt3(m.metriques?.r2),        "Coefficient de détermination"],
    ["Accuracy",  fmt3(m.metriques?.accuracy),  "Précision globale"],
    ["Precision", fmt3(m.metriques?.precision), "Précision positive"],
    ["Recall",    fmt3(m.metriques?.recall),    "Rappel"],
    ["F1",        fmt3(m.metriques?.f1),        "Score F1"],
    ["Obs.",      m.nb_observations,             "Nombre d'observations d'entraînement"],
  ].filter(([, v]) => v !== "—" && v != null);

  return (
    /* Backdrop */
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(2px)",
        zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}>
      {/* Fenêtre modale */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--white)",
          borderRadius: 12,
          width: "100%",
          maxWidth: 680,
          maxHeight: "90vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        }}>

        {/* En-tête */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>{m.nom}</h2>
            <div style={{ marginTop: 4, display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{
                padding: "2px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                background: (ALGO_COLORS[m.algorithme] || "#6b7280") + "22",
                color: ALGO_COLORS[m.algorithme] || "#6b7280",
              }}>
                {m.algorithme_display}
              </span>
              <span style={{ fontSize: 12, color: "#6b7280" }}>
                {m.type_tache_display}
              </span>
              <span style={{ fontSize: 12, color: m.actif ? "#16a34a" : "#9ca3af", fontWeight: 600 }}>
                {m.actif ? "Actif" : "Inactif"}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "var(--background)", border: "none", cursor: "pointer",
              width: 32, height: 32, borderRadius: "50%",
              fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center",
              color: "#6b7280", flexShrink: 0,
            }}
            title="Fermer (Échap)">
            ×
          </button>
        </div>

        {/* Corps défilable */}
        <div style={{ padding: "20px", overflowY: "auto", flex: 1 }}>

          {/* Grille de métriques */}
          {metriques.length > 0 && (
            <section style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 10px", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Métriques de performance
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 10 }}>
                {metriques.map(([label, val, desc]) => (
                  <div key={label} title={desc} style={{
                    background: "var(--background)", borderRadius: 8, padding: "10px 14px",
                    cursor: "help",
                  }}>
                    <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>{label}</div>
                    <div style={{
                      fontWeight: 700, fontSize: 20,
                      color: (label === "R²" || label === "F1" || label === "Accuracy")
                        ? scoreColor(Number(val))
                        : "var(--text, #263238)",
                    }}>
                      {val}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Graphique importance des variables */}
          {importEntries.length > 0 && (
            <section style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 10px", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Importance des variables (%)
              </h3>
              <Bar
                data={chartData}
                options={{
                  indexAxis: "y",
                  responsive: true,
                  plugins: { legend: { display: false } },
                  scales: {
                    x: { max: 100, ticks: { callback: v => `${v}%` } },
                    y: { ticks: { font: { size: 11 } } },
                  },
                }}
              />
            </section>
          )}

          {/* Variables utilisées */}
          {m.features?.length > 0 && (
            <section style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 8px", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Variables d'entrée
              </h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {m.features.map(f => (
                  <span key={f} style={{
                    padding: "3px 10px", borderRadius: 999, fontSize: 12,
                    background: "var(--background)", border: "1px solid var(--border)",
                  }}>
                    {f}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Infos générales */}
          <section>
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 8px", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Informations
            </h3>
            <div style={{ fontSize: 13, color: "#6b7280", display: "flex", flexDirection: "column", gap: 4 }}>
              <span>Version : <strong style={{ color: "var(--text, #263238)" }}>v{m.version}</strong></span>
              <span>
                Entraîné le :{" "}
                <strong style={{ color: "var(--text, #263238)" }}>
                  {new Date(m.date_entrainement).toLocaleString("fr-FR")}
                </strong>
              </span>
              {m.created_by_username && (
                <span>Par : <strong style={{ color: "var(--text, #263238)" }}>{m.created_by_username}</strong></span>
              )}
            </div>
          </section>
        </div>

        {/* Pied de modal */}
        <div style={{
          padding: "12px 20px",
          borderTop: "1px solid var(--border)",
          display: "flex", justifyContent: "flex-end", gap: 8,
          flexShrink: 0,
        }}>
          <button className="btn btn-secondary" onClick={onClose}>Fermer</button>
          <button
            className="btn btn-primary"
            onClick={() => onEntrainer(m.algorithme)}
            disabled={training}>
            {training ? "Entraînement…" : "Ré-entraîner ce modèle"}
          </button>
        </div>
      </div>
    </div>
  );
}

function scoreColor(v) {
  if (v == null || isNaN(v)) return "var(--text, #263238)";
  if (v >= 0.75) return "#16a34a";
  if (v >= 0.5)  return "#d97706";
  return "#dc2626";
}
