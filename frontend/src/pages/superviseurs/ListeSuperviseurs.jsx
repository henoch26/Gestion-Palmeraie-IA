import { useEffect, useState, useMemo } from "react";
import { useAuth } from "../../context/AuthContext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import {
  listSuperviseurs,
  createSuperviseur,
  updateSuperviseur,
  deleteSuperviseur,
} from "../../services/superviseurService.js";
import SuperviseurDialog from "../../components/SuperviseurDialog.jsx";
import DataTable from "../../components/DataTable.jsx";
import LogoLoader from "../../components/LogoLoader.jsx";

export default function ListeSuperviseurs() {
  const { hasPermission } = useAuth();
  const { pushToast } = useToast();

  const [superviseurs, setSuperviseurs] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState("");

  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing]   = useState(null);
  const [toDelete, setToDelete] = useState(null);

  const canWrite = hasPermission("gerer_agents");

  const load = async () => {
    try {
      setLoading(true);
      const data = await listSuperviseurs();
      setSuperviseurs(data || []);
    } catch (err) {
      pushToast({ type: "error", title: "Superviseurs", message: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return superviseurs;
    return superviseurs.filter((s) =>
      (s.nom_complet || "").toLowerCase().includes(q) ||
      (s.matricule   || "").toLowerCase().includes(q) ||
      (s.telephone   || "").toLowerCase().includes(q) ||
      (s.code        || "").toLowerCase().includes(q)
    );
  }, [superviseurs, search]);

  const handleAdd  = () => { setEditing(null); setOpenForm(true); };
  const handleEdit = (row) => { setEditing(row); setOpenForm(true); };

  const handleSubmit = async (payload) => {
    try {
      if (editing) {
        await updateSuperviseur(editing.id, payload);
        pushToast({ type: "success", title: "Superviseurs", message: "Superviseur mis a jour" });
      } else {
        await createSuperviseur(payload);
        pushToast({ type: "success", title: "Superviseurs", message: "Superviseur ajoute" });
      }
      setOpenForm(false);
      load();
    } catch (err) {
      pushToast({ type: "error", title: "Superviseurs", message: err.message });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!toDelete) return;
    try {
      await deleteSuperviseur(toDelete.id);
      pushToast({ type: "success", title: "Superviseurs", message: "Superviseur supprime" });
      setToDelete(null);
      load();
    } catch (err) {
      pushToast({ type: "error", title: "Superviseurs", message: err.message });
      setToDelete(null);
    }
  };

  const columns = [
    { key: "code", label: "Code" },
    {
      key: "nom_complet",
      label: "Nom complet",
      render: (row) => (
        <span style={{ fontWeight: 600 }}>
          {row.nom_complet || `${row.nom} ${row.prenom || ""}`.trim()}
        </span>
      ),
    },
    { key: "matricule", label: "Matricule", render: (row) => row.matricule || "—" },
    { key: "telephone", label: "Telephone",  render: (row) => row.telephone || "—" },
    {
      key: "actif",
      label: "Statut",
      render: (row) => (
        <span style={{
          padding: "2px 10px", borderRadius: 12, fontSize: 12, fontWeight: 700,
          background: row.actif ? "#c8e6c9" : "#ffcdd2",
          color:      row.actif ? "#1b5e20" : "#b71c1c",
        }}>
          {row.actif ? "Actif" : "Inactif"}
        </span>
      ),
    },
    ...(canWrite ? [{
      key: "actions",
      label: "Actions",
      render: (row) => (
        <div className="row-actions">
          <button onClick={() => handleEdit(row)}>Modifier</button>
          <button onClick={() => setToDelete(row)}>Supprimer</button>
        </div>
      ),
    }] : []),
  ];

  return (
    <div className="page">
      <div className="page-header-row">
        <div>
          <h2>Superviseurs generaux</h2>
          <p className="dashboard-subtitle">Gestion des superviseurs generaux de la palmeraie</p>
        </div>
        {canWrite && (
          <button className="btn-primary" onClick={handleAdd}>
            + Ajouter un superviseur
          </button>
        )}
      </div>

      <div style={{ marginBottom: 16 }}>
        <input
          className="fiche-input"
          style={{ maxWidth: 340 }}
          placeholder="Rechercher par nom, matricule, telephone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <LogoLoader compact size={70} />
      ) : superviseurs.length === 0 ? (
        <div style={{ textAlign: "center", color: "#aaa", padding: 48 }}>
          <p style={{ fontSize: 15 }}>Aucun superviseur general enregistre.</p>
          {canWrite && (
            <button className="btn-primary" onClick={handleAdd} style={{ marginTop: 12 }}>
              Ajouter le premier superviseur
            </button>
          )}
        </div>
      ) : (
        <>
          {filtered.length === 0 ? (
            <p style={{ color: "#aaa" }}>Aucun superviseur ne correspond a la recherche.</p>
          ) : (
            <DataTable columns={columns} rows={filtered} pageSize={10} />
          )}
        </>
      )}

      {superviseurs.length > 0 && (
        <div style={{ display: "flex", gap: 16, marginTop: 20, flexWrap: "wrap" }}>
          {[
            { label: "Total superviseurs", value: superviseurs.length },
            { label: "Actifs",             value: superviseurs.filter((s) => s.actif).length },
            { label: "Inactifs",           value: superviseurs.filter((s) => !s.actif).length },
          ].map(({ label, value }) => (
            <div key={label} style={{
              background: "#f9fbe7", border: "1px solid #dce775",
              borderRadius: 8, padding: "10px 20px", textAlign: "center", minWidth: 120,
            }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#558b2f" }}>{value}</div>
              <div style={{ fontSize: 12, color: "#666" }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      <SuperviseurDialog
        open={openForm}
        onClose={() => setOpenForm(false)}
        onSubmit={handleSubmit}
        initial={editing}
      />

      {toDelete && (
        <div className="dialog-backdrop" onClick={() => setToDelete(null)}>
          <div className="dialog dialog-sm" onClick={(e) => e.stopPropagation()}>
            <h3>Confirmer la suppression</h3>
            <p style={{ fontSize: 14, color: "#555", margin: "12px 0 20px" }}>
              Supprimer <strong>{toDelete.nom_complet || toDelete.nom}</strong> ?
              Cette action est irreversible.
            </p>
            <div className="dialog-actions">
              <button className="btn-ghost" onClick={() => setToDelete(null)}>Annuler</button>
              <button
                style={{ background: "#c62828", color: "#fff", border: "none",
                  borderRadius: 6, padding: "8px 18px", fontWeight: 600, cursor: "pointer" }}
                onClick={handleDeleteConfirm}
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
