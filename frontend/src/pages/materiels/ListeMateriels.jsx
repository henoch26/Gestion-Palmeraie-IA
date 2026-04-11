import { useEffect, useState } from "react";
import DataTable from "../../components/DataTable.jsx";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";
import MaterielDialog from "../../components/MaterielDialog.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import {
  createMateriel,
  deleteMateriel,
  listMateriels,
  updateMateriel,
} from "../../services/materielService.js";

export default function ListeMateriels() {
  const { pushToast } = useToast();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  const columns = [
    { key: "numero", label: "N°" },
    { key: "designation", label: "Designation" },
    { key: "quantite", label: "Quantite" },
    { key: "etat_physique", label: "Etat physique" },
    { key: "statut_utilisation", label: "Statut d'utilisation" },
    {
      key: "actions",
      label: "Actions",
      render: (row) => (
        <div className="row-actions">
          <button onClick={() => { setEditing(row); setOpenForm(true); }}>
            Modifier
          </button>
          <button onClick={() => setToDelete(row)}>Supprimer</button>
        </div>
      ),
    },
  ];

  const load = async () => {
    try {
      setLoading(true);
      const data = await listMateriels();
      setRows(data || []);
    } catch (err) {
      pushToast({ type: "error", title: "Erreur API", message: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleAdd = () => {
    setEditing(null);
    setOpenForm(true);
  };

  const handleSubmit = async (payload) => {
    try {
      if (editing) {
        await updateMateriel(editing.id, payload);
        pushToast({ type: "success", title: "Materiel modifie" });
      } else {
        await createMateriel(payload);
        pushToast({ type: "success", title: "Materiel ajoute" });
      }
      setOpenForm(false);
      load();
    } catch (err) {
      pushToast({ type: "error", title: "Erreur API", message: err.message });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMateriel(toDelete.id);
      pushToast({ type: "info", title: "Materiel supprime" });
      setToDelete(null);
      load();
    } catch (err) {
      pushToast({ type: "error", title: "Erreur API", message: err.message });
    }
  };

  return (
    <div className="page">
      <div className="page-header-row">
        <h2>Liste du materiel et des equipements</h2>
        <button className="btn-primary" onClick={handleAdd}>Ajouter</button>
      </div>

      {loading ? <p>Chargement...</p> : <DataTable columns={columns} rows={rows} pageSize={8} />}

      <MaterielDialog
        open={openForm}
        initial={editing}
        onClose={() => setOpenForm(false)}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={!!toDelete}
        title="Supprimer ce materiel ?"
        message={`Voulez-vous supprimer ${toDelete?.designation || `N° ${toDelete?.numero}`} ?`}
        onCancel={() => setToDelete(null)}
        onConfirm={handleDelete}
        confirmLabel="Supprimer"
      />
    </div>
  );
}

