import ChartDataLabels from "chartjs-plugin-datalabels";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ChartCard from "../../components/ChartCard.jsx";
import ChartDialog from "../../components/ChartDialog.jsx";
import LogoLoader from "../../components/LogoLoader.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { getRecolteurAnalytics } from "../../services/recolteurService.js";
import { getToken } from "../../services/authService.js";

const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";

const fmtInt  = (n) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(n || 0));
const fmtMoney = (n) => `${fmtInt(n)} FCFA`;

const COLORS = {
  green: "#2e7d32", blue: "#1565c0", amber: "#f9a825", red: "#c62828", teal: "#00695c",
};

function KpiCard({ title, value, sub, color = COLORS.green }) {
  return (
    <article className="stat-card" style={{ borderTop: `4px solid ${color}` }}>
      <h3 style={{ color: "#666", fontSize: 11, fontWeight: 700, textTransform: "uppercase", margin: "0 0 6px", letterSpacing: ".5px" }}>
        {title}
      </h3>
      <p style={{ fontSize: 22, fontWeight: 700, margin: 0, color }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: "#999", margin: "4px 0 0" }}>{sub}</p>}
    </article>
  );
}

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", gap: 8, padding: "6px 0", borderBottom: "1px solid #f0f0f0" }}>
      <span style={{ minWidth: 160, color: "#888", fontSize: 13 }}>{label}</span>
      <span style={{ fontWeight: 600, fontSize: 13 }}>{value}</span>
    </div>
  );
}

export default function DetailRecolteur() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { pushToast } = useToast();

  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeChart, setActiveChart] = useState(null);

  const years = useMemo(() => {
    const y = new Date().getFullYear();
    return Array.from({ length: 10 }, (_, i) => y - i);
  }, []);

  const truncateToCurrentMonth = (arr, targetYear) => {
    const now = new Date();
    if (targetYear !== now.getFullYear()) return arr;
    const cur = now.getMonth() + 1;
    return arr.map((v, i) => (i + 1 > cur ? null : v));
  };

  const load = async () => {
    try {
      setLoading(true);
      const d = await getRecolteurAnalytics(id, year);
      setData(d);
    } catch (err) {
      pushToast({ type: "error", title: "Recolteur", message: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id, year]);

  const handleExport = async () => {
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/personnel/${id}/export/?year=${encodeURIComponent(year)}`, {
        headers: token ? { Authorization: `Token ${token}` } : {},
      });
      if (!res.ok) throw new Error("Export impossible");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `recolteur_${data?.recolteur?.code || id}_${year}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      pushToast({ type: "error", title: "Export", message: err.message });
    }
  };

  const monthlyChart = useMemo(() => {
    if (!data) return null;
    return {
      title: `Evolution mensuelle ${data.year} vs ${data.year - 1}`,
      type: "line",
      data: {
        labels: data.monthly.current.labels,
        datasets: [
          { label: String(data.year), data: truncateToCurrentMonth(data.monthly.current.data, data.year), borderColor: COLORS.green, tension: 0.35, fill: false },
          { label: String(data.year - 1), data: data.monthly.previous.data, borderColor: COLORS.amber, borderDash: [4, 4], tension: 0.35, fill: false },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true } } },
    };
  }, [data, year]);

  const yearlyChart = useMemo(() => {
    if (!data) return null;
    return {
      title: "Production sur 5 ans",
      type: "bar",
      data: {
        labels: data.yearly.labels,
        datasets: [{ label: "Total regimes", data: data.yearly.data, backgroundColor: `${COLORS.green}99` }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true } } },
    };
  }, [data]);

  const regimesChart = useMemo(() => {
    if (!data) return null;
    const vals = [data.stats.grands, data.stats.moyens, data.stats.petits];
    const total = vals.reduce((s, v) => s + (v || 0), 0);
    return {
      title: `Repartition par type de regime (${data.year})`,
      type: "doughnut",
      data: {
        labels: ["Grands", "Moyens", "Petits"],
        datasets: [{ data: vals, backgroundColor: [COLORS.green, COLORS.blue, COLORS.amber] }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "right" },
          datalabels: {
            color: "#fff",
            font: { weight: "bold", size: 12 },
            formatter: (value) => {
              if (!value || !total) return null;
              const pct = Math.round((value / total) * 100);
              return `${fmtInt(value)}\n(${pct}%)`;
            },
          },
        },
      },
      plugins: [ChartDataLabels],
    };
  }, [data]);

  const r = data?.recolteur;

  return (
    <div className="page">
      {/* Bouton retour */}
      <button
        onClick={() => navigate(-1)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: "none", border: "none", cursor: "pointer",
          color: "#2e7d32", fontWeight: 600, fontSize: 13, padding: "4px 0",
          marginBottom: 12,
        }}
      >
        ← Retour a la liste
      </button>

      {/* En-tete */}
      <div className="page-header-row">
        <div>
          <h2 style={{ margin: 0 }}>{r?.nom || `Recolteur #${id}`}</h2>
          <p style={{ margin: 0, color: "#888", fontSize: 13 }}>{r?.numero_telephone} — Fiche individuelle</p>
        </div>
        <div className="row-actions">
          <label className="inline-field">
            Annee
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <button className="btn-ghost" onClick={handleExport} disabled={!data}>Exporter Excel</button>
        </div>
      </div>

      {loading ? <LogoLoader label="Chargement..." /> : (
        <>
          {/* Carte identite + KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 20, marginBottom: 24 }}>

            {/* Carte identite */}
            <section className="stat-card" style={{ padding: 20 }}>
              <p style={{ fontWeight: 700, fontSize: 16, margin: "0 0 12px" }}>{r?.nom}</p>
              <InfoRow label="Telephone" value={r?.numero_telephone} />
              <InfoRow label="WhatsApp" value={r?.whatsapp_actif ? "Oui" : null} />
              <InfoRow label="Lieu de residence" value={r?.lieu_residence} />
              <InfoRow label="Date de naissance" value={r?.date_naissance} />
              {r?.est_wave && <InfoRow label="Wave" value="Oui" />}
            </section>

            {/* KPIs de l'annee */}
            <section className="stats-grid" style={{ alignContent: "start" }}>
              <KpiCard
                title={`Total regimes ${year}`}
                value={fmtInt(data?.stats?.total_regimes)}
                color={COLORS.green}
              />
              <KpiCard title="Grands regimes" value={fmtInt(data?.stats?.grands)} color={COLORS.green} />
              <KpiCard title="Moyens regimes" value={fmtInt(data?.stats?.moyens)} color={COLORS.blue} />
              <KpiCard title="Petits regimes" value={fmtInt(data?.stats?.petits)} color={COLORS.amber} />
              <KpiCard
                title={`Salaire total ${year}`}
                value={fmtMoney(data?.stats?.salaire_total)}
                color={COLORS.teal}
              />
              <KpiCard
                title="Classement"
                value={data?.rang ? `#${data.rang}` : "—"}
                sub={data?.nb_recolteurs_actifs ? `sur ${data.nb_recolteurs_actifs} recolteurs actifs` : null}
                color={data?.rang === 1 ? COLORS.amber : COLORS.green}
              />
            </section>
          </div>

          {/* Graphiques */}
          <section className="charts-grid" style={{ marginBottom: 24 }}>
            {monthlyChart && <ChartCard {...monthlyChart} onClick={() => setActiveChart(monthlyChart)} />}
            {yearlyChart && <ChartCard {...yearlyChart} onClick={() => setActiveChart(yearlyChart)} />}
            {regimesChart && <ChartCard {...regimesChart} onClick={() => setActiveChart(regimesChart)} />}
          </section>

          {/* Secteurs travailles */}
          {data?.secteurs?.length > 0 && (
            <section style={{ marginBottom: 24 }}>
              <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Secteurs travailles en {year}</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {data.secteurs.map((s) => (
                  <div key={s.code} style={{
                    background: "#e8f5e9", border: "1px solid #a5d6a7", borderRadius: 8,
                    padding: "8px 16px", minWidth: 140,
                  }}>
                    <p style={{ margin: 0, fontWeight: 700, color: COLORS.green }}>{s.code}</p>
                    <p style={{ margin: "2px 0 0", fontSize: 12, color: "#555" }}>{s.nom}</p>
                    <p style={{ margin: "4px 0 0", fontSize: 13, fontWeight: 600 }}>{fmtInt(s.total_regimes)} reg.</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Historique des fiches */}
          <section>
            <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Historique des fiches — {year}</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#1f4e79", color: "#fff" }}>
                    {["Date", "Statut", "Grands", "Moyens", "Petits", "Total", "Prix (FCFA)", "Salaire (FCFA)"].map((h) => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data?.last_fiches || []).map((f, idx) => (
                    <tr key={f.fiche_id} style={{ background: idx % 2 === 0 ? "#fafafa" : "#fff" }}>
                      <td style={{ padding: "7px 12px" }}>{f.date}</td>
                      <td style={{ padding: "7px 12px" }}>
                        <span className={`statut-badge statut-${f.statut || "brouillon"}`}>{f.statut || "brouillon"}</span>
                      </td>
                      <td style={{ padding: "7px 12px" }}>{fmtInt(f.grands)}</td>
                      <td style={{ padding: "7px 12px" }}>{fmtInt(f.moyens)}</td>
                      <td style={{ padding: "7px 12px" }}>{fmtInt(f.petits)}</td>
                      <td style={{ padding: "7px 12px", fontWeight: 700 }}>{fmtInt(f.total_regimes)}</td>
                      <td style={{ padding: "7px 12px" }}>{fmtMoney(f.prix_fcfa)}</td>
                      <td style={{ padding: "7px 12px", color: COLORS.teal, fontWeight: 600 }}>{fmtMoney(f.salaire_fcfa)}</td>
                    </tr>
                  ))}
                  {!data?.last_fiches?.length && (
                    <tr><td colSpan={8} style={{ padding: 16, textAlign: "center", color: "#aaa" }}>Aucune fiche pour {year}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <ChartDialog open={!!activeChart} chart={activeChart} onClose={() => setActiveChart(null)} />
        </>
      )}
    </div>
  );
}
