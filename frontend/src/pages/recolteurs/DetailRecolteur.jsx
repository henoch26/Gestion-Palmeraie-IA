import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ChartCard from "../../components/ChartCard.jsx";
import ChartDialog from "../../components/ChartDialog.jsx";
import DataTable from "../../components/DataTable.jsx";
import LogoLoader from "../../components/LogoLoader.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { getRecolteurAnalytics } from "../../services/recolteurService.js";
import { getToken } from "../../services/authService.js";

const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";

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

  useEffect(() => {
    load();
  }, [id, year]);

  const handleExport = async () => {
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/recolteurs/${id}/export/?year=${encodeURIComponent(year)}`, {
        headers: token ? { Authorization: `Token ${token}` } : {},
      });
      if (!res.ok) throw new Error("Export impossible");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `recolteur_${data?.recolteur?.code || id}_recoltes_${year}.csv`;
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

  const regimesChart = useMemo(() => {
    if (!data) return null;
    return {
      title: `Repartition regimes (${data.year})`,
      type: "bar",
      data: {
        labels: ["Grands", "Moyens", "Petits"],
        datasets: [
          {
            label: "Regimes",
            data: [data.stats.grands, data.stats.moyens, data.stats.petits],
            backgroundColor: ["#2E7D32", "#FBC02D", "#42A5F5"],
          },
        ],
      },
    };
  }, [data]);

  return (
    <div className="page">
      <div className="page-header-row">
        <h2>
          Recolteur {data?.recolteur?.code ? `${data.recolteur.code} - ${data.recolteur.nom}` : `#${id}`}
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
        <LogoLoader />
      ) : (
        <>
          <section className="stats-grid">
            <article className="stat-card">
              <h3>Grds</h3>
              <p>{data?.stats?.grands ?? 0}</p>
            </article>
            <article className="stat-card">
              <h3>Moy</h3>
              <p>{data?.stats?.moyens ?? 0}</p>
            </article>
            <article className="stat-card">
              <h3>Ptits</h3>
              <p>{data?.stats?.petits ?? 0}</p>
            </article>
            <article className="stat-card">
              <h3>Total regimes ({data?.year})</h3>
              <p>{data?.stats?.total_regimes ?? 0}</p>
            </article>
          </section>

          <section className="charts-grid">
            {monthlyChart && (
              <ChartCard {...monthlyChart} onClick={() => setActiveChart(monthlyChart)} />
            )}
            {yearlyChart && (
              <ChartCard {...yearlyChart} onClick={() => setActiveChart(yearlyChart)} />
            )}
            {regimesChart && (
              <ChartCard {...regimesChart} onClick={() => setActiveChart(regimesChart)} />
            )}
          </section>

          <ChartDialog open={!!activeChart} chart={activeChart} onClose={() => setActiveChart(null)} />

          <section className="tables-grid">
            <article className="table-card">
              <h3>Dernieres fiches ({data?.year})</h3>
              <DataTable
                columns={[
                  { key: "date", label: "Date" },
                  { key: "grands", label: "Grds" },
                  { key: "moyens", label: "Moy" },
                  { key: "petits", label: "Ptits" },
                  { key: "total_regimes", label: "Total" },
                  { key: "prix_fcfa", label: "Prix (FCFA)" },
                ]}
                rows={data?.last_fiches || []}
                pageSize={8}
              />
            </article>
          </section>
        </>
      )}
    </div>
  );
}
