import { useMemo, useState } from "react";
import DataTable from "../../components/DataTable.jsx";
import LogoLoader from "../../components/LogoLoader.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { getToken } from "../../services/authService.js";

const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";

const TYPES = [
  {
    key: "secteurs",
    label: "Secteurs",
    templatePath: "/secteurs/template/",
    importPath: "/secteurs/import/",
  },
  {
    key: "recolteurs",
    label: "Recolteurs",
    templatePath: "/recolteurs/template/",
    importPath: "/recolteurs/import/",
  },
  {
    key: "recoltes",
    label: "Recoltes",
    templatePath: "/recoltes/template/",
    importPath: "/recoltes/import/",
  },
  {
    key: "materiels",
    label: "Materiels",
    templatePath: "/materiels/template/",
    importPath: "/materiels/import/",
  },
  {
    key: "travaux",
    label: "Travaux",
    templatePath: "/travaux/template/",
    importPath: "/travaux/import/",
  },
  {
    key: "facteurs-production",
    label: "Facteurs IA",
    templatePath: "/ia/facteurs-production/template/",
    importPath: "/ia/facteurs-production/import/",
  },
];

export default function ImportPage() {
  const { pushToast } = useToast();

  const [type, setType] = useState(TYPES[0].key);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const current = useMemo(() => TYPES.find((t) => t.key === type) || TYPES[0], [type]);

  const downloadTemplate = async () => {
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}${current.templatePath}`, {
        headers: token ? { Authorization: `Token ${token}` } : {},
      });
      if (!res.ok) throw new Error("Impossible de telecharger le modele");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${current.key}_template.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      pushToast({ type: "error", title: "Import", message: err.message });
    }
  };

  const upload = async () => {
    if (!file) {
      pushToast({ type: "warning", title: "Import", message: "Selectionne un fichier CSV" });
      return;
    }

    try {
      setLoading(true);
      setResult(null);
      const token = getToken();
      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch(`${API_BASE}${current.importPath}`, {
        method: "POST",
        headers: token ? { Authorization: `Token ${token}` } : {},
        body: fd,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.detail || (Array.isArray(data?.errors) ? data.errors[0]?.error : "") || "Import echoue";
        throw new Error(msg);
      }

      setResult(data);
      pushToast({ type: "success", title: "Import", message: "Import termine" });
    } catch (err) {
      pushToast({ type: "error", title: "Import", message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const errors = result?.errors || [];

  return (
    <div className="page">
      <div className="page-header-row">
        <div>
          <h2>Import CSV</h2>
          <p className="dashboard-subtitle">Numerisation / import des donnees historiques</p>
        </div>
        <div className="row-actions">
          <button className="btn-ghost" onClick={downloadTemplate}>
            Telecharger modele
          </button>
        </div>
      </div>

      <section className="filters-bar">
        <label>
          Type
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setFile(null);
              setResult(null);
            }}
          >
            {TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Fichier CSV
          <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </label>

        <div className="row-actions">
          <button className="btn-primary" onClick={upload} disabled={loading}>
            {loading ? "Import..." : "Importer"}
          </button>
        </div>
      </section>

      {loading && <LogoLoader label="Import en cours..." />}

      {result && (
        <section className="stats-grid">
          {"created" in result && (
            <article className="stat-card">
              <h3>Crees</h3>
              <p>{result.created}</p>
            </article>
          )}
          {"updated" in result && (
            <article className="stat-card">
              <h3>Mis a jour</h3>
              <p>{result.updated}</p>
            </article>
          )}
          {"created_fiches" in result && (
            <article className="stat-card">
              <h3>Fiches creees</h3>
              <p>{result.created_fiches}</p>
            </article>
          )}
          {errors.length > 0 && (
            <article className="stat-card">
              <h3>Erreurs</h3>
              <p>{errors.length}</p>
            </article>
          )}
        </section>
      )}

      {errors.length > 0 && (
        <section className="tables-grid tables-grid-full">
          <article className="table-card">
            <h3>Erreurs import</h3>
            <DataTable
              columns={[
                { key: "line", label: "Ligne" },
                { key: "error", label: "Erreur" },
              ]}
              rows={errors}
              pageSize={8}
              minWidth={0}
            />
          </article>
        </section>
      )}
    </div>
  );
}
