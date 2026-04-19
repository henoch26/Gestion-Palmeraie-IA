import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ChartCard from "../../components/ChartCard.jsx";
import ChartDialog from "../../components/ChartDialog.jsx";
import DataTable from "../../components/DataTable.jsx";
import LogoLoader from "../../components/LogoLoader.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import SearchableSelect from "../../components/SearchableSelect.jsx";
import { getDashboardSummary } from "../../services/dashboardService.js";
import { listRecolteurs } from "../../services/recolteurService.js";
import { listSecteurs } from "../../services/secteurService.js";

const COLORS = {
  primary: "#2e7d32",
  secondary: "#66bb6a",
  accent: "#fbc02d",
  earth: "#6d4c41",
  blue: "#1976d2",
  red: "#d32f2f",
};

const formatInt = (n) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(n || 0));
const formatFloat = (n) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(Number(n || 0));
const formatMoney = (n) => `${formatInt(n)} FCFA`;

const yearOptions = (() => {
  const y = new Date().getFullYear();
  return Array.from({ length: 10 }, (_, i) => y - i);
})();

export default function DashboardPage() {
  const { pushToast } = useToast();
  const navigate = useNavigate();

  const [tab, setTab] = useState("overview"); // overview | analysis | ops
  const [showFilters, setShowFilters] = useState(false);

  const [year, setYear] = useState(new Date().getFullYear());
  const [period, setPeriod] = useState("year"); // year | compare
  const [secteur, setSecteur] = useState("");
  const [recolteur, setRecolteur] = useState("");
  const [regimeType, setRegimeType] = useState("");

  const [secteurs, setSecteurs] = useState([]);
  const [recolteurs, setRecolteurs] = useState([]);

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeChart, setActiveChart] = useState(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  // Options de filtre (secteurs/recolteurs)
  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [s, r] = await Promise.all([listSecteurs(), listRecolteurs()]);
        setSecteurs(s || []);
        setRecolteurs(r || []);
      } catch (err) {
        pushToast({ type: "warning", title: "Filtres", message: err.message });
      }
    };
    loadOptions();
  }, [pushToast]);

  const loadSummary = async () => {
    try {
      setLoading(true);
      const data = await getDashboardSummary({
        year,
        secteur: secteur || undefined,
        recolteur: recolteur || undefined,
        regime_type: regimeType || undefined,
      });
      setSummary(data);
      setLastUpdatedAt(new Date());
    } catch (err) {
      pushToast({ type: "error", title: "Dashboard", message: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, secteur, recolteur, regimeType]);

  const secteurLabel = useMemo(() => {
    if (!secteur) return "";
    const found = secteurs.find((s) => String(s.id) === String(secteur));
    return found ? `${found.code} - ${found.nom}` : String(secteur);
  }, [secteur, secteurs]);

  const recolteurLabel = useMemo(() => {
    if (!recolteur) return "";
    const found = recolteurs.find((r) => String(r.id) === String(recolteur));
    return found ? found.nom : String(recolteur);
  }, [recolteur, recolteurs]);

  const exportCsv = () => {
    if (!summary) return;
    const escapeCell = (v) => `"${String(v ?? "").replace(/"/g, "\"\"")}"`;
    const lines = [
      ["Indicateur", "Valeur"],
      ...statsCards.map((s) => [s.title, s.value]),
    ];
    const csv = lines.map((r) => r.map(escapeCell).join(",")).join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `dashboard_stats_${summary.year || year}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const resetFilters = () => {
    setSecteur("");
    setRecolteur("");
    setRegimeType("");
  };

  const baseLineOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "bottom" },
        tooltip: { mode: "index", intersect: false },
      },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, ticks: { precision: 0 } },
      },
    }),
    []
  );

  const baseBarOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, ticks: { precision: 0 } },
      },
    }),
    []
  );

  const charts = useMemo(() => {
    if (!summary?.charts) return {};
    const ch = summary.charts;
    const yy = Number(summary.year || year);
    const py = yy - 1;

    const production = (() => {
      if (period === "compare") {
        const src = ch.production_compare;
        return {
          title: `Production (Comparaison ${yy}/${py})`,
          type: "line",
          data: {
            labels: src.labels,
            datasets: [
              {
                label: String(yy),
                data: src.current,
                borderColor: COLORS.primary,
                backgroundColor: "rgba(46,125,50,0.14)",
                tension: 0.35,
                fill: true,
              },
              {
                label: String(py),
                data: src.previous,
                borderColor: COLORS.accent,
                backgroundColor: "rgba(251,192,45,0.12)",
                tension: 0.35,
                fill: true,
              },
            ],
          },
          options: baseLineOptions,
        };
      }
      const src = ch.production_annuelle;
      return {
        title: `Production (Annee ${yy})`,
        type: "line",
        data: {
          labels: src.labels,
          datasets: [
            {
              label: String(yy),
              data: src.data,
              borderColor: COLORS.primary,
              backgroundColor: "rgba(46,125,50,0.14)",
              tension: 0.35,
              fill: true,
            },
          ],
        },
        options: baseLineOptions,
      };
    })();

    const ventes = (() => {
      if (period === "compare") {
        const src = ch.montant_ventes_compare;
        return {
          title: `Ventes (Comparaison ${yy}/${py})`,
          type: "line",
          data: {
            labels: src.labels,
            datasets: [
              {
                label: String(yy),
                data: src.current,
                borderColor: COLORS.blue,
                backgroundColor: "rgba(25,118,210,0.12)",
                tension: 0.35,
                fill: true,
              },
              {
                label: String(py),
                data: src.previous,
                borderColor: COLORS.earth,
                backgroundColor: "rgba(109,76,65,0.10)",
                tension: 0.35,
                fill: true,
              },
            ],
          },
          options: baseLineOptions,
        };
      }
      const src = ch.montant_ventes_annuel;
      return {
        title: `Ventes (Annee ${yy})`,
        type: "line",
        data: {
          labels: src.labels,
          datasets: [
            {
              label: String(yy),
              data: src.data,
              borderColor: COLORS.blue,
              backgroundColor: "rgba(25,118,210,0.12)",
              tension: 0.35,
              fill: true,
            },
          ],
        },
        options: baseLineOptions,
      };
    })();

    const productionSecteurs = (() => {
      if (period === "compare") {
        const src = ch.production_par_secteur_compare;
        return {
          title: `Production par secteur (Comparaison ${yy}/${py})`,
          type: "bar",
          data: {
            labels: src.labels,
            datasets: [
              { label: String(yy), data: src.current, backgroundColor: COLORS.secondary },
              { label: String(py), data: src.previous, backgroundColor: "rgba(109,76,65,0.45)" },
            ],
          },
          options: {
            ...baseBarOptions,
            onClick: (event, elements) => {
              if (!elements?.length) return;
              event?.native?.stopPropagation?.();
              const idx = elements[0].index;
              const id = src.ids?.[idx];
              if (id) navigate(`/secteurs/${id}`);
            },
          },
        };
      }
      const src = ch.production_par_secteur;
      return {
        title: `Production par secteur (Annee ${yy})`,
        type: "bar",
        data: {
          labels: src.labels,
          datasets: [
            { label: "Production", data: src.data, backgroundColor: COLORS.secondary },
          ],
        },
        options: {
          ...baseBarOptions,
          onClick: (event, elements) => {
            if (!elements?.length) return;
            event?.native?.stopPropagation?.();
            const idx = elements[0].index;
            const id = src.ids?.[idx];
            if (id) navigate(`/secteurs/${id}`);
          },
        },
      };
    })();

    const perfRecolteurs = (() => {
      if (period === "compare") {
        const src = ch.performance_recolteurs_compare;
        return {
          title: `Performance recolteurs (Comparaison ${yy}/${py})`,
          type: "bar",
          data: {
            labels: src.labels,
            datasets: [
              { label: String(yy), data: src.current, backgroundColor: COLORS.primary },
              { label: String(py), data: src.previous, backgroundColor: "rgba(251,192,45,0.55)" },
            ],
          },
          options: {
            ...baseBarOptions,
            onClick: (event, elements) => {
              if (!elements?.length) return;
              event?.native?.stopPropagation?.();
              const idx = elements[0].index;
              const id = src.ids?.[idx];
              if (id) navigate(`/recolteurs/${id}`);
            },
          },
        };
      }
      const src = ch.performance_recolteurs;
      return {
        title: `Performance recolteurs (Annee ${yy})`,
        type: "bar",
        data: {
          labels: src.labels,
          datasets: [{ label: "Regimes", data: src.data, backgroundColor: COLORS.primary }],
        },
        options: {
          ...baseBarOptions,
          onClick: (event, elements) => {
            if (!elements?.length) return;
            event?.native?.stopPropagation?.();
            const idx = elements[0].index;
            const id = src.ids?.[idx];
            if (id) navigate(`/recolteurs/${id}`);
          },
        },
      };
    })();

    const rendementSecteurs = (() => {
      if (period === "compare") {
        const src = ch.rendement_par_secteur_compare;
        return {
          title: `Rendement (reg/ha) par secteur (Comparaison ${yy}/${py})`,
          type: "bar",
          data: {
            labels: src.labels,
            datasets: [
              { label: String(yy), data: src.current, backgroundColor: "rgba(102,187,106,0.75)" },
              { label: String(py), data: src.previous, backgroundColor: "rgba(109,76,65,0.45)" },
            ],
          },
          options: {
            ...baseBarOptions,
            onClick: (event, elements) => {
              if (!elements?.length) return;
              event?.native?.stopPropagation?.();
              const idx = elements[0].index;
              const id = src.ids?.[idx];
              if (id) navigate(`/secteurs/${id}`);
            },
          },
        };
      }
      const src = ch.rendement_par_secteur;
      return {
        title: `Rendement (reg/ha) par secteur (Annee ${yy})`,
        type: "bar",
        data: {
          labels: src.labels,
          datasets: [{ label: "Rendement", data: src.data, backgroundColor: "rgba(102,187,106,0.75)" }],
        },
        options: {
          ...baseBarOptions,
          onClick: (event, elements) => {
            if (!elements?.length) return;
            event?.native?.stopPropagation?.();
            const idx = elements[0].index;
            const id = src.ids?.[idx];
            if (id) navigate(`/secteurs/${id}`);
          },
        },
      };
    })();

    const depensesVsProduction = (() => {
      const src = period === "compare" ? ch.depenses_vs_production_compare : ch.depenses_vs_production;

      if (period === "compare") {
        return {
          title: `Depenses vs Production (Comparaison ${yy}/${py})`,
          type: "line",
          data: {
            labels: src.labels,
            datasets: [
              { label: `Production ${yy}`, data: src.production_current, borderColor: COLORS.primary, tension: 0.35 },
              { label: `Production ${py}`, data: src.production_previous, borderColor: COLORS.accent, tension: 0.35 },
              { label: `Depenses ${yy}`, data: src.depenses_current, borderColor: COLORS.blue, tension: 0.35 },
              { label: `Depenses ${py}`, data: src.depenses_previous, borderColor: COLORS.earth, tension: 0.35 },
            ],
          },
          options: { ...baseLineOptions, plugins: { ...baseLineOptions.plugins, legend: { position: "bottom" } } },
        };
      }

      return {
        title: `Depenses vs Production (Annee ${yy})`,
        type: "line",
        data: {
          labels: src.labels,
          datasets: [
            {
              label: "Production",
              data: src.production,
              borderColor: COLORS.primary,
              backgroundColor: "rgba(46,125,50,0.10)",
              tension: 0.35,
              fill: true,
            },
            {
              label: "Depenses",
              data: src.depenses,
              borderColor: COLORS.blue,
              backgroundColor: "rgba(25,118,210,0.08)",
              tension: 0.35,
              fill: true,
            },
          ],
        },
        options: baseLineOptions,
      };
    })();

    const coutTravaux = (() => {
      if (period === "compare") {
        const src = ch.cout_travaux_annuel_compare;
        return {
          title: `Cout travaux (Comparaison ${yy}/${py})`,
          type: "line",
          data: {
            labels: src.labels,
            datasets: [
              { label: String(yy), data: src.current, borderColor: COLORS.earth, tension: 0.35, fill: false },
              { label: String(py), data: src.previous, borderColor: COLORS.accent, tension: 0.35, fill: false },
            ],
          },
          options: baseLineOptions,
        };
      }
      const src = ch.cout_travaux_annuel;
      return {
        title: `Cout travaux (Annee ${yy})`,
        type: "line",
        data: {
          labels: src.labels,
          datasets: [
            { label: "Cout", data: src.data, borderColor: COLORS.earth, backgroundColor: "rgba(109,76,65,0.10)", tension: 0.35, fill: true },
          ],
        },
        options: baseLineOptions,
      };
    })();

    const coutTravauxNature = (() => {
      if (period === "compare") {
        const src = ch.cout_travaux_par_nature_compare;
        return {
          title: `Cout travaux par nature (Comparaison ${yy}/${py})`,
          type: "bar",
          data: {
            labels: src.labels,
            datasets: [
              { label: String(yy), data: src.current, backgroundColor: "rgba(109,76,65,0.60)" },
              { label: String(py), data: src.previous, backgroundColor: "rgba(251,192,45,0.55)" },
            ],
          },
          options: baseBarOptions,
        };
      }
      const src = ch.cout_travaux_par_nature;
      return {
        title: `Cout travaux par nature (Annee ${yy})`,
        type: "bar",
        data: {
          labels: src.labels,
          datasets: [{ label: "Cout", data: src.data, backgroundColor: "rgba(109,76,65,0.60)" }],
        },
        options: baseBarOptions,
      };
    })();

    return {
      production,
      ventes,
      productionSecteurs,
      perfRecolteurs,
      rendementSecteurs,
      depensesVsProduction,
      coutTravaux,
      coutTravauxNature,
    };
  }, [summary, year, period, baseLineOptions, baseBarOptions, navigate]);

  const statsCards = useMemo(() => {
    const s = summary?.stats || {};
    return [
      { title: "Production totale", value: `${formatInt(s.total_production)} regimes` },
      { title: "Montant total ventes", value: formatMoney(s.montant_total_ventes) },
      { title: "Depenses recolte", value: formatMoney(s.depenses_total_recolte) },
      { title: "Cout total travaux", value: formatMoney(s.cout_total_travaux) },
      { title: "Rendement moyen", value: `${formatFloat(s.rendement_moyen)} reg/ha` },
      { title: "Recolteurs actifs", value: formatInt(s.recolteurs_actifs) },
      { title: "Secteurs concernes", value: `${formatInt(s.secteurs_involved)} / ${formatInt(s.secteurs_count)}` },
      { title: "Fiches recolte", value: formatInt(s.fiches_recolte_count) },
      { title: "Fiches travaux", value: formatInt(s.fiches_travaux_count) },
    ];
  }, [summary]);

  const primaryStats = useMemo(() => statsCards.slice(0, 4), [statsCards]);
  const secondaryStats = useMemo(() => statsCards.slice(4), [statsCards]);

  return (
    <div className="page dashboard">
      <div className="page-header-row">
        <div>
          <h2 style={{ margin: 0 }}>Dashboard</h2>
          <p className="dashboard-subtitle">
            Synthese {year}
            {secteurLabel ? ` | ${secteurLabel}` : ""}
            {recolteurLabel ? ` | ${recolteurLabel}` : ""}
            {regimeType ? ` | ${regimeType}` : ""}
            {lastUpdatedAt ? ` | Maj: ${lastUpdatedAt.toLocaleString("fr-FR")}` : ""}
          </p>
        </div>

        <div className="row-actions">
          <label className="inline-field">
            Annee
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <button className="btn-ghost" onClick={() => setShowFilters((v) => !v)}>
            {showFilters ? "Masquer filtres" : "Filtres"}
          </button>
          <button className="btn-ghost" onClick={exportCsv} disabled={!summary}>
            Exporter Excel
          </button>
          <button className="btn-primary" onClick={loadSummary} disabled={loading}>
            {loading ? "Chargement..." : "Rafraichir"}
          </button>
        </div>
      </div>

      {showFilters && (
        <section className="filter-panel">
          <div className="filter-row">
            <label>
              Secteur
              <select value={secteur} onChange={(e) => setSecteur(e.target.value)}>
                <option value="">Tous</option>
                {secteurs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} - {s.nom}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Recolteur
              <SearchableSelect
                value={recolteur}
                onChange={(v) => setRecolteur(String(v || ""))}
                options={(recolteurs || []).map((r) => ({
                  value: String(r.id),
                  label: `${r.code ? `${r.code} - ` : ""}${r.nom}`,
                }))}
                placeholder="Tous"
                clearable
              />
            </label>

            <label>
              Type de regime
              <select value={regimeType} onChange={(e) => setRegimeType(e.target.value)}>
                <option value="">Total</option>
                <option value="grands">Grands</option>
                <option value="moyens">Moyens</option>
                <option value="petits">Petits</option>
              </select>
            </label>

            <div className="row-actions">
              <button className="btn-ghost" onClick={resetFilters}>
                Reinitialiser
              </button>
            </div>
          </div>
        </section>
      )}

      <div className="dashboard-bar">
        <div className="tabs">
          <button className={`tab-btn ${tab === "overview" ? "active" : ""}`} onClick={() => setTab("overview")}>
            Vue d&apos;ensemble
          </button>
          <button className={`tab-btn ${tab === "analysis" ? "active" : ""}`} onClick={() => setTab("analysis")}>
            Analyses
          </button>
          <button className={`tab-btn ${tab === "ops" ? "active" : ""}`} onClick={() => setTab("ops")}>
            Operations
          </button>
        </div>

        <div className="period-chips filters" aria-label="Periode des graphiques">
          <button
            className={`filter-btn ${period === "year" ? "active" : ""}`}
            onClick={() => setPeriod("year")}
          >
            Annee complete
          </button>
          <button
            className={`filter-btn ${period === "compare" ? "active" : ""}`}
            onClick={() => setPeriod("compare")}
          >
            Comparaison {year}/{year - 1}
          </button>
        </div>
      </div>

      <section className="stats-grid" aria-busy={loading ? "true" : "false"}>
        {primaryStats.map((s) => (
          <article key={s.title} className="stat-card">
            <h3>{s.title}</h3>
            <p>{loading ? "..." : s.value}</p>
          </article>
        ))}
      </section>

      {secondaryStats.length > 0 && (
        <details className="kpi-details">
          <summary>Autres indicateurs</summary>
          <div className="kpi-mini-grid">
            {secondaryStats.map((s) => (
              <article key={s.title} className="stat-card">
                <h3>{s.title}</h3>
                <p>{loading ? "..." : s.value}</p>
              </article>
            ))}
          </div>
        </details>
      )}

      {loading ? (
        <LogoLoader label="Chargement du dashboard..." />
      ) : (
        <>
          {tab === "overview" && (
            <section className="charts-grid">
              <ChartCard
                title={charts.production?.title || "Production"}
                type={charts.production?.type || "line"}
                data={charts.production?.data || { labels: [], datasets: [] }}
                options={charts.production?.options}
                onClick={() => charts.production && setActiveChart(charts.production)}
              />
              <ChartCard
                title={charts.ventes?.title || "Ventes"}
                type={charts.ventes?.type || "line"}
                data={charts.ventes?.data || { labels: [], datasets: [] }}
                options={charts.ventes?.options}
                onClick={() => charts.ventes && setActiveChart(charts.ventes)}
              />
              <ChartCard
                title={charts.productionSecteurs?.title || "Production par secteur"}
                type={charts.productionSecteurs?.type || "bar"}
                data={charts.productionSecteurs?.data || { labels: [], datasets: [] }}
                options={charts.productionSecteurs?.options}
                onClick={() =>
                  charts.productionSecteurs && setActiveChart(charts.productionSecteurs)
                }
              />
              <ChartCard
                title={charts.perfRecolteurs?.title || "Performance recolteurs"}
                type={charts.perfRecolteurs?.type || "bar"}
                data={charts.perfRecolteurs?.data || { labels: [], datasets: [] }}
                options={charts.perfRecolteurs?.options}
                onClick={() =>
                  charts.perfRecolteurs && setActiveChart(charts.perfRecolteurs)
                }
              />
            </section>
          )}

          {tab === "analysis" && (
            <section className="charts-grid">
              <ChartCard
                title={charts.rendementSecteurs?.title || "Rendement par secteur"}
                type={charts.rendementSecteurs?.type || "bar"}
                data={charts.rendementSecteurs?.data || { labels: [], datasets: [] }}
                options={charts.rendementSecteurs?.options}
                onClick={() =>
                  charts.rendementSecteurs && setActiveChart(charts.rendementSecteurs)
                }
              />
              <ChartCard
                title={charts.depensesVsProduction?.title || "Depenses vs Production"}
                type={charts.depensesVsProduction?.type || "line"}
                data={charts.depensesVsProduction?.data || { labels: [], datasets: [] }}
                options={charts.depensesVsProduction?.options}
                onClick={() =>
                  charts.depensesVsProduction &&
                  setActiveChart(charts.depensesVsProduction)
                }
              />
              <ChartCard
                title={charts.coutTravaux?.title || "Cout travaux"}
                type={charts.coutTravaux?.type || "line"}
                data={charts.coutTravaux?.data || { labels: [], datasets: [] }}
                options={charts.coutTravaux?.options}
                onClick={() =>
                  charts.coutTravaux && setActiveChart(charts.coutTravaux)
                }
              />
              <ChartCard
                title={charts.coutTravauxNature?.title || "Cout travaux par nature"}
                type={charts.coutTravauxNature?.type || "bar"}
                data={charts.coutTravauxNature?.data || { labels: [], datasets: [] }}
                options={charts.coutTravauxNature?.options}
                onClick={() =>
                  charts.coutTravauxNature &&
                  setActiveChart(charts.coutTravauxNature)
                }
              />
            </section>
          )}

          {tab === "ops" && (
            <section className="tables-grid">
              <article className="table-card">
                <div className="page-header-row">
                  <h3>Derniers secteurs</h3>
                  <button className="btn-ghost btn-mini" onClick={() => navigate("/secteurs")}>
                    Voir tout
                  </button>
                </div>
                <DataTable
                  columns={[
                    { key: "code", label: "Code" },
                    { key: "nom", label: "Nom" },
                    { key: "superficie_ha", label: "Ha" },
                  ]}
                  rows={summary?.lists?.secteurs || []}
                  pageSize={5}
                  minWidth={0}
                />
              </article>

              <article className="table-card">
                <div className="page-header-row">
                  <h3>Dernieres recoltes</h3>
                  <button className="btn-ghost btn-mini" onClick={() => navigate("/recoltes")}>
                    Voir tout
                  </button>
                </div>
                <DataTable
                  columns={[
                    { key: "id", label: "ID" },
                    { key: "date", label: "Date" },
                  ]}
                  rows={summary?.lists?.recoltes || []}
                  pageSize={5}
                  minWidth={0}
                />
              </article>

              <article className="table-card">
                <div className="page-header-row">
                  <h3>Derniers travaux</h3>
                  <button className="btn-ghost btn-mini" onClick={() => navigate("/travaux")}>
                    Voir tout
                  </button>
                </div>
                <DataTable
                  columns={[
                    { key: "periode_travaux", label: "Periode" },
                    { key: "nature_travaux", label: "Nature" },
                  ]}
                  rows={summary?.lists?.travaux || []}
                  pageSize={5}
                  minWidth={0}
                />
              </article>

              <article className="table-card">
                <h3>Derniers recus de vente</h3>
                <DataTable
                  columns={[
                    { key: "date", label: "Date" },
                    { key: "client", label: "Client" },
                    { key: "montant", label: "Montant" },
                  ]}
                  rows={summary?.lists?.recus_vente || []}
                  pageSize={5}
                  minWidth={0}
                />
              </article>

              <article className="table-card">
                <div className="page-header-row">
                  <h3>Materiels</h3>
                  <button className="btn-ghost btn-mini" onClick={() => navigate("/materiels")}>
                    Voir tout
                  </button>
                </div>
                <DataTable
                  columns={[
                    { key: "numero", label: "Numero" },
                    { key: "designation", label: "Designation" },
                    { key: "quantite", label: "Qte" },
                  ]}
                  rows={summary?.lists?.materiels || []}
                  pageSize={5}
                  minWidth={0}
                />
              </article>
            </section>
          )}
        </>
      )}

      <ChartDialog open={!!activeChart} onClose={() => setActiveChart(null)} chart={activeChart} />
    </div>
  );
}
