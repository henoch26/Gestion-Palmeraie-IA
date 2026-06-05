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

const PALETTE = [
  "#2e7d32", "#1976d2", "#fbc02d", "#d32f2f", "#7b1fa2",
  "#0097a7", "#f57c00", "#455a64", "#ad1457", "#558b2f",
];

const formatInt = (n) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(n || 0));
const formatFloat = (n) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(Number(n || 0));
const formatMoney = (n) => `${formatInt(n)} FCFA`;

// Injecte un tooltip.callbacks.label dans les options d'un graphique
const addTooltip = (baseOpts, callbackFn) => ({
  ...baseOpts,
  plugins: {
    ...baseOpts.plugins,
    tooltip: {
      ...(baseOpts.plugins?.tooltip || {}),
      callbacks: { label: callbackFn },
    },
  },
});

const fmtRegimes   = (ctx) => `${ctx.dataset.label}: ${formatInt(ctx.parsed.y)} régimes`;
const fmtFCFA      = (ctx) => `${ctx.dataset.label}: ${formatInt(ctx.parsed.y)} FCFA`;
const fmtRendement = (ctx) => `${ctx.dataset.label}: ${formatFloat(ctx.parsed.y)} rég/ha`;
const fmtMixed     = (ctx) => {
  const lbl = (ctx.dataset.label || "").toLowerCase();
  return lbl.includes("prod")
    ? `${ctx.dataset.label}: ${formatInt(ctx.parsed.y)} régimes`
    : `${ctx.dataset.label}: ${formatInt(ctx.parsed.y)} FCFA`;
};

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
  const [period, setPeriod] = useState("year"); // year | compare | multi
  const [multiYears, setMultiYears] = useState([new Date().getFullYear()]);
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
      const yearsParam = period === "multi" && multiYears.length > 0 ? multiYears.join(",") : String(year);
      const data = await getDashboardSummary({
        year,
        secteur: secteur || undefined,
        recolteur: recolteur || undefined,
        regime_type: regimeType || undefined,
        years: yearsParam,
      });
      setSummary(data);
      setLastUpdatedAt(new Date());
    } catch (err) {
      pushToast({ type: "error", title: "Dashboard", message: err.message });
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const multiYearsKey = multiYears.slice().sort().join(",");

  useEffect(() => {
    loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, secteur, recolteur, regimeType, period === "multi" ? multiYearsKey : ""]);

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
          options: addTooltip(baseLineOptions, fmtRegimes),
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
        options: addTooltip(baseLineOptions, fmtRegimes),
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
          options: addTooltip(baseLineOptions, fmtFCFA),
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
        options: addTooltip(baseLineOptions, fmtFCFA),
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
            ...addTooltip(baseBarOptions, fmtRegimes),
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
          ...addTooltip(baseBarOptions, fmtRegimes),
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
            ...addTooltip(baseBarOptions, fmtRegimes),
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
          ...addTooltip(baseBarOptions, fmtRegimes),
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
            ...addTooltip(baseBarOptions, fmtRendement),
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
          ...addTooltip(baseBarOptions, fmtRendement),
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
          options: { ...addTooltip(baseLineOptions, fmtMixed), plugins: { ...addTooltip(baseLineOptions, fmtMixed).plugins, legend: { position: "bottom" } } },
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
        options: addTooltip(baseLineOptions, fmtMixed),
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
          options: addTooltip(baseLineOptions, fmtFCFA),
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
        options: addTooltip(baseLineOptions, fmtFCFA),
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
          options: addTooltip(baseBarOptions, fmtFCFA),
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
        options: addTooltip(baseBarOptions, fmtFCFA),
      };
    })();

    // Production par date (journalier)
    const productionParDate = (() => {
      const src = ch.production_par_date || { labels: [], data: [] };
      return {
        title: `Production par date (${yy})`,
        type: "bar",
        data: {
          labels: src.labels,
          datasets: [{ label: "Regimes", data: src.data, backgroundColor: "rgba(46,125,50,0.65)" }],
        },
        options: {
          ...addTooltip(baseBarOptions, fmtRegimes),
          scales: {
            x: { grid: { display: false }, ticks: { maxRotation: 60, minRotation: 30 } },
            y: { beginAtZero: true, ticks: { precision: 0 } },
          },
        },
      };
    })();

    // Production multi-annees (mensuelle)
    const productionMultiYears = (() => {
      const series = ch.production_multi_years || [];
      if (series.length === 0) return null;
      const labels = series[0]?.labels || [];
      return {
        title: "Production mensuelle multi-annees",
        type: "line",
        data: {
          labels,
          datasets: series.map((s, i) => ({
            label: String(s.year),
            data: s.data,
            borderColor: PALETTE[i % PALETTE.length],
            backgroundColor: `${PALETTE[i % PALETTE.length]}22`,
            tension: 0.35,
            fill: false,
          })),
        },
        options: addTooltip(baseLineOptions, fmtRegimes),
      };
    })();

    // Production par secteur multi-annees
    const productionSecteurMultiYears = (() => {
      const series = ch.production_par_secteur_multi_years || [];
      if (series.length === 0) return null;
      const labels = series[0]?.labels || [];
      return {
        title: "Production par secteur multi-annees",
        type: "bar",
        data: {
          labels,
          datasets: series.map((s, i) => ({
            label: String(s.year),
            data: s.data,
            backgroundColor: `${PALETTE[i % PALETTE.length]}99`,
          })),
        },
        options: {
          ...addTooltip(baseBarOptions, fmtRegimes),
          onClick: (event, elements) => {
            if (!elements?.length) return;
            event?.native?.stopPropagation?.();
            const idx = elements[0].index;
            const id = series[0]?.ids?.[idx];
            if (id) navigate(`/secteurs/${id}`);
          },
        },
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
      productionParDate,
      productionMultiYears,
      productionSecteurMultiYears,
    };
  }, [summary, year, period, baseLineOptions, baseBarOptions, navigate]);

  const statsCards = useMemo(() => {
    const s = summary?.stats || {};
    const regime = s.repartition_par_regime || {};
    return [
      { title: "Production totale (régimes)", value: `${formatInt(s.total_production)} rég.`, color: COLORS.primary },
      { title: "Production totale (kg)", value: `${formatFloat(s.total_kg)} kg`, color: COLORS.primary },
      { title: "Poids moyen / régime", value: s.poids_moyen_regime ? `${formatFloat(s.poids_moyen_regime)} kg` : "—", color: COLORS.secondary },
      { title: "Chiffre d'affaires", value: formatMoney(s.montant_total_ventes), color: COLORS.blue },
      { title: "Secteurs actifs", value: `${formatInt(s.secteurs_actifs)} / ${formatInt(s.secteurs_count)}`, color: COLORS.earth },
      { title: "Récolteurs actifs", value: formatInt(s.recolteurs_actifs), color: COLORS.earth },
      { title: "Rendement moyen", value: s.rendement_moyen ? `${formatFloat(s.rendement_moyen)} rég/ha` : "—", color: COLORS.accent },
      {
        title: "Répartition régimes",
        value: `${formatInt(regime.grands + regime.moyens + regime.petits)} rég.`,
        sub: `Grands : ${formatInt(regime.grands)} · Moyens : ${formatInt(regime.moyens)} · Petits : ${formatInt(regime.petits)}`,
        color: COLORS.secondary,
      },
      {
        title: "Dépenses totales",
        value: formatMoney(s.depenses_totales),
        color: COLORS.red,
        sub: `Nourrit.+Transport : ${formatMoney(s.depenses_total_recolte)} · Salaires : ${formatMoney(s.depenses_salaires_recolteurs)}`,
      },
    ];
  }, [summary]);


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
                  label: `${r.numero_telephone ? `${r.numero_telephone} - ` : ""}${r.nom}`,
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
          <button
            className={`filter-btn ${period === "multi" ? "active" : ""}`}
            onClick={() => { setPeriod("multi"); setMultiYears([year]); }}
          >
            Multi-annees
          </button>
        </div>
      </div>

      {period === "multi" && (
        <section className="filter-panel multi-year-panel">
          <p style={{ margin: "0 0 8px", fontWeight: 600 }}>Selectionner les annees a comparer :</p>
          <div className="filter-row" style={{ flexWrap: "wrap", gap: 10 }}>
            {yearOptions.map((y) => (
              <label key={y} className="checkbox-label" style={{ minWidth: 60 }}>
                <input
                  type="checkbox"
                  checked={multiYears.includes(y)}
                  onChange={(e) => {
                    setMultiYears((prev) =>
                      e.target.checked ? [...prev, y] : prev.filter((v) => v !== y)
                    );
                  }}
                />
                <span>{y}</span>
              </label>
            ))}
          </div>
          {multiYears.length === 0 && (
            <p className="field-error" style={{ marginTop: 6 }}>Selectionner au moins une annee</p>
          )}
        </section>
      )}

      <section className="stats-grid" aria-busy={loading ? "true" : "false"}>
        {statsCards.map((s) => (
          <article
            key={s.title}
            className="stat-card"
            style={{ borderTop: `4px solid ${s.color || "#2e7d32"}` }}
          >
            <h3 style={{ color: "#555", fontSize: 12, fontWeight: 600, textTransform: "uppercase", margin: "0 0 6px" }}>
              {s.title}
            </h3>
            <p style={{ fontSize: 22, fontWeight: 700, margin: 0, color: s.color || "#222" }}>
              {loading ? "…" : s.value}
            </p>
            {s.sub && !loading && (
              <p style={{ fontSize: 11, color: "#888", margin: "4px 0 0", lineHeight: 1.4 }}>
                {s.sub}
              </p>
            )}
          </article>
        ))}
      </section>

      {loading ? (
        <LogoLoader label="Chargement du dashboard..." />
      ) : (
        <>
          {tab === "overview" && period !== "multi" && (
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

          {tab === "overview" && period === "multi" && (
            <section className="charts-grid">
              {charts.productionMultiYears && (
                <ChartCard
                  title={charts.productionMultiYears.title}
                  type={charts.productionMultiYears.type}
                  data={charts.productionMultiYears.data}
                  options={charts.productionMultiYears.options}
                  onClick={() => setActiveChart(charts.productionMultiYears)}
                />
              )}
              {charts.productionSecteurMultiYears && (
                <ChartCard
                  title={charts.productionSecteurMultiYears.title}
                  type={charts.productionSecteurMultiYears.type}
                  data={charts.productionSecteurMultiYears.data}
                  options={charts.productionSecteurMultiYears.options}
                  onClick={() => setActiveChart(charts.productionSecteurMultiYears)}
                />
              )}
            </section>
          )}

          {tab === "analysis" && (
            <section className="charts-grid">
              <ChartCard
                title={charts.productionParDate?.title || "Production par date"}
                type={charts.productionParDate?.type || "bar"}
                data={charts.productionParDate?.data || { labels: [], datasets: [] }}
                options={charts.productionParDate?.options}
                onClick={() => charts.productionParDate && setActiveChart(charts.productionParDate)}
              />
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
