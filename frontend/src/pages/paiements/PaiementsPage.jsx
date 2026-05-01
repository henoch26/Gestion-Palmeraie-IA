import { useEffect, useMemo, useState } from "react";
import DataTable from "../../components/DataTable.jsx";
import LogoLoader from "../../components/LogoLoader.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { getPaiementsSummary, listPaiements, syncPaiements, updatePaiementStatut } from "../../services/paiementService.js";
import { getToken } from "../../services/authService.js";

const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";

const formatInt = (n) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(n || 0));

const statutLabel = (s) => {
  if (s === "paye") return "Paye";
  if (s === "annule") return "Annule";
  return "En attente";
};

const statutClass = (s) => {
  if (s === "paye") return "badge-paye";
  if (s === "annule") return "badge-annule";
  return "badge-en-attente";
};

export default function PaiementsPage() {
  const { pushToast } = useToast();

  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState("");
  const [statut, setStatut] = useState("");
  const [showObsolete, setShowObsolete] = useState(false);

  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const years = useMemo(() => {
    const y = new Date().getFullYear();
    return Array.from({ length: 10 }, (_, i) => y - i);
  }, []);

  const months = useMemo(
    () => [
      { value: "", label: "Tous" },
      ...Array.from({ length: 12 }, (_, i) => ({
        value: String(i + 1),
        label: String(i + 1).padStart(2, "0"),
      })),
    ],
    []
  );

  const load = async () => {
    try {
      setLoading(true);
      const [s, p] = await Promise.all([
        getPaiementsSummary({ year, month: month || undefined }),
        listPaiements({
          year,
          month: month || undefined,
          statut: statut || undefined,
          obsolete: showObsolete ? undefined : false,
        }),
      ]);
      setSummary(s);
      setRows(p || []);
    } catch (err) {
      pushToast({ type: "error", title: "Paiements", message: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, statut, showObsolete]);

  const handleSync = async () => {
    try {
      setSyncing(true);
      await syncPaiements({ year });
      pushToast({ type: "success", title: "Paiements", message: "Synchronisation terminee" });
      load();
    } catch (err) {
      pushToast({ type: "error", title: "Paiements", message: err.message });
    } finally {
      setSyncing(false);
    }
  };

  const handleExport = async () => {
    try {
      const token = getToken();
      const params = new URLSearchParams();
      params.set("year", String(year));
      if (month) params.set("month", String(month));

      const res = await fetch(`${API_BASE}/paiements/export/?${params.toString()}`, {
        headers: token ? { Authorization: `Token ${token}` } : {},
      });
      if (!res.ok) throw new Error("Export impossible");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `paiements_${year}${month ? `_${String(month).padStart(2, "0")}` : ""}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      pushToast({ type: "error", title: "Paiements", message: err.message });
    }
  };

  const handleSetStatut = async (row, next) => {
    try {
      await updatePaiementStatut(row.id, next);
      pushToast({ type: "success", title: "Paiement", message: `Statut: ${statutLabel(next)}` });
      load();
    } catch (err) {
      pushToast({ type: "error", title: "Paiement", message: err.message });
    }
  };

  const totals = useMemo(() => {
    const amount = (rows || []).reduce((s, r) => s + (Number(r.montant_fcfa) || 0), 0);
    const regimes = (rows || []).reduce((s, r) => s + (Number(r.total_regimes) || 0), 0);
    return { amount, regimes };
  }, [rows]);

  const columns = [
    { key: "fiche_date", label: "Date" },
    {
      key: "recolteur_display",
      label: "Recolteur",
      render: (r) => r.recolteur_display || r.recolteur_nom || "Sans nom",
    },
    { key: "total_regimes", label: "Total regimes" },
    {
      key: "montant_fcfa",
      label: "Montant (FCFA)",
      render: (r) => formatInt(r.montant_fcfa),
    },
    {
      key: "statut",
      label: "Statut",
      render: (r) => (
        <span className={`status-badge ${statutClass(r.statut)}`}>
          {statutLabel(r.statut)}
          {r.is_obsolete ? " (obsolete)" : ""}
        </span>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      render: (r) => (
        <div className="row-actions">
          <button onClick={() => handleSetStatut(r, "paye")}>Marquer paye</button>
          <button onClick={() => handleSetStatut(r, "en_attente")}>Remettre</button>
          <button onClick={() => handleSetStatut(r, "annule")}>Annuler</button>
        </div>
      ),
    },
  ];

  return (
    <div className="page">
      <div className="page-header-row">
        <div>
          <h2>Paiements</h2>
          <p className="dashboard-subtitle">Calcul automatique via baremes (grands/moyens/petits)</p>
        </div>

        <div className="row-actions">
          <button className="btn-ghost" onClick={handleExport} disabled={loading}>
            Exporter CSV
          </button>
          <button className="btn-primary" onClick={handleSync} disabled={syncing}>
            {syncing ? "Sync..." : "Synchroniser"}
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

        <label>
          Mois
          <select value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Statut
          <select value={statut} onChange={(e) => setStatut(e.target.value)}>
            <option value="">Tous</option>
            <option value="en_attente">En attente</option>
            <option value="paye">Paye</option>
            <option value="annule">Annule</option>
          </select>
        </label>

        <label className="checkbox-inline">
          <input
            type="checkbox"
            checked={showObsolete}
            onChange={(e) => setShowObsolete(e.target.checked)}
          />
          Afficher obsolete
        </label>
      </section>

      <section className="stats-grid">
        <article className="stat-card">
          <h3>Total montants</h3>
          <p>{loading ? "..." : `${formatInt(totals.amount)} FCFA`}</p>
        </article>
        <article className="stat-card">
          <h3>Total regimes</h3>
          <p>{loading ? "..." : formatInt(totals.regimes)}</p>
        </article>
        <article className="stat-card">
          <h3>Beneficiaires</h3>
          <p>{loading ? "..." : formatInt((summary?.rows || []).length)}</p>
        </article>
      </section>

      {loading ? (
        <LogoLoader label="Chargement des paiements..." />
      ) : (
        <DataTable columns={columns} rows={rows} pageSize={8} minWidth={0} />
      )}
    </div>
  );
}

