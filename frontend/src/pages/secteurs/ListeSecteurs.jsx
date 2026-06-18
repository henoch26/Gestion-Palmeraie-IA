import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DataTable from "../../components/DataTable.jsx";
import LogoLoader from "../../components/LogoLoader.jsx";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";
import SecteurDialog from "../../components/SecteurDialog.jsx";
import SuccessDialog from "../../components/SuccessDialog.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { createSecteur, deleteSecteur, listSecteurs, updateSecteur } from "../../services/secteurService.js";
import { getToken } from "../../services/authService.js";

const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";

// CRUD page for secteurs (connecte a l'API)
export default function ListeSecteurs() {
  const { pushToast } = useToast();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState(null);
  const [openForm, setOpenForm] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [success, setSuccess] = useState({ open: false, message: "" });

  const columns = [
    { key: "code", label: "Code" },
    { key: "nom", label: "Nom" },
    { key: "superficie_ha", label: "Superficie (ha)" },
    { key: "production_total", label: "Production" },
    { key: "rendement_ha", label: "Reg/ha" },
    { key: "last_recolte", label: "Derniere recolte" },
    { key: "situation_relief", label: "Situation relief" },
    { key: "type_sol", label: "Type de sol" },
    {
      key: "actions",
      label: "Actions",
      render: (row) => (
        <div className="row-actions">
          <button onClick={() => navigate(`/secteurs/${row.id}`)}>Details</button>
          {isAdmin && <button onClick={() => { setEditing(row); setOpenForm(true); }}>Modifier</button>}
          {isAdmin && <button className="btn-danger" onClick={() => setToDelete(row)}>Supprimer</button>}
        </div>
      ),
    },
  ];

  // Chargement initial
  const load = async () => {
    try {
      setLoading(true);
      const data = await listSecteurs();
      setRows(data);
    } catch (err) {
      pushToast({ type: "error", title: "Secteurs", message: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Open dialog in add mode
  const handleAdd = () => {
    setEditing(null);
    setOpenForm(true);
  };

  const handleExport = async () => {
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/secteurs/export/`, {
        headers: token ? { Authorization: `Token ${token}` } : {},
      });
      if (!res.ok) throw new Error("Export impossible");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `secteurs_export_${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      pushToast({ type: "error", title: "Erreur export", message: err.message });
    }
  };

  // Save (add or edit)
  const handleSubmit = async (form) => {
    try {
      if (editing) {
        await updateSecteur(editing.id, form);
        setSuccess({ open: true, message: "Secteur modifie avec succes" });
      } else {
        await createSecteur(form);
        setSuccess({ open: true, message: "Secteur ajoute avec succes" });
      }
      setOpenForm(false);
      load();
    } catch (err) {
      pushToast({ type: "error", title: "Secteurs", message: err.message });
    }
  };

  // Delete
  const handleDelete = async () => {
    try {
      await deleteSecteur(toDelete.id);
      pushToast({ type: "info", title: "Secteur supprime", message: toDelete.nom });
      setToDelete(null);
      load();
    } catch (err) {
      pushToast({ type: "error", title: "Secteurs", message: err.message });
    }
  };

  return (
    <div className="page">
      <div className="page-header-row">
        <h2>Liste secteurs</h2>
        <div className="row-actions">
          <button className="btn-ghost" onClick={handleExport}>Exporter Excel</button>
          {isAdmin && <button className="btn-primary" onClick={handleAdd}>Ajouter</button>}
        </div>
      </div>

      {loading ? <LogoLoader /> : <DataTable columns={columns} rows={rows} pageSize={5} />}

      <SecteurDialog
        open={openForm}
        initial={editing}
        onClose={() => setOpenForm(false)}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={!!toDelete}
        title="Supprimer ce secteur ?"
        message={`Voulez-vous supprimer ${toDelete?.nom} ?`}
        onCancel={() => setToDelete(null)}
        onConfirm={handleDelete}
        confirmLabel="Supprimer"
      />

      <SuccessDialog
        open={success.open}
        message={success.message}
        onClose={() => setSuccess({ open: false, message: "" })}
      />
    </div>
  );
}
