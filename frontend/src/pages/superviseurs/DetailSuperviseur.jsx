import { useEffect, useRef, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Chart, registerables } from "chart.js";
import { getSuperviseurStats, getSuperviseurSecteurs, getSuperviseurRecolteurs } from "../../services/superviseurService.js";
import { useToast } from "../../context/ToastContext.jsx";
import LogoLoader from "../../components/LogoLoader.jsx";

Chart.register(...registerables);

// ── helpers ──────────────────────────────────────────────────────────────────
function fmt(n)  { return Number(n || 0).toLocaleString("fr-FR"); }
function fmtF(n) { return Number(n || 0).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }

const STATUT_STYLE = {
  valide:    { background: "#c8e6c9", color: "#1b5e20" },
  soumis:    { background: "#fff9c4", color: "#f57f17" },
  brouillon: { background: "#f5f5f5", color: "#616161" },
};

const COLORS = { green: "#2e7d32", blue: "#1565c0", amber: "#f9a825", teal: "#00695c" };

// ── plugins ──────────────────────────────────────────────────────────────────
const stackedBarPlugin = {
  id: "stackedBarLabels",
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    chart.data.datasets.forEach((ds, di) => {
      const meta = chart.getDatasetMeta(di);
      if (meta.hidden) return;
      meta.data.forEach((bar, idx) => {
        const v = ds.data[idx];
        if (!v) return;
        ctx.save();
        ctx.fillStyle = "#fff";
        ctx.font = "bold 10px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(v, bar.x, bar.y + bar.height / 2);
        ctx.restore();
      });
    });
    const totals = chart.data.datasets[0].data.map((_, i) =>
      chart.data.datasets.reduce((s, ds) => s + (Number(ds.data[i]) || 0), 0)
    );
    const meta0 = chart.getDatasetMeta(chart.data.datasets.length - 1);
    totals.forEach((total, i) => {
      if (!total) return;
      const bar = meta0.data[i];
      ctx.save();
      ctx.fillStyle = "#1565c0";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(total, bar.x, bar.y - 3);
      ctx.restore();
    });
  },
};

const doughnutPlugin = {
  id: "doughnutLabels",
  afterDatasetsDraw(chart) {
    const { ctx, data } = chart;
    const total = (data.datasets[0]?.data || []).reduce((s, v) => s + (Number(v) || 0), 0);
    const meta = chart.getDatasetMeta(0);
    meta.data.forEach((arc, i) => {
      const v = Number(data.datasets[0].data[i]) || 0;
      if (!v) return;
      const angle = (arc.startAngle + arc.endAngle) / 2;
      const r = (arc.innerRadius + arc.outerRadius) / 2;
      const x = arc.x + Math.cos(angle) * r;
      const y = arc.y + Math.sin(angle) * r;
      const pct = total ? Math.round((v / total) * 100) : 0;
      ctx.save();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${v} (${pct}%)`, x, y);
      ctx.restore();
    });
    const cx = meta.data[0]?.x ?? chart.width / 2;
    const cy = meta.data[0]?.y ?? chart.height / 2;
    ctx.save();
    ctx.fillStyle = "#888";
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("TOTAL", cx, cy - 13);
    ctx.fillStyle = "#222";
    ctx.font = "bold 18px sans-serif";
    ctx.fillText(total, cx, cy + 3);
    ctx.fillStyle = "#aaa";
    ctx.font = "10px sans-serif";
    ctx.fillText("regimes", cx, cy + 18);
    ctx.restore();
  },
};

// ── onglets ───────────────────────────────────────────────────────────────────
const TABS = [
  { key: "global",     label: "Vue globale"    },
  { key: "secteurs",   label: "Ses secteurs"   },
  { key: "recolteurs", label: "Ses recolteurs" },
];

function TabBar({ active, onChange }) {
  return (
    <div style={{ display: "flex", gap: 4, borderBottom: "2px solid #e0e0e0", marginBottom: 24 }}>
      {TABS.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          style={{
            padding: "9px 20px", border: "none", borderRadius: "6px 6px 0 0",
            background: active === t.key ? "#1f4e79" : "transparent",
            color: active === t.key ? "#fff" : "#555",
            fontWeight: active === t.key ? 700 : 400,
            fontSize: 13, cursor: "pointer", borderBottom: active === t.key ? "2px solid #1f4e79" : "none",
            marginBottom: -2,
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── composant principal ───────────────────────────────────────────────────────
export default function DetailSuperviseur() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { pushToast } = useToast();

  const [tab, setTab]     = useState("global");
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(true);

  // Onglet secteurs
  const [secYear, setSecYear]   = useState(new Date().getFullYear());
  const [secData, setSecData]   = useState(null);
  const [secLoading, setSecLoading] = useState(false);

  // Onglet recolteurs
  const [recYear, setRecYear]   = useState(new Date().getFullYear());
  const [recData, setRecData]   = useState(null);
  const [recLoading, setRecLoading] = useState(false);

  const years = useMemo(() => {
    const y = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, i) => y - i);
  }, []);

  const barRef        = useRef(null);
  const doughnutRef   = useRef(null);
  const barChart      = useRef(null);
  const doughnutChart = useRef(null);

  // Chargement initial (vue globale)
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const d = await getSuperviseurStats(id);
        setData(d);
      } catch (err) {
        pushToast({ type: "error", title: "Superviseur", message: err.message });
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // Chargement secteurs quand onglet actif
  useEffect(() => {
    if (tab !== "secteurs") return;
    (async () => {
      try {
        setSecLoading(true);
        const d = await getSuperviseurSecteurs(id, secYear);
        setSecData(d);
      } catch (err) {
        pushToast({ type: "error", title: "Secteurs", message: err.message });
      } finally {
        setSecLoading(false);
      }
    })();
  }, [id, tab, secYear]);

  // Chargement recolteurs quand onglet actif
  useEffect(() => {
    if (tab !== "recolteurs") return;
    (async () => {
      try {
        setRecLoading(true);
        const d = await getSuperviseurRecolteurs(id, recYear);
        setRecData(d);
      } catch (err) {
        pushToast({ type: "error", title: "Recolteurs", message: err.message });
      } finally {
        setRecLoading(false);
      }
    })();
  }, [id, tab, recYear]);

  // Graphique barre mensuel
  useEffect(() => {
    if (!data || !barRef.current) return;
    if (barChart.current) barChart.current.destroy();
    const nom = `${data.superviseur?.nom} ${data.superviseur?.prenom || ""}`.trim();
    barChart.current = new Chart(barRef.current, {
      type: "bar",
      plugins: [stackedBarPlugin],
      data: {
        labels: data.monthly.labels,
        datasets: [
          { label: "Grands", data: data.monthly.grands, backgroundColor: "#2e7d32", stack: "s" },
          { label: "Moyens", data: data.monthly.moyens, backgroundColor: "#66bb6a", stack: "s" },
          { label: "Petits", data: data.monthly.petits, backgroundColor: "#a5d6a7", stack: "s" },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom" },
          title: { display: true, text: `${nom} — Production mensuelle (regimes)`, font: { size: 13 } },
        },
        scales: {
          x: { stacked: true },
          y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
        },
      },
    });
    return () => barChart.current?.destroy();
  }, [data]);

  // Graphique doughnut repartition
  useEffect(() => {
    if (!data || !doughnutRef.current) return;
    if (doughnutChart.current) doughnutChart.current.destroy();
    const nom = `${data.superviseur?.nom} ${data.superviseur?.prenom || ""}`.trim();
    const { grands, moyens, petits } = data.regimes;
    doughnutChart.current = new Chart(doughnutRef.current, {
      type: "doughnut",
      plugins: [doughnutPlugin],
      data: {
        labels: ["Grands", "Moyens", "Petits"],
        datasets: [{ data: [grands, moyens, petits], backgroundColor: ["#2e7d32", "#66bb6a", "#a5d6a7"] }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom" },
          title: { display: true, text: `${nom} — Repartition des regimes`, font: { size: 13 } },
          tooltip: { enabled: false },
        },
      },
    });
    return () => doughnutChart.current?.destroy();
  }, [data]);

  if (loading) return <div className="page"><LogoLoader compact size={80} /></div>;
  if (!data)   return <div className="page"><p style={{ color: "#aaa" }}>Superviseur introuvable.</p></div>;

  const { superviseur, user_info, kpis, regimes, recent_fiches, permissions } = data;
  const nomComplet = `${superviseur.nom} ${superviseur.prenom || ""}`.trim();

  const kpiCards = [
    { label: "Fiches supervisees",  value: kpis.nb_fiches,                      color: "#1565c0" },
    { label: "Regimes total",       value: fmt(kpis.total_regimes),              color: "#2e7d32" },
    { label: "Grands",              value: fmt(regimes.grands),                  color: "#388e3c" },
    { label: "Moyens",              value: fmt(regimes.moyens),                  color: "#66bb6a" },
    { label: "Petits",              value: fmt(regimes.petits),                  color: "#a5d6a7" },
    { label: "Depenses totales",    value: `${fmtF(kpis.total_depenses)} FCFA`,  color: "#e65100" },
  ];

  return (
    <div className="page">

      {/* En-tete */}
      <div className="page-header-row" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button
            onClick={() => navigate(-1)}
            style={{ background: "none", border: "1px solid #ccc", borderRadius: 6,
              padding: "6px 14px", cursor: "pointer", fontSize: 13 }}
          >
            Retour
          </button>
          <div>
            <h2 style={{ margin: 0 }}>{nomComplet}</h2>
            <p className="dashboard-subtitle" style={{ margin: 0 }}>
              {superviseur.code}
              {user_info?.username && ` · ${user_info.username}`}
              {superviseur.telephone && ` · ${superviseur.telephone}`}
              <span style={{
                marginLeft: 10, padding: "2px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700,
                background: superviseur.actif ? "#c8e6c9" : "#ffcdd2",
                color:      superviseur.actif ? "#1b5e20" : "#b71c1c",
              }}>
                {superviseur.actif ? "Actif" : "Inactif"}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Onglets */}
      <TabBar active={tab} onChange={setTab} />

      {/* ════════════ ONGLET VUE GLOBALE ════════════ */}
      {tab === "global" && (
        <>
          <div className="stats-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginBottom: 28 }}>
            {kpiCards.map(({ label, value, color }) => (
              <div key={label} className="stat-card">
                <div className="stat-value" style={{ color }}>{value}</div>
                <div className="stat-label">{label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20, marginBottom: 28 }}>
            <div className="card" style={{ padding: 16, height: 300 }}>
              <canvas ref={barRef} />
            </div>
            <div className="card" style={{ padding: 16, height: 300 }}>
              <canvas ref={doughnutRef} />
            </div>
          </div>

          <div className="card" style={{ padding: 20, marginBottom: 24 }}>
            <h3 style={{ margin: "0 0 14px", fontSize: 15 }}>Permissions accordees</h3>
            {permissions.length === 0 ? (
              <p style={{ color: "#aaa", fontSize: 14 }}>Aucune permission specifique attribuee.</p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {permissions.map((p) => (
                  <span key={p.code} style={{
                    background: "#e8f5e9", color: "#2e7d32", border: "1px solid #a5d6a7",
                    borderRadius: 20, padding: "4px 14px", fontSize: 13, fontWeight: 600,
                  }}>
                    {p.label}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="card" style={{ padding: 20 }}>
            <h3 style={{ margin: "0 0 14px", fontSize: 15 }}>Fiches supervisees recentes</h3>
            {recent_fiches.length === 0 ? (
              <p style={{ color: "#aaa", fontSize: 14 }}>Aucune fiche enregistree.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f5f5f5" }}>
                    {["Date", "Statut", "Recolteurs", "Total regimes", "Depenses (FCFA)"].map((h) => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#555" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recent_fiches.map((f, i) => {
                    const s = STATUT_STYLE[f.statut] || STATUT_STYLE.brouillon;
                    return (
                      <tr key={f.id} style={{ borderTop: "1px solid #eee", background: i % 2 ? "#fafafa" : "#fff" }}>
                        <td style={{ padding: "8px 12px" }}>{f.date}</td>
                        <td style={{ padding: "8px 12px" }}>
                          <span style={{ ...s, padding: "2px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700 }}>
                            {f.statut}
                          </span>
                        </td>
                        <td style={{ padding: "8px 12px" }}>{f.nb_recolteurs}</td>
                        <td style={{ padding: "8px 12px", fontWeight: 600 }}>{fmt(f.total_regimes)}</td>
                        <td style={{ padding: "8px 12px" }}>{fmtF(f.depense_total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ════════════ ONGLET SES SECTEURS ════════════ */}
      {tab === "secteurs" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <label style={{ fontSize: 13, fontWeight: 600 }}>
              Annee
              <select
                value={secYear}
                onChange={(e) => setSecYear(Number(e.target.value))}
                style={{ marginLeft: 8, padding: "4px 8px", fontSize: 13, borderRadius: 4, border: "1px solid #ccc" }}
              >
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
          </div>

          {secLoading ? <LogoLoader compact size={60} /> : !secData?.secteurs?.length ? (
            <div className="card" style={{ padding: 32, textAlign: "center", color: "#aaa" }}>
              Aucun secteur pour {secYear}
            </div>
          ) : (
            <>
              {/* KPIs */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
                <div className="stat-card">
                  <div className="stat-value" style={{ color: COLORS.blue }}>{secData.secteurs.length}</div>
                  <div className="stat-label">Secteurs actifs</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value" style={{ color: COLORS.green }}>
                    {fmt(secData.secteurs.reduce((s, r) => s + r.total_regimes, 0))}
                  </div>
                  <div className="stat-label">Total regimes</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value" style={{ color: COLORS.teal }}>{secYear}</div>
                  <div className="stat-label">Annee</div>
                </div>
              </div>

              {/* Tableau */}
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#1f4e79", color: "#fff" }}>
                      {["#", "Secteur", "Superficie (ha)", "Grands", "Moyens", "Petits", "Total regimes", ""].map((h) => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {secData.secteurs.map((s, idx) => (
                      <tr key={s.id} style={{ borderTop: "1px solid #eee", background: idx % 2 ? "#fafafa" : "#fff" }}>
                        <td style={{ padding: "8px 14px", color: "#aaa" }}>{idx + 1}</td>
                        <td style={{ padding: "8px 14px" }}>
                          <span style={{ fontWeight: 700 }}>{s.code}</span>
                          <span style={{ marginLeft: 8, color: "#888", fontSize: 12 }}>{s.nom}</span>
                        </td>
                        <td style={{ padding: "8px 14px", color: "#666" }}>{s.superficie_ha} ha</td>
                        <td style={{ padding: "8px 14px", color: COLORS.green }}>{fmt(s.grands)}</td>
                        <td style={{ padding: "8px 14px", color: COLORS.blue }}>{fmt(s.moyens)}</td>
                        <td style={{ padding: "8px 14px", color: COLORS.amber }}>{fmt(s.petits)}</td>
                        <td style={{ padding: "8px 14px", fontWeight: 700 }}>{fmt(s.total_regimes)}</td>
                        <td style={{ padding: "8px 14px" }}>
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => navigate(`/secteurs/${s.id}?created_by=${secData.superviseur_user_id}`)}
                          >
                            Detail
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* ════════════ ONGLET SES RECOLTEURS ════════════ */}
      {tab === "recolteurs" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <label style={{ fontSize: 13, fontWeight: 600 }}>
              Annee
              <select
                value={recYear}
                onChange={(e) => setRecYear(Number(e.target.value))}
                style={{ marginLeft: 8, padding: "4px 8px", fontSize: 13, borderRadius: 4, border: "1px solid #ccc" }}
              >
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
          </div>

          {recLoading ? <LogoLoader compact size={60} /> : !recData?.recolteurs?.length ? (
            <div className="card" style={{ padding: 32, textAlign: "center", color: "#aaa" }}>
              Aucun recolteur pour {recYear}
            </div>
          ) : (
            <>
              {/* KPIs */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
                <div className="stat-card">
                  <div className="stat-value" style={{ color: COLORS.blue }}>{recData.recolteurs.length}</div>
                  <div className="stat-label">Recolteurs</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value" style={{ color: COLORS.green }}>
                    {fmt(recData.recolteurs.reduce((s, r) => s + r.total_regimes, 0))}
                  </div>
                  <div className="stat-label">Total regimes</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value" style={{ color: COLORS.teal }}>
                    {fmtF(recData.recolteurs.reduce((s, r) => s + r.salaire_total, 0))} FCFA
                  </div>
                  <div className="stat-label">Total salaires</div>
                </div>
              </div>

              {/* Tableau */}
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#1f4e79", color: "#fff" }}>
                      {["#", "Recolteur", "Telephone", "Grands", "Moyens", "Petits", "Total", "Salaire (FCFA)", ""].map((h) => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recData.recolteurs.map((r, idx) => (
                      <tr key={r.id} style={{ borderTop: "1px solid #eee", background: idx % 2 ? "#fafafa" : "#fff" }}>
                        <td style={{ padding: "8px 14px", color: "#aaa" }}>{idx + 1}</td>
                        <td style={{ padding: "8px 14px", fontWeight: 600 }}>{r.nom}</td>
                        <td style={{ padding: "8px 14px", color: "#666" }}>{r.numero_telephone}</td>
                        <td style={{ padding: "8px 14px", color: COLORS.green }}>{fmt(r.grands)}</td>
                        <td style={{ padding: "8px 14px", color: COLORS.blue }}>{fmt(r.moyens)}</td>
                        <td style={{ padding: "8px 14px", color: COLORS.amber }}>{fmt(r.petits)}</td>
                        <td style={{ padding: "8px 14px", fontWeight: 700 }}>{fmt(r.total_regimes)}</td>
                        <td style={{ padding: "8px 14px", color: COLORS.teal, fontWeight: 600 }}>{fmtF(r.salaire_total)}</td>
                        <td style={{ padding: "8px 14px" }}>
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => navigate(`/recolteurs/${r.id}?created_by=${recData.superviseur_user_id}`)}
                          >
                            Detail
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

    </div>
  );
}
