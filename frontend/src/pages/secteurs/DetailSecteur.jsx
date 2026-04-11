import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ChartCard from "../../components/ChartCard.jsx";
import ChartDialog from "../../components/ChartDialog.jsx";
import DataTable from "../../components/DataTable.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { getSecteurAnalytics } from "../../services/secteurService.js";
import { getToken } from "../../services/authService.js";

const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";

export default function DetailSecteur() {
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

  const load = async () => {
    try {
      setLoading(true);
      const d = await getSecteurAnalytics(id, year);
      setData(d);
    } catch (err) {
      pushToast({ type: "error", title: "Erreur API", message: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id, year]);

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

  const monthlyChart = useMemo(() => {
    if (!data) return null;
    return {
      title: "Evolution mensuelle (annee vs precedente)",
      type: "line",
      data: {
        labels: data.monthly.current.labels,
        datasets: [
          { label: `${data.year}`, data: data.monthly.current.data, borderColor: "#2E7D32" },
          { label: `${data.year - 1}`, data: data.monthly.previous.data, borderColor: "#FBC02D", borderDash: [4, 4] },
        ],
      },
    };
  }, [data]);

  const yearlyChart = useMemo(() => {
    if (!data) return null;
    return {
      title: "Production par annee (5 ans)",
      type: "bar",
      data: {
        labels: data.yearly.labels,
        datasets: [{ label: "Total regimes", data: data.yearly.data, backgroundColor: "#66BB6A" }],
      },
    };
  }, [data]);

  const topRecolteursChart = useMemo(() => {
    if (!data) return null;
    return {
      title: "Top recolteurs (sur ce secteur)",
      type: "bar",
      data: {
        labels: (data.top_recolteurs || []).map((r) => r.nom),
        datasets: [{ label: "Regimes", data: (data.top_recolteurs || []).map((r) => r.total), backgroundColor: "#42A5F5" }],
      },
    };
  }, [data]);

  return (
    <div className="page">
      <div className="page-header-row">
        <h2>
          Secteur {data?.secteur?.code ? `${data.secteur.code} - ${data.secteur.nom}` : `#${id}`}
        </h2>
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
        <p>Chargement...</p>
      ) : (
        <>
          <section className="stats-grid">
            <article className="stat-card">
              <h3>Superficie (ha)</h3>
              <p>{data?.secteur?.superficie_ha ?? "-"}</p>
            </article>
            <article className="stat-card">
              <h3>Total regimes ({data?.year})</h3>
              <p>{data?.stats?.total_regimes ?? 0}</p>
            </article>
            <article className="stat-card">
              <h3>Rendement (reg/ha)</h3>
              <p>{data?.stats?.rendement_ha ?? 0}</p>
            </article>
          </section>

          <section className="charts-grid">
            {monthlyChart && (
              <ChartCard {...monthlyChart} onClick={() => setActiveChart(monthlyChart)} />
            )}
            {yearlyChart && (
              <ChartCard {...yearlyChart} onClick={() => setActiveChart(yearlyChart)} />
            )}
            {topRecolteursChart && (
              <ChartCard {...topRecolteursChart} onClick={() => setActiveChart(topRecolteursChart)} />
            )}
          </section>

          <ChartDialog open={!!activeChart} chart={activeChart} onClose={() => setActiveChart(null)} />

          <section className="tables-grid">
            <article className="table-card">
              <h3>Dernieres recoltes ({data?.year})</h3>
              <DataTable
                columns={[
                  { key: "date", label: "Date" },
                  { key: "total_regimes", label: "Total regimes" },
                ]}
                rows={data?.last_recoltes || []}
                pageSize={8}
              />
            </article>
            <article className="table-card">
              <h3>Top recolteurs ({data?.year})</h3>
              <DataTable
                columns={[
                  { key: "code", label: "Code" },
                  { key: "nom", label: "Nom" },
                  { key: "total", label: "Total regimes" },
                ]}
                rows={data?.top_recolteurs || []}
                pageSize={8}
              />
            </article>
          </section>
        </>
      )}
    </div>
  );
}
