import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import ChartCard from "../../components/ChartCard.jsx";
import ChartDialog from "../../components/ChartDialog.jsx";
import LogoLoader from "../../components/LogoLoader.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { getSecteurAnalytics } from "../../services/secteurService.js";
import { getToken } from "../../services/authService.js";

const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";

const C = {
  green:  "#2E7D32",
  blue:   "#1565C0",
  amber:  "#F9A825",
  teal:   "#00695C",
  purple: "#6A1B9A",
  red:    "#C62828",
};

function fmtInt(v) {
  return v == null ? "—" : Number(v).toLocaleString("fr-FR");
}
function fmtDec(v, d = 2) {
  return v == null ? "—" : Number(v).toFixed(d);
}

function makeStackedPlugin(id, nBars) {
  return {
    id,
    afterDatasetsDraw(chart) {
      if (chart.width < 300) return;
      const { ctx } = chart;
      const datasets = chart.data.datasets;

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
          ctx.font = "bold 10px sans-serif";
          ctx.shadowColor = "rgba(0,0,0,0.4)";
          ctx.shadowBlur = 3;
          ctx.fillText(fmtInt(value), x, (y + base) / 2);
          ctx.restore();
        });
      });

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
        ctx.font = "bold 11px sans-serif";
        ctx.fillText(fmtInt(total), x, topY - 4);
        ctx.restore();
      }
    },
  };
}

function KpiCard({ label, value, sub, color = C.green }) {
  return (
    <article className="stat-card" style={{ borderTop: `3px solid ${color}`, padding: "10px 12px" }}>
      <h3 style={{ color: "#888", fontSize: 10, fontWeight: 700, textTransform: "uppercase", margin: "0 0 3px", letterSpacing: ".5px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {label}
      </h3>
      <p style={{ fontSize: 17, fontWeight: 700, margin: 0, color }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: "#999", margin: "2px 0 0" }}>{sub}</p>}
    </article>
  );
}

const GRP_LBL = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", color: "#999", margin: "16px 0 6px" };
const G3 = { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 4 };

export default function DetailSecteur() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const { user, isAdmin } = useAuth();
  const [searchParams] = useSearchParams();

  // Non-admin : filtre auto sur ses propres fiches
  // Admin avec ?created_by=X en URL : filtre sur ce superviseur
  const createdBy = !isAdmin ? (user?.id ?? null) : (searchParams.get("created_by") || null);

  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeChart, setActiveChart] = useState(null);

  const years = useMemo(() => {
    const y = new Date().getFullYear();
    return Array.from({ length: 10 }, (_, i) => y - i);
  }, []);

  const load = async () => {
    try {
      setLoading(true);
      const d = await getSecteurAnalytics(id, year, createdBy);
      setData(d);
    } catch (err) {
      pushToast({ type: "error", title: "Secteur", message: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id, year, createdBy]);

  const handleExport = async () => {
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/secteurs/${id}/export/?year=${encodeURIComponent(year)}`, {
        headers: token ? { Authorization: `Token ${token}` } : {},
      });
      if (!res.ok) throw new Error("Export impossible");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `secteur_${data?.secteur?.code || id}_recoltes_${year}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      pushToast({ type: "error", title: "Erreur export", message: err.message });
    }
  };

  const MOIS = ["Jan","Fev","Mar","Avr","Mai","Juin","Juil","Aout","Sept","Oct","Nov","Dec"];
  const fmtFicheDate = (dateStr) => {
    const [, m, d] = dateStr.split("-");
    return `${d} ${MOIS[parseInt(m, 10) - 1]}`;
  };

  const supNom = data?.filtre_superviseur?.actif ? data.filtre_superviseur.nom_complet : null;

  const monthlyChart = useMemo(() => {
    if (!data) return null;
    const today = new Date();
    const monthCount = data.year === today.getFullYear() ? today.getMonth() + 1 : 12;
    const maskFuture = (arr) => (arr || []).map((v, i) => (i < monthCount ? v : null));

    const monthlyLabelsPlugin = {
      id: "monthlyBarLabels",
      afterDatasetsDraw(chart) {
        if (chart.width < 460) return;
        const { ctx } = chart;
        chart.data.datasets.forEach((dataset, di) => {
          const meta = chart.getDatasetMeta(di);
          if (meta.hidden) return;
          meta.data.forEach((bar, i) => {
            const value = Number(dataset.data[i]) || 0;
            if (!value) return;
            const { x, y } = bar.getProps(["x", "y"], true);
            ctx.save();
            ctx.translate(x, y - 4);
            ctx.rotate(-Math.PI / 2);
            ctx.fillStyle = "#333";
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.font = "bold 9px sans-serif";
            ctx.fillText(fmtInt(value), 0, 0);
            ctx.restore();
          });
        });
      },
    };

    return {
      title: `Production mensuelle — ${data.secteur.code} / ${data.secteur.nom}${supNom ? ` · ${supNom}` : ""} (comparaison 3 ans)`,
      type: "bar",
      data: {
        labels: data.monthly.current.labels,
        datasets: [
          { label: `${data.year}`,     data: maskFuture(data.monthly.current.data), backgroundColor: `${C.green}bb` },
          { label: `${data.year - 1}`, data: data.monthly.previous.data || [],       backgroundColor: `${C.blue}bb`  },
          { label: `${data.year - 2}`, data: data.monthly.prev2?.data   || [],       backgroundColor: `${C.amber}bb` },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 45 } },
        plugins: {
          legend: { position: "bottom" },
          subtitle: {
            display: true,
            text: "en nombre de regimes",
            color: "#999",
            font: { size: 11, style: "italic" },
            padding: { bottom: 6 },
          },
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label} : ${fmtInt(ctx.parsed.y)} reg.` } },
        },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, ticks: { precision: 0 } },
        },
      },
      plugins: [monthlyLabelsPlugin],
    };
  }, [data]);

  const fichesChart = useMemo(() => {
    const fiches = data?.fiches_annee;
    if (!fiches?.length) return null;
    const sec = data.secteur;
    const nBars = fiches.length;

    const fichesStackedPlugin = makeStackedPlugin("fichesStacked", nBars);

    return {
      title: `Fiches de recolte — Secteur ${sec.code} / ${sec.nom}${supNom ? ` · ${supNom}` : ""} (${data.year})`,
      type: "bar",
      data: {
        labels: fiches.map((f) => fmtFicheDate(f.date)),
        datasets: [
          { label: "Grands", data: fiches.map((f) => f.grands || 0), backgroundColor: `${C.green}cc`, stack: "regimes" },
          { label: "Moyens", data: fiches.map((f) => f.moyens || 0), backgroundColor: `${C.blue}cc`,  stack: "regimes" },
          { label: "Petits", data: fiches.map((f) => f.petits || 0), backgroundColor: `${C.amber}cc`, stack: "regimes" },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 24 } },
        plugins: {
          legend: { position: "bottom" },
          subtitle: { display: true, text: "en nombre de regimes", color: "#999", font: { size: 11, style: "italic" }, padding: { bottom: 6 } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label} : ${fmtInt(ctx.parsed.y)} reg.` } },
        },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 45, minRotation: 30 } },
          y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
        },
      },
      plugins: [fichesStackedPlugin],
    };
  }, [data]);

  const yearlyChart = useMemo(() => {
    if (!data) return null;
    const yearly = data.yearly;
    const nYears = yearly.labels.length;

    const yearlyStackedPlugin = {
      id: "yearlyStackedLabels",
      afterDatasetsDraw(chart) {
        if (chart.width < 260) return;
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
            ctx.font = "bold 10px sans-serif";
            ctx.shadowColor = "rgba(0,0,0,0.4)";
            ctx.shadowBlur = 3;
            ctx.fillText(fmtInt(value), x, (y + base) / 2);
            ctx.restore();
          });
        });

        // Total au-dessus de chaque barre
        for (let i = 0; i < nYears; i++) {
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
          ctx.font = "bold 11px sans-serif";
          ctx.fillText(fmtInt(total), x, topY - 4);
          ctx.restore();
        }
      },
    };

    return {
      title: `Production par annee (5 ans) — ${data.secteur.code}${supNom ? ` · ${supNom}` : ""}`,
      type: "bar",
      data: {
        labels: yearly.labels.map(String),
        datasets: [
          { label: "Grands", data: yearly.grands || [], backgroundColor: `${C.green}cc`, stack: "regimes" },
          { label: "Moyens", data: yearly.moyens || [], backgroundColor: `${C.blue}cc`,  stack: "regimes" },
          { label: "Petits", data: yearly.petits || [], backgroundColor: `${C.amber}cc`, stack: "regimes" },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 20 } },
        plugins: {
          legend: { position: "bottom" },
          subtitle: {
            display: true,
            text: "en nombre de regimes",
            color: "#999",
            font: { size: 11, style: "italic" },
            padding: { bottom: 6 },
          },
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label} : ${fmtInt(ctx.parsed.y)} reg.` } },
        },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
        },
      },
      plugins: [yearlyStackedPlugin],
    };
  }, [data]);

  const repartitionChart = useMemo(() => {
    if (!data?.stats?.regime_breakdown) return null;
    const { grands, moyens, petits } = data.stats.regime_breakdown;
    if (!grands && !moyens && !petits) return null;

    const values = [grands, moyens, petits];
    const total  = values.reduce((a, b) => a + b, 0);

    const labelsPlugin = {
      id: "regimeLabels",
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        const meta = chart.getDatasetMeta(0);
        if (!total) return;
        ctx.save();

        // Étiquettes sur chaque part
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        meta.data.forEach((arc, i) => {
          const value = values[i];
          if (!value) return;
          const pct = Math.round((value / total) * 100);
          const pos = arc.tooltipPosition();
          ctx.fillStyle = "#fff";
          ctx.font = "bold 13px sans-serif";
          ctx.fillText(fmtInt(value), pos.x, pos.y - 7);
          ctx.font = "11px sans-serif";
          ctx.fillText(`${pct}%`, pos.x, pos.y + 8);
        });

        // Total au centre du doughnut
        const cx = (chart.chartArea.left + chart.chartArea.right) / 2;
        const cy = (chart.chartArea.top  + chart.chartArea.bottom) / 2;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#888";
        ctx.font = "bold 10px sans-serif";
        ctx.fillText("TOTAL", cx, cy - 12);
        ctx.fillStyle = "#222";
        ctx.font = "bold 18px sans-serif";
        ctx.fillText(fmtInt(total), cx, cy + 4);
        ctx.fillStyle = "#aaa";
        ctx.font = "10px sans-serif";
        ctx.fillText("regimes", cx, cy + 18);

        ctx.restore();
      },
    };

    const sec = data.secteur;
    return {
      title: `Secteur ${sec.code} — ${sec.nom}${supNom ? ` · ${supNom}` : ""} : repartition par type (${data.year})`,
      type: "doughnut",
      data: {
        labels: ["Grands", "Moyens", "Petits"],
        datasets: [{
          data: [grands, moyens, petits],
          backgroundColor: [`${C.green}cc`, `${C.blue}cc`, `${C.amber}cc`],
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: "right" },
          subtitle: {
            display: true,
            text: "en nombre de regimes",
            color: "#999",
            font: { size: 11, style: "italic" },
            padding: { bottom: 6 },
          },
        },
      },
      plugins: [labelsPlugin],
    };
  }, [data]);

  const topRecolteursChart = useMemo(() => {
    const top = data?.top_recolteurs;
    if (!top?.length) return null;
    const sec = data.secteur;
    const nBars = top.length;

    return {
      title: `Top 10 recolteurs — Secteur ${sec.code} / ${sec.nom}${supNom ? ` · ${supNom}` : ""} (${data.year})`,
      type: "bar",
      data: {
        labels: top.map((r) => r.nom),
        datasets: [
          { label: "Grands", data: top.map((r) => r.grands || 0), backgroundColor: `${C.green}cc`, stack: "regimes" },
          { label: "Moyens", data: top.map((r) => r.moyens || 0), backgroundColor: `${C.blue}cc`,  stack: "regimes" },
          { label: "Petits", data: top.map((r) => r.petits || 0), backgroundColor: `${C.amber}cc`, stack: "regimes" },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 24 } },
        plugins: {
          legend: { position: "bottom" },
          subtitle: { display: true, text: "en nombre de regimes", color: "#999", font: { size: 11, style: "italic" }, padding: { bottom: 6 } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label} : ${fmtInt(ctx.parsed.y)} reg.` } },
        },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 30, minRotation: 20 } },
          y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
        },
      },
      plugins: [makeStackedPlugin("topRecolteursStacked", nBars)],
    };
  }, [data]);

  const derniereRecolte = data?.last_recoltes?.[0]?.date;

  return (
    <div className="page">
      <div className="page-header-row">
        <div>
          <h2 style={{ margin: 0 }}>
            Secteur {data?.secteur?.code ? `${data.secteur.code} — ${data.secteur.nom}` : `#${id}`}
          </h2>
          {data?.filtre_superviseur?.actif && (
            <p style={{ margin: "3px 0 0", fontSize: 13, color: "#1565c0", fontWeight: 600 }}>
              Vue filtree : fiches de {data.filtre_superviseur.nom_complet}
            </p>
          )}
          {derniereRecolte && (
            <p style={{ margin: "3px 0 0", fontSize: 13, color: "#888" }}>
              Derniere recolte : {derniereRecolte}
            </p>
          )}
        </div>
        <div className="row-actions">
          <button className="btn-ghost" onClick={() => navigate(-1)}>Retour</button>
          <button className="btn-ghost" onClick={handleExport} disabled={!data}>Exporter Excel</button>
        </div>
      </div>

      <div className="filters-bar">
        <label>
          Annee
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <LogoLoader />
      ) : (
        <>
          <p style={GRP_LBL}>Informations</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 4 }}>
            <KpiCard
              label="Superficie"
              value={`${data.secteur.superficie_ha} ha`}
              sub={data.secteur.rendement_cible_t_ha ? `Cible : ${data.secteur.rendement_cible_t_ha} t/ha` : undefined}
              color={C.teal}
            />
            <KpiCard
              label="Statut"
              value={data.secteur.statut === "actif" ? "Actif" : "Inactif"}
              color={data.secteur.statut === "actif" ? C.green : C.red}
            />
          </div>

          <p style={GRP_LBL}>Production {data.year}</p>
          <div style={G3}>
            <KpiCard label="Total regimes"    value={fmtInt(data.stats.total_regimes)}         color={C.green}  />
            <KpiCard label="Rendement reg/ha" value={fmtDec(data.stats.rendement_ha)}           color={C.blue}   />
            <KpiCard label="Recolteurs actifs" value={fmtInt(data.stats.nb_recolteurs_actifs)}  color={C.purple} />
          </div>

          <p style={GRP_LBL}>Repartition {data.year}</p>
          <div style={G3}>
            <KpiCard label="Grands" value={fmtInt(data.stats.regime_breakdown?.grands ?? 0)} color={C.green} />
            <KpiCard label="Moyens" value={fmtInt(data.stats.regime_breakdown?.moyens ?? 0)} color={C.blue}  />
            <KpiCard label="Petits" value={fmtInt(data.stats.regime_breakdown?.petits ?? 0)} color={C.amber} />
          </div>

          <section className="secteur-charts-row1">
            {monthlyChart && (
              <ChartCard {...monthlyChart} onClick={() => setActiveChart(monthlyChart)} />
            )}
            {yearlyChart && (
              <ChartCard {...yearlyChart} onClick={() => setActiveChart(yearlyChart)} />
            )}
          </section>

          <section className="secteur-charts-row2">
            {fichesChart && (
              <ChartCard {...fichesChart} onClick={() => setActiveChart(fichesChart)} />
            )}
            {repartitionChart && (
              <ChartCard {...repartitionChart} onClick={() => setActiveChart(repartitionChart)} />
            )}
            {topRecolteursChart && (
              <ChartCard {...topRecolteursChart} onClick={() => setActiveChart(topRecolteursChart)} />
            )}
          </section>

          <ChartDialog open={!!activeChart} chart={activeChart} onClose={() => setActiveChart(null)} />
        </>
      )}
    </div>
  );
}
