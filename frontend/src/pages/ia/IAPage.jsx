import { useEffect, useMemo, useState } from "react";
import ChartCard from "../../components/ChartCard.jsx";
import ChartDialog from "../../components/ChartDialog.jsx";
import DataTable from "../../components/DataTable.jsx";
import LogoLoader from "../../components/LogoLoader.jsx";
import SearchableSelect from "../../components/SearchableSelect.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { getIASummary, recomputeAnomalies, recomputePredictions } from "../../services/iaService.js";
import { listSecteurs } from "../../services/secteurService.js";

const COLORS = {
  primary: "#2e7d32",
  accent: "#fbc02d",
  blue: "#1976d2",
  red: "#d32f2f",
};

const formatInt = (n) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(n || 0));

const niveauLabel = (n) => {
  if (n === "eleve") return "Eleve";
  if (n === "faible") return "Faible";
  return "Moyen";
};

const niveauClass = (n) => {
  if (n === "eleve") return "badge-eleve";
  if (n === "faible") return "badge-faible";
  return "badge-moyen";
};

export default function IAPage() {
  const { pushToast } = useToast();

  const [year, setYear] = useState(new Date().getFullYear());
  const [secteur, setSecteur] = useState("");
  const [secteurs, setSecteurs] = useState([]);
  const [horizon, setHorizon] = useState(6);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeChart, setActiveChart] = useState(null);
  const [saving, setSaving] = useState(false);
  const [recomputing, setRecomputing] = useState(false);

  const years = useMemo(() => {
    const y = new Date().getFullYear();
    return Array.from({ length: 10 }, (_, i) => y - i);
  }, []);

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const s = await listSecteurs();
        setSecteurs(s || []);
      } catch (err) {
        pushToast({ type: "warning", title: "IA", message: err.message });
      }
    };
    loadOptions();
  }, [pushToast]);

  const load = async () => {
    try {
      setLoading(true);
      const d = await getIASummary({ year, secteur: secteur || undefined });
      setData(d);
    } catch (err) {
      pushToast({ type: "error", title: "IA", message: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, secteur]);

  const pred = data?.predictions;
  const predRows = useMemo(() => pred?.predictions || [], [pred]);
  const nextPred = useMemo(() => predRows[0] || null, [predRows]);

  const predChart = useMemo(() => {
    if (!predRows.length) return null;

    const labels = predRows.map((r) => `${r.year}-${String(r.month).padStart(2, "0")}`);
    const isSector = !!pred?.secteur;

    const datasets = [
      {
        label: isSector ? "Total regimes (prevu)" : "Total regimes (prevu)",
        data: predRows.map((r) => Number(r.yhat_total_regimes || 0)),
        borderColor: COLORS.primary,
        backgroundColor: "rgba(46,125,50,0.14)",
        tension: 0.35,
        fill: true,
      },
    ];

    if (isSector) {
      datasets.push({
        label: "Rendement (reg/ha)",
        data: predRows.map((r) => Number(r.yhat_rendement_ha || 0)),
        borderColor: COLORS.accent,
        backgroundColor: "rgba(251,192,45,0.12)",
        tension: 0.35,
        yAxisID: "y1",
      });
    }

    return {
      title: isSector
        ? `Prediction secteur ${pred?.secteur?.code || ""} (${pred?.model || ""})`
        : `Prediction globale (${pred?.model || ""})`,
      type: "line",
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom" } },
        scales: isSector
          ? {
              y: { beginAtZero: true, ticks: { precision: 0 } },
              y1: {
                beginAtZero: true,
                position: "right",
                grid: { drawOnChartArea: false },
              },
            }
          : { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    };
  }, [predRows, pred]);

  const anomalies = useMemo(() => (data?.anomalies || []).slice(0, 200), [data]);

  const anomalyColumns = [
    {
      key: "niveau",
      label: "Niveau",
      render: (r) => (
        <span className={`status-badge ${niveauClass(r.niveau)}`}>{niveauLabel(r.niveau)}</span>
      ),
    },
    { key: "type", label: "Type" },
    {
      key: "date",
      label: "Date",
      render: (r) => r.date || (r.month ? `${year}-${String(r.month).padStart(2, "0")}` : "-"),
    },
    {
      key: "value",
      label: "Valeur",
      render: (r) => (r.value != null ? String(r.value) : "-"),
    },
    { key: "message", label: "Message" },
  ];

  return (
    <div className="page">
      <div className="page-header-row">
        <div>
          <h2>IA & Anomalies</h2>
          <p className="dashboard-subtitle">Predictions + detection d'anomalies (modele statistique)</p>
        </div>
        <div className="row-actions">
          <label className="inline-field">
            Horizon
            <select value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>
              {[3, 6, 12].map((h) => (
                <option key={h} value={h}>
                  {h} mois
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn-ghost"
            onClick={async () => {
              try {
                setSaving(true);
                await recomputePredictions({ year, secteur: secteur || undefined, horizon });
                pushToast({ type: "success", title: "IA", message: "Scenario enregistre" });
                load();
              } catch (err) {
                pushToast({ type: "error", title: "IA", message: err.message });
              } finally {
                setSaving(false);
              }
            }}
            disabled={saving || loading}
          >
            {saving ? "Enregistrement..." : "Enregistrer scenario"}
          </button>
          <button
            className="btn-ghost"
            onClick={async () => {
              try {
                setRecomputing(true);
                await recomputeAnomalies({ year });
                pushToast({ type: "success", title: "IA", message: "Anomalies recalculees" });
                load();
              } catch (err) {
                pushToast({ type: "error", title: "IA", message: err.message });
              } finally {
                setRecomputing(false);
              }
            }}
            disabled={recomputing || loading}
          >
            {recomputing ? "Recalcul..." : "Recalculer anomalies"}
          </button>
          <button className="btn-ghost" onClick={load} disabled={loading}>
            {loading ? "Chargement..." : "Rafraichir"}
          </button>
        </div>
      </div>

      <section className="filters-bar">
        <label>
          Annee
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>

        <label style={{ minWidth: 260 }}>
          Secteur (optionnel)
          <SearchableSelect
            value={secteur}
            onChange={(v) => setSecteur(v)}
            options={secteurs.map((s) => ({
              value: String(s.id),
              label: `${s.code} - ${s.nom}`,
            }))}
            placeholder="Global"
            clearable
          />
        </label>
      </section>

      <section className="stats-grid">
        <article className="stat-card">
          <h3>Anomalies detectees</h3>
          <p>{loading ? "..." : formatInt((data?.anomalies || []).length)}</p>
        </article>
        <article className="stat-card">
          <h3>Prochaine prediction</h3>
          <p>{loading ? "..." : nextPred ? `${formatInt(nextPred.yhat_total_regimes)} regimes` : "-"}</p>
        </article>
        <article className="stat-card">
          <h3>Qualite (MAE)</h3>
          <p>{loading ? "..." : pred?.metrics?.mae ?? "-"}</p>
        </article>
      </section>

      {loading ? (
        <LogoLoader label="Chargement IA..." />
      ) : (
        <>
          {predChart && (
            <section className="charts-grid">
              <ChartCard {...predChart} onClick={() => setActiveChart(predChart)} />
            </section>
          )}

          <section className="tables-grid tables-grid-full">
            <article className="table-card">
              <h3>Anomalies (max 200)</h3>
              <DataTable columns={anomalyColumns} rows={anomalies} pageSize={8} minWidth={0} />
            </article>
          </section>

          <ChartDialog open={!!activeChart} chart={activeChart} onClose={() => setActiveChart(null)} />
        </>
      )}
    </div>
  );
}
