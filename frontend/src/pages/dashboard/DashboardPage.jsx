import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ChartCard from "../../components/ChartCard.jsx";
import ChartDialog from "../../components/ChartDialog.jsx";
import FicheJourDialog from "../../components/FicheJourDialog.jsx";
import LogoLoader from "../../components/LogoLoader.jsx";
import ProductionHeatmap from "../../components/ProductionHeatmap.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { apiGet } from "../../api/axios.js";
import { getDashboardSummary } from "../../services/dashboardService.js";
import { getNotifications } from "../../services/notificationService.js";

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtInt  = (n) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(n || 0));
const fmtDec  = (n) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(Number(n || 0));
const fmtMoney = (n) => `${fmtInt(n)} FCFA`;

const COLORS = {
  green:  "#2e7d32", lightGreen: "#66bb6a",
  blue:   "#1565c0", lightBlue: "#42a5f5",
  orange: "#e65100", amber: "#f9a825",
  red:    "#c62828", pink: "#ad1457",
  brown:  "#4e342e", teal: "#00695c",
  grey:   "#546e7a",
};

const PALETTE = ["#2e7d32","#1565c0","#e65100","#f9a825","#ad1457","#00695c","#4e342e","#546e7a","#7b1fa2","#0097a7"];

const yearOptions = (() => {
  const y = new Date().getFullYear();
  return Array.from({ length: 10 }, (_, i) => y - i);
})();

// ── Composant carte KPI ───────────────────────────────────────────────────────
function KpiCard({ title, value, sub, color = COLORS.green, loading, compact = false }) {
  return (
    <article className="stat-card" style={{
      borderTop: `3px solid ${color}`,
      borderLeft: "none",
      padding: compact ? "10px 12px" : "16px",
    }}>
      <h3 style={{ color: "#888", fontSize: compact ? 10 : 11, fontWeight: 700, textTransform: "uppercase", margin: compact ? "0 0 3px" : "0 0 6px", letterSpacing: ".5px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {title}
      </h3>
      <p style={{ fontSize: compact ? 17 : 22, fontWeight: 700, margin: 0, color: loading ? "#ccc" : color }}>
        {loading ? "…" : value}
      </p>
      {sub && !loading && (
        <p style={{ fontSize: 10, color: "#999", margin: "3px 0 0", lineHeight: 1.4 }}>{sub}</p>
      )}
    </article>
  );
}

// ── Composant bandeau alerte ──────────────────────────────────────────────────
function AlerteBandeau({ notifications }) {
  const alertes = (notifications || []).filter((n) => !n.lu && n.type === "warning");
  if (!alertes.length) return null;
  return (
    <div style={{
      background: "#fff3e0", border: "1px solid #ffb74d", borderRadius: 6,
      padding: "10px 16px", marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 8,
    }}>
      <span style={{ fontWeight: 700, color: "#e65100", marginRight: 4 }}>⚠ Alertes :</span>
      {alertes.slice(0, 4).map((a) => (
        <span key={a.id} style={{ background: "#ffe0b2", borderRadius: 4, padding: "2px 10px", fontSize: 13, color: "#bf360c" }}>
          {a.message}
        </span>
      ))}
      {alertes.length > 4 && (
        <span style={{ fontSize: 12, color: "#e65100" }}>+{alertes.length - 4} autres</span>
      )}
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { pushToast } = useToast();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") || "overview";
  const setTab = (key) => setSearchParams({ tab: key }, { replace: true });
  const [year, setYear] = useState(new Date().getFullYear());
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeChart, setActiveChart] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [ficheJour, setFicheJour] = useState({ open: false, date: null, loading: false, data: null });

  const loadSummary = async () => {
    try {
      setLoading(true);
      const data = await getDashboardSummary({ year });
      setSummary(data);
    } catch (err) {
      pushToast({ type: "error", title: "Dashboard", message: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSummary(); }, [year]);

  // Chargement des alertes (notifications non lues de type warning)
  useEffect(() => {
    getNotifications()
      .then((data) => setNotifications(data?.results || []))
      .catch(() => {});
  }, []);

  const s = summary?.stats || {};
  const charts = summary?.charts || {};
  const tables = summary?.tables || {};

  // ── Helpers tooltip ───────────────────────────────────────────────────────
  const ttRegimes = (ctx) => {
    const val = ctx.parsed?.y ?? ctx.parsed;
    const lbl = ctx.dataset?.label || ctx.label || "";
    return `${lbl} : ${fmtInt(val)} régimes`;
  };
  const ttFCFA = (ctx) => {
    const val = ctx.parsed?.y ?? ctx.parsed;
    const lbl = ctx.dataset?.label || ctx.label || "";
    return `${lbl} : ${fmtInt(val)} FCFA`;
  };

  // ── Options Chart.js ─────────────────────────────────────────────────────
  const lineOptsRegimes = {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { position: "bottom" },
      tooltip: { callbacks: { label: ttRegimes } },
    },
    scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 } } },
  };
  const barOptsRegimes = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { position: "bottom" },
      tooltip: { callbacks: { label: ttRegimes } },
    },
    scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 } } },
  };
  const barOptsFCFA = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { position: "bottom" },
      tooltip: { callbacks: { label: ttFCFA } },
    },
    scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 } } },
  };
  const pieOptsRegimes = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { position: "right" },
      subtitle: {
        display: true,
        text: "en nombre de régimes",
        color: "#999",
        font: { size: 11, style: "italic" },
        padding: { bottom: 6 },
      },
      tooltip: { callbacks: { label: ttRegimes } },
    },
  };

  // Alias pour les anciens usages (non supprimés pour ne pas casser d'éventuels graphiques existants)
  const lineOpts = lineOptsRegimes;
  const barOpts  = barOptsRegimes;
  const pieOpts  = pieOptsRegimes;

  const truncateToCurrentMonth = (data, targetYear) => {
    const now = new Date();
    if (targetYear !== now.getFullYear()) return data;
    const currentMonth = now.getMonth() + 1;
    return data.map((val, idx) => (idx + 1 > currentMonth ? null : val));
  };

  // ── Graphique production mensuelle ────────────────────────────────────────
  const chartProdMensuelle = useMemo(() => {
    const src = charts.production_annuelle;
    if (!src) return null;
    return {
      title: `Production mensuelle ${year}`,
      type: "line",
      data: {
        labels: src.labels,
        datasets: [{ label: String(year), data: truncateToCurrentMonth(src.data, year), borderColor: COLORS.green, backgroundColor: "#2e7d3222", tension: 0.35, fill: true }],
      },
      options: lineOpts,
    };
  }, [charts.production_annuelle, year]);

  // ── Graphique camembert régimes ───────────────────────────────────────────
  const chartRegimesPie = useMemo(() => {
    const reg = s.repartition_par_regime || {};
    const vals = [reg.grands || 0, reg.moyens || 0, reg.petits || 0];
    if (!vals.some(Boolean)) return null;
    const total = vals.reduce((a, b) => a + b, 0);

    const regimesLabelsPlugin = {
      id: "regimesLabels",
      afterDatasetsDraw(chart) {
        const { ctx, chartArea } = chart;

        // Labels sur chaque tranche
        chart.data.datasets.forEach((dataset, di) => {
          const meta = chart.getDatasetMeta(di);
          if (meta.hidden) return;
          meta.data.forEach((arc, i) => {
            const value = Number(dataset.data[i]) || 0;
            if (!value) return;
            const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0";
            const pos = arc.getCenterPoint();
            ctx.save();
            ctx.shadowColor = "rgba(0,0,0,0.4)";
            ctx.shadowBlur = 3;
            ctx.fillStyle = "#fff";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = "bold 12px Manrope, sans-serif";
            ctx.fillText(fmtInt(value), pos.x, pos.y - 7);
            ctx.font = "10px Manrope, sans-serif";
            ctx.fillText(`${pct}%`, pos.x, pos.y + 7);
            ctx.restore();
          });
        });

        // Total au centre du doughnut
        const cx = (chartArea.left + chartArea.right) / 2;
        const cy = (chartArea.top + chartArea.bottom) / 2;
        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#888";
        ctx.font = "bold 10px Manrope, sans-serif";
        ctx.fillText("TOTAL", cx, cy - 13);
        ctx.fillStyle = "#222";
        ctx.font = "bold 18px Manrope, sans-serif";
        ctx.fillText(fmtInt(total), cx, cy + 3);
        ctx.fillStyle = "#aaa";
        ctx.font = "10px Manrope, sans-serif";
        ctx.fillText("régimes", cx, cy + 18);
        ctx.restore();
      },
    };

    return {
      title: `Répartition par type de régime (${year})`,
      type: "doughnut",
      data: {
        labels: ["Grands", "Moyens", "Petits"],
        datasets: [{ data: vals, backgroundColor: [COLORS.green, COLORS.blue, COLORS.amber] }],
      },
      options: pieOpts,
      plugins: [regimesLabelsPlugin],
    };
  }, [s.repartition_par_regime, year]);

  // ── Graphique empilé régimes × secteur ───────────────────────────────────
  const chartRegimesSecteur = useMemo(() => {
    const src = charts.production_par_regime_secteur;
    if (!src?.labels?.length) return null;
    const hasData = [...src.grands, ...src.moyens, ...src.petits].some(Boolean);
    if (!hasData) return null;

    const stackedBarLabelsPlugin = {
      id: "stackedBarLabels",
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        const datasets = chart.data.datasets;

        // Valeur sur chaque bande
        datasets.forEach((dataset, di) => {
          const meta = chart.getDatasetMeta(di);
          if (meta.hidden) return;
          meta.data.forEach((bar, i) => {
            const value = Number(dataset.data[i]) || 0;
            if (!value) return;
            const { x, y, base } = bar.getProps(["x", "y", "base"], true);
            const segH = Math.abs(base - y);
            if (segH < 18) return;
            ctx.save();
            ctx.fillStyle = "#fff";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = "bold 10px Manrope, sans-serif";
            ctx.shadowColor = "rgba(0,0,0,0.4)";
            ctx.shadowBlur = 3;
            ctx.fillText(fmtInt(value), x, (y + base) / 2);
            ctx.restore();
          });
        });

        // Total au-dessus de chaque barre empilée
        const nBars = chart.data.labels.length;
        for (let i = 0; i < nBars; i++) {
          let total = 0;
          let topY = Infinity;
          datasets.forEach((ds, di) => {
            const meta = chart.getDatasetMeta(di);
            if (meta.hidden) return;
            total += Number(ds.data[i]) || 0;
            const { y } = meta.data[i].getProps(["y"], true);
            if (y < topY) topY = y;
          });
          if (!total) continue;
          const { x } = chart.getDatasetMeta(0).data[i].getProps(["x"], true);
          ctx.save();
          ctx.fillStyle = "#1f4e79";
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.font = "bold 11px Manrope, sans-serif";
          ctx.fillText(fmtInt(total), x, topY - 4);
          ctx.restore();
        }
      },
    };

    return {
      title: `Régimes par type et par secteur (${year})`,
      type: "bar",
      data: {
        labels: src.labels,
        datasets: [
          { label: "Grands",  data: src.grands, backgroundColor: `${COLORS.green}cc`,  stack: "regimes" },
          { label: "Moyens",  data: src.moyens, backgroundColor: `${COLORS.blue}cc`,   stack: "regimes" },
          { label: "Petits",  data: src.petits, backgroundColor: `${COLORS.amber}cc`,  stack: "regimes" },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 20 } },
        plugins: {
          legend: { position: "bottom" },
          subtitle: {
            display: true,
            text: "en nombre de régimes",
            color: "#999",
            font: { size: 11, style: "italic" },
            padding: { bottom: 6 },
          },
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label} : ${fmtInt(ctx.parsed.y)} rég.` } },
        },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
        },
      },
      plugins: [stackedBarLabelsPlugin],
    };
  }, [charts.production_par_regime_secteur, year]);

  // ── Graphique camembert secteurs ──────────────────────────────────────────
  const chartSecteursPie = useMemo(() => {
    const rows = tables.secteurs_detail || [];
    const actifs = rows.filter((r) => r.production_regimes > 0);
    if (!actifs.length) return null;

    const total = actifs.reduce((sum, r) => sum + (Number(r.production_regimes) || 0), 0);

    // Plugin inline : affiche nb regimes + % sur chaque tranche
    const sectorLabelsPlugin = {
      id: "sectorLabels",
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        chart.data.datasets.forEach((dataset, di) => {
          const meta = chart.getDatasetMeta(di);
          if (meta.hidden) return;
          meta.data.forEach((arc, i) => {
            const value = Number(dataset.data[i]) || 0;
            if (!value) return;
            const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0";
            const pos = arc.tooltipPosition();
            ctx.save();
            ctx.shadowColor = "rgba(0,0,0,0.55)";
            ctx.shadowBlur = 4;
            ctx.fillStyle = "#fff";
            ctx.font = "bold 11px Manrope, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(fmtInt(value), pos.x, pos.y - 7);
            ctx.font = "10px Manrope, sans-serif";
            ctx.fillText(`${pct}%`, pos.x, pos.y + 7);
            ctx.restore();
          });
        });
      },
    };

    return {
      title: "Production par secteur",
      type: "doughnut",
      data: {
        labels: actifs.map((r) => r.code),
        datasets: [{ data: actifs.map((r) => r.production_regimes), backgroundColor: PALETTE }],
      },
      options: pieOpts,
      plugins: [sectorLabelsPlugin],
    };
  }, [tables.secteurs_detail]);

  // ── Graphique ventes vs dépenses ──────────────────────────────────────────
  const chartVentesDepenses = useMemo(() => {
    const src = charts.depenses_vs_production;
    if (!src) return null;
    return {
      title: `Ventes vs Dépenses ${year}`,
      type: "bar",
      data: {
        labels: src.labels,
        datasets: [
          { label: "Ventes (FCFA)", data: truncateToCurrentMonth(charts.montant_ventes_annuel?.data || [], year), backgroundColor: `${COLORS.blue}99` },
          { label: "Dépenses (FCFA)", data: truncateToCurrentMonth(src.depenses, year), backgroundColor: `${COLORS.red}99` },
        ],
      },
      options: barOptsFCFA,
    };
  }, [charts]);

  // ── Graphique production pluriannuelle ────────────────────────────────────
  const chartProdCompare = useMemo(() => {
    const src = charts.production_compare;
    if (!src) return null;
    return {
      title: "Production N / N-1 / N-2",
      type: "line",
      data: {
        labels: src.labels,
        datasets: [
          { label: String(src.year), data: truncateToCurrentMonth(src.current, src.year), borderColor: COLORS.green, tension: 0.35, fill: false },
          { label: String(src.year - 1), data: src.previous, borderColor: COLORS.blue, tension: 0.35, fill: false },
          { label: String(src.year - 2), data: src.prev2 || [], borderColor: COLORS.amber, tension: 0.35, fill: false },
        ],
      },
      options: lineOpts,
    };
  }, [charts.production_compare]);

  // ── Graphique production par date ─────────────────────────────────────────
  const chartProdParDate = useMemo(() => {
    const src = charts.production_par_date;
    if (!src?.labels?.length) return null;
    return {
      title: `Production journalière ${year}`,
      type: "bar",
      data: {
        labels: src.labels,
        datasets: [{ label: "Régimes", data: src.data, backgroundColor: `${COLORS.green}99` }],
      },
      options: { ...barOpts, scales: { ...barOpts.scales, x: { grid: { display: false }, ticks: { maxRotation: 60, minRotation: 30 } } } },
    };
  }, [charts.production_par_date, year]);

  // ── Top récolteur ─────────────────────────────────────────────────────────
  const topRecolteur = useMemo(() => {
    const rows = tables.recolteurs_detail || [];
    return rows[0] || null;
  }, [tables.recolteurs_detail]);

  // ── Évolution badge ───────────────────────────────────────────────────────
  const handleDayClick = async (iso) => {
    setFicheJour({ open: true, date: iso, loading: true, data: null });
    try {
      const result = await apiGet(`/recoltes/by_date/?date=${iso}`);
      setFicheJour((prev) => ({ ...prev, loading: false, data: result }));
    } catch {
      setFicheJour((prev) => ({ ...prev, loading: false, data: [] }));
    }
  };

  const evolutionBadge = useMemo(() => {
    const pct = s.evolution_pct;
    if (pct == null) return null;
    const pos = pct >= 0;
    return { label: `${pos ? "+" : ""}${pct}% vs ${year - 1}`, color: pos ? COLORS.green : COLORS.red };
  }, [s.evolution_pct, year]);


  return (
    <div className="page dashboard">

      {/* ── En-tête ─────────────────────────────────────────────────────── */}
      <div className="page-header-row">
        <div>
          <h2 style={{ margin: 0 }}>Tableau de bord</h2>
          <p style={{ margin: 0, color: "#888", fontSize: 13 }}>Palmeraie — Année {year}</p>
        </div>
        <div className="row-actions">
          <label className="inline-field">
            Année
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <button className="btn-primary" onClick={loadSummary} disabled={loading}>
            {loading ? "Chargement…" : "Rafraîchir"}
          </button>
        </div>
      </div>

      {/* ── Bandeau alertes ─────────────────────────────────────────────── */}
      <AlerteBandeau notifications={notifications} />

      {loading ? (
        <LogoLoader label="Chargement du tableau de bord…" />
      ) : (
        <>
          {/* ════════════════════════════════════════════════════════════════
              ONGLET 1 — VUE D'ENSEMBLE
          ════════════════════════════════════════════════════════════════ */}
          {tab === "overview" && (
            <>
              {(() => {
                const reg = s.repartition_par_regime_pct || {};
                const regBase = s.repartition_par_regime || {};
                const mois = new Date().toLocaleString("fr-FR", { month: "long" });
                const G3 = { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 };
                const lbl = { margin: "0 0 6px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".6px", color: "#aaa" };
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                    {/* Production */}
                    <div>
                      <p style={lbl}>Production</p>
                      <div style={G3}>
                        <KpiCard compact title="Total annuel" value={`${fmtInt(s.total_production)} rég.`} color={COLORS.green} sub={evolutionBadge?.label} loading={loading} />
                        <KpiCard compact title="Aujourd'hui" value={`${fmtInt(s.prod_today)} rég.`} color={COLORS.green} loading={loading} />
                        <KpiCard compact title={`Ce mois (${mois})`} value={`${fmtInt(s.prod_month)} rég.`} color={COLORS.green} loading={loading} />
                      </div>
                    </div>

                    {/* Poids & Rendement */}
                    <div>
                      <p style={lbl}>Poids & Rendement</p>
                      <div style={G3}>
                        <KpiCard compact title="Poids total récolté" value={`${fmtDec(s.total_kg)} kg`} color={COLORS.lightGreen} loading={loading} />
                        <KpiCard compact title="Poids moyen / régime" value={s.poids_moyen_regime ? `${fmtDec(s.poids_moyen_regime)} kg` : "—"} color={COLORS.lightGreen} loading={loading} />
                        <KpiCard compact title="Rendement moyen" value={s.rendement_moyen ? `${fmtDec(s.rendement_moyen)} rég/ha` : "—"} color={COLORS.amber} sub={s.rendement_kg_ha ? `${fmtDec(s.rendement_kg_ha)} kg/ha` : undefined} loading={loading} />
                      </div>
                    </div>

                    {/* Finance */}
                    <div>
                      <p style={lbl}>Finance</p>
                      <div style={G3}>
                        <KpiCard compact title="Chiffre d'affaires" value={fmtMoney(s.montant_total_ventes)} color={COLORS.blue} loading={loading} />
                        <KpiCard compact title="Dépenses totales" value={fmtMoney(s.depenses_totales)} color={COLORS.red} loading={loading} />
                        <KpiCard compact title="Bénéfice" value={fmtMoney(s.benefice)} color={s.benefice >= 0 ? COLORS.teal : COLORS.red} sub={s.marge_pct != null ? `Marge : ${s.marge_pct}%` : undefined} loading={loading} />
                      </div>
                    </div>

                    {/* Régimes */}
                    <div>
                      <p style={lbl}>Régimes récoltés</p>
                      <div style={G3}>
                        <KpiCard compact title="Grands" value={`${fmtInt(regBase.grands || 0)} rég.`} color={COLORS.green} sub={`${reg.grands?.pct ?? 0}% du total`} loading={loading} />
                        <KpiCard compact title="Moyens" value={`${fmtInt(regBase.moyens || 0)} rég.`} color={COLORS.blue} sub={`${reg.moyens?.pct ?? 0}% du total`} loading={loading} />
                        <KpiCard compact title="Petits" value={`${fmtInt(regBase.petits || 0)} rég.`} color={COLORS.amber} sub={`${reg.petits?.pct ?? 0}% du total`} loading={loading} />
                      </div>
                    </div>

                  </div>
                );
              })()}

              {/* Graphiques */}
              <section className="charts-grid" style={{ marginTop: 20 }}>
                {chartProdMensuelle && (
                  <ChartCard title={chartProdMensuelle.title} type={chartProdMensuelle.type}
                    data={chartProdMensuelle.data} options={chartProdMensuelle.options}
                    onClick={() => setActiveChart(chartProdMensuelle)} />
                )}
                {chartProdCompare && (
                  <ChartCard title={chartProdCompare.title} type={chartProdCompare.type}
                    data={chartProdCompare.data} options={chartProdCompare.options}
                    onClick={() => setActiveChart(chartProdCompare)} />
                )}
                {chartRegimesPie && (
                  <ChartCard title={chartRegimesPie.title} type={chartRegimesPie.type}
                    data={chartRegimesPie.data} options={chartRegimesPie.options}
                    plugins={chartRegimesPie.plugins}
                    onClick={() => setActiveChart(chartRegimesPie)} />
                )}
              </section>

              {/* Heatmap journalière */}
              {charts.production_par_date?.labels?.length > 0 && (
                <div className="chart-card" style={{ marginTop: 14 }}>
                  <div className="chart-card-head">
                    <h3>Production journalière {year} — Calendrier annuel</h3>
                  </div>
                  <ProductionHeatmap data={charts.production_par_date} year={year} onDayClick={handleDayClick} />
                </div>
              )}
            </>
          )}

          {/* ════════════════════════════════════════════════════════════════
              ONGLET 3 — SECTEURS
          ════════════════════════════════════════════════════════════════ */}
          {tab === "secteurs" && (
            <>
              <section className="stats-grid">
                <KpiCard title="Secteurs actifs" value={`${fmtInt(s.secteurs_actifs)} / ${fmtInt(s.secteurs_count)}`}
                  color={COLORS.teal} loading={loading} />
                {tables.secteurs_detail?.[0] && (
                  <KpiCard title="Secteur le + productif"
                    value={tables.secteurs_detail[0].code}
                    sub={`${fmtInt(tables.secteurs_detail[0].production_regimes)} rég.`}
                    color={COLORS.green} loading={loading} />
                )}
                {tables.secteurs_detail?.length > 1 && (
                  <KpiCard title="Secteur le - productif"
                    value={tables.secteurs_detail[tables.secteurs_detail.length - 1].code}
                    sub={`${fmtInt(tables.secteurs_detail[tables.secteurs_detail.length - 1].production_regimes)} rég.`}
                    color={COLORS.orange} loading={loading} />
                )}
              </section>

              {/* Graphiques secteurs */}
              <section className="charts-grid" style={{ marginTop: 20 }}>
                {chartSecteursPie && (
                  <ChartCard title={chartSecteursPie.title} type={chartSecteursPie.type}
                    data={chartSecteursPie.data} options={chartSecteursPie.options}
                    plugins={chartSecteursPie.plugins}
                    onClick={() => setActiveChart(chartSecteursPie)} />
                )}
                {chartRegimesSecteur && (
                  <ChartCard title={chartRegimesSecteur.title} type={chartRegimesSecteur.type}
                    data={chartRegimesSecteur.data} options={chartRegimesSecteur.options}
                    plugins={chartRegimesSecteur.plugins}
                    onClick={() => setActiveChart(chartRegimesSecteur)} />
                )}
              </section>

              {/* Tableau classement */}
              <section style={{ marginTop: 24 }}>
                <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Classement des secteurs</h3>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#1f4e79", color: "#fff" }}>
                        {["#","Code","Nom","Superficie (ha)","Production (rég.)","Rend. rég/ha","Part (%)","Statut"].map((h) => (
                          <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(tables.secteurs_detail || []).map((row, idx) => (
                        <tr key={row.id}
                          style={{ background: idx === 0 ? "#e8f5e9" : idx % 2 === 0 ? "#fafafa" : "#fff", cursor: "pointer" }}
                          onClick={() => navigate(`/secteurs/${row.id}`)}
                        >
                          <td style={{ padding: "7px 12px", fontWeight: 700 }}>{idx + 1}</td>
                          <td style={{ padding: "7px 12px", fontWeight: 600 }}>{row.code}</td>
                          <td style={{ padding: "7px 12px" }}>{row.nom}</td>
                          <td style={{ padding: "7px 12px" }}>{fmtDec(row.superficie_ha)}</td>
                          <td style={{ padding: "7px 12px", fontWeight: 600 }}>{fmtInt(row.production_regimes)}</td>
                          <td style={{ padding: "7px 12px" }}>{fmtDec(row.rendement_reg_ha)}</td>
                          <td style={{ padding: "7px 12px" }}>{row.part_pct}%</td>
                          <td style={{ padding: "7px 12px" }}>
                            <span style={{ padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600,
                              background: row.statut === "actif" ? "#c8e6c9" : "#ffccbc",
                              color: row.statut === "actif" ? "#1b5e20" : "#bf360c" }}>
                              {row.statut}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {/* ════════════════════════════════════════════════════════════════
              ONGLET 4 — FINANCIER
          ════════════════════════════════════════════════════════════════ */}
          {tab === "financier" && (
            <>
              {/* Ventes */}
              <h3 style={{ margin: "0 0 12px", fontSize: 15, color: COLORS.blue }}>Ventes</h3>
              <section className="stats-grid">
                <KpiCard title="Nombre de ventes" value={fmtInt(s.nb_ventes)} color={COLORS.blue} loading={loading} />
                <KpiCard title="Chiffre d'affaires annuel" value={fmtMoney(s.montant_total_ventes)} color={COLORS.blue} loading={loading} />
                <KpiCard title={`CA du mois (${new Date().toLocaleString("fr-FR", { month: "long" })})`}
                  value={fmtMoney(s.ca_mois)} color={COLORS.lightBlue} loading={loading} />
                <KpiCard title="Prix moyen / kg" value={s.prix_moyen_kg ? `${fmtInt(s.prix_moyen_kg)} FCFA` : "—"}
                  color={COLORS.lightBlue} loading={loading} />
              </section>

              {/* Dépenses */}
              <h3 style={{ margin: "20px 0 12px", fontSize: 15, color: COLORS.red }}>Dépenses</h3>
              <section className="stats-grid">
                <KpiCard title="Nourriture" value={fmtMoney(s.dep_nourriture)} color={COLORS.orange} loading={loading} />
                <KpiCard title="Transport" value={fmtMoney(s.dep_transport)} color={COLORS.orange} loading={loading} />
                <KpiCard title="Salaires récolteurs" value={fmtMoney(s.depenses_salaires_recolteurs)} color={COLORS.orange} loading={loading} />
                <KpiCard title="Dépenses totales" value={fmtMoney(s.depenses_totales)} color={COLORS.red} loading={loading} />
              </section>

              {/* Rentabilité */}
              <h3 style={{ margin: "20px 0 12px", fontSize: 15, color: COLORS.teal }}>Rentabilité</h3>
              <section className="stats-grid">
                <KpiCard title="Bénéfice" value={fmtMoney(s.benefice)}
                  color={s.benefice >= 0 ? COLORS.teal : COLORS.red} loading={loading} />
                <KpiCard title="Marge bénéficiaire" value={s.marge_pct != null ? `${s.marge_pct}%` : "—"}
                  color={s.marge_pct >= 0 ? COLORS.teal : COLORS.red} loading={loading} />
                <KpiCard title="Coût moyen / kg produit" value={s.cout_moyen_kg ? `${fmtInt(s.cout_moyen_kg)} FCFA` : "—"}
                  color={COLORS.brown} loading={loading} />
              </section>

              {/* Graphique ventes vs dépenses */}
              {chartVentesDepenses && (
                <section style={{ marginTop: 24 }}>
                  <ChartCard title={chartVentesDepenses.title} type={chartVentesDepenses.type}
                    data={chartVentesDepenses.data} options={chartVentesDepenses.options}
                    onClick={() => setActiveChart(chartVentesDepenses)} />
                </section>
              )}


            </>
          )}

          {/* ════════════════════════════════════════════════════════════════
              ONGLET 5 — RÉCOLTEURS
          ════════════════════════════════════════════════════════════════ */}
          {tab === "recolteurs" && (
            <>
              <section className="stats-grid">
                <KpiCard title="Total récolteurs" value={fmtInt(s.total_recolteurs)} color={COLORS.brown} loading={loading} />
                <KpiCard title="Récolteurs actifs (ont récolté)" value={fmtInt(s.recolteurs_actifs)} color={COLORS.green} loading={loading} />
                {topRecolteur && (
                  <KpiCard title="Récolteur le + performant"
                    value={topRecolteur.nom}
                    sub={`${fmtInt(topRecolteur.total_regimes)} rég.`}
                    color={COLORS.green} loading={loading} />
                )}
              </section>

              {/* Tableau récolteurs */}
              <section style={{ marginTop: 24 }}>
                <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Classement des récolteurs — {year}</h3>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#1f4e79", color: "#fff" }}>
                        {["#","Téléphone","Nom","Total régimes","Salaire calculé (FCFA)"].map((h) => (
                          <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(tables.recolteurs_detail || []).map((row, idx) => (
                        <tr key={row.id}
                          style={{ background: idx === 0 ? "#e8f5e9" : idx % 2 === 0 ? "#fafafa" : "#fff", cursor: "pointer" }}
                          onClick={() => navigate(`/recolteurs/${row.id}`)}
                        >
                          <td style={{ padding: "7px 12px", fontWeight: 700 }}>{idx + 1}</td>
                          <td style={{ padding: "7px 12px" }}>{row.numero_telephone}</td>
                          <td style={{ padding: "7px 12px", fontWeight: 600 }}>{row.nom}</td>
                          <td style={{ padding: "7px 12px", fontWeight: 600 }}>{fmtInt(row.total_regimes)}</td>
                          <td style={{ padding: "7px 12px" }}>{fmtMoney(row.salaire_calcule)}</td>
                        </tr>
                      ))}
                      {!(tables.recolteurs_detail?.length) && (
                        <tr><td colSpan={6} style={{ padding: 16, textAlign: "center", color: "#aaa" }}>Aucune donnée pour {year}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </>
      )}

      {/* ── Dialog graphique agrandi ─────────────────────────────────────── */}
      {activeChart && (
        <ChartDialog
          open={!!activeChart}
          onClose={() => setActiveChart(null)}
          chart={activeChart}
        />
      )}

      {/* ── Dialog détail récolte journalière ────────────────────────────── */}
      <FicheJourDialog
        open={ficheJour.open}
        date={ficheJour.date}
        fiches={ficheJour.data}
        loading={ficheJour.loading}
        onClose={() => setFicheJour({ open: false, date: null, loading: false, data: null })}
      />
    </div>
  );
}
