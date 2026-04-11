import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DataTable from "../../components/DataTable.jsx";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";
import RecolteurDialog from "../../components/RecolteurDialog.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { createRecolteur, deleteRecolteur, getRecolteursStats, listRecolteurs, updateRecolteur } from "../../services/recolteurService.js";
import { getToken } from "../../services/authService.js";

const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";

// CRUD page for recolteurs (connecte a l'API)
export default function ListeRecolteurs() {
  const { pushToast } = useToast();
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [statsYear, setStatsYear] = useState(new Date().getFullYear());
  const [statsRows, setStatsRows] = useState([]);
  const [loadingStats, setLoadingStats] = useState(false);

  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  const columns = [
    { key: "code", label: "Code" },
    { key: "nom", label: "Nom" },
    { key: "lieu_residence", label: "Lieu de residence" },
    {
      key: "actions",
      label: "Actions",
      render: (row) => (
        <div className="row-actions">
          <button onClick={() => navigate(`/recolteurs/${row.id}`)}>Details</button>
          <button onClick={() => { setEditing(row); setOpenForm(true); }}>Modifier</button>
          <button onClick={() => setToDelete(row)}>Supprimer</button>
        </div>
      ),
    },
  ];

  // Chargement initial
  const load = async () => {
    try {
      setLoading(true);
      const recolteursData = await listRecolteurs();
      setRows(recolteursData || []);
    } catch (err) {
      pushToast({ type: "error", title: "Erreur API", message: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const loadStats = async () => {
    try {
      setLoadingStats(true);
      const data = await getRecolteursStats(statsYear);
      setStatsRows(data?.recolteurs || []);
    } catch (err) {
      pushToast({ type: "error", title: "Erreur API", message: err.message });
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, [statsYear]);

  // Open dialog in add mode
  const handleAdd = () => {
    setEditing(null);
    setOpenForm(true);
  };

  const handleExport = async () => {
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/recolteurs/export/?year=${encodeURIComponent(statsYear)}`, {
        headers: token ? { Authorization: `Token ${token}` } : {},
      });
      if (!res.ok) throw new Error("Export impossible");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `recolteurs_export_${statsYear}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      pushToast({ type: "error", title: "Erreur export", message: err.message });
    }
  };

  // Save (add or edit)
  const handleSubmit = async (form) => {
    try {
      const payload = {
        code: form.code,
        nom: form.nom,
        lieu_residence: form.lieu_residence,
      };

      if (editing) {
        await updateRecolteur(editing.id, payload);
        pushToast({ type: "success", title: "Recolteur modifie", message: form.nom });
      } else {
        await createRecolteur(payload);
        pushToast({ type: "success", title: "Recolteur ajoute", message: form.nom });
      }
      setOpenForm(false);
      load();
    } catch (err) {
      pushToast({ type: "error", title: "Erreur API", message: err.message });
    }
  };

  // Delete
  const handleDelete = async () => {
    try {
      await deleteRecolteur(toDelete.id);
      pushToast({ type: "info", title: "Recolteur supprime", message: toDelete.nom });
      setToDelete(null);
      load();
    } catch (err) {
      pushToast({ type: "error", title: "Erreur API", message: err.message });
    }
  };

  return (
    <div className="page">
      <div className="page-header-row">
        <h2>Liste recolteurs</h2>
        <div className="row-actions">
          <button className="btn-ghost" onClick={handleExport}>Exporter Excel</button>
          <button className="btn-primary" onClick={handleAdd}>Ajouter</button>
        </div>
      </div>

      {loading ? <p>Chargement...</p> : <DataTable columns={columns} rows={rows} pageSize={5} />}

      <RecolteurDialog
        open={openForm}
        initial={editing}
        onClose={() => setOpenForm(false)}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={!!toDelete}
        title="Supprimer ce recolteur ?"
        message={`Voulez-vous supprimer ${toDelete?.nom} ?`}
        onCancel={() => setToDelete(null)}
        onConfirm={handleDelete}
        confirmLabel="Supprimer"
      />

      <section className="fiche-section fiche-analytics">
        <div className="page-header-row">
          <h3>Statistiques recolteurs</h3>
          <div className="row-actions">
            <label>
              Annee
              <select value={statsYear} onChange={(e) => setStatsYear(Number(e.target.value))}>
                {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </label>
            <button className="btn-ghost" onClick={loadStats} disabled={loadingStats}>
              {loadingStats ? "Chargement..." : "Rafraichir"}
            </button>
          </div>
        </div>

        {loadingStats ? (
          <p>Chargement...</p>
        ) : (
          <DataTable
            columns={[
              { key: "code", label: "Code" },
              { key: "nom", label: "Nom" },
              { key: "lieu_residence", label: "Lieu" },
              { key: "grands", label: "Grds" },
              { key: "moyens", label: "Moy" },
              { key: "petits", label: "Ptits" },
              { key: "total_regimes", label: "Total" },
              { key: "fiches_count", label: "Fiches" },
              { key: "last_recolte", label: "Derniere recolte" },
            ]}
            rows={statsRows}
            pageSize={8}
          />
        )}
      </section>
    </div>
  );
}
