import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { listAgents, createAgent, updateAgent, deleteAgent } from "../../services/agentService.js";
import { listSecteurs } from "../../services/secteurService.js";
import AgentDialog from "../../components/AgentDialog.jsx";
import DataTable from "../../components/DataTable.jsx";
import LogoLoader from "../../components/LogoLoader.jsx";

export default function ListeAgents() {
  const { hasPermission } = useAuth();
  const { pushToast } = useToast();

  const [agents, setAgents] = useState([]);
  const [secteurs, setSecteurs] = useState([]);
  const [loading, setLoading] = useState(true);

  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  const canWrite = hasPermission("gerer_agents");

  const load = async () => {
    try {
      setLoading(true);
      const [data, secs] = await Promise.all([listAgents(), listSecteurs()]);
      setAgents(data || []);
      setSecteurs(secs || []);
    } catch (err) {
      pushToast({ type: "error", title: "Agents terrain", message: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = () => { setEditing(null); setOpenForm(true); };
  const handleEdit = (row) => { setEditing(row); setOpenForm(true); };

  const handleSubmit = async (payload) => {
    try {
      if (editing) {
        await updateAgent(editing.id, payload);
        pushToast({ type: "success", title: "Agents", message: "Agent mis a jour" });
      } else {
        await createAgent(payload);
        pushToast({ type: "success", title: "Agents", message: "Agent ajoute" });
      }
      setOpenForm(false);
      load();
    } catch (err) {
      pushToast({ type: "error", title: "Agents", message: err.message });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!toDelete) return;
    try {
      await deleteAgent(toDelete.id);
      pushToast({ type: "success", title: "Agents", message: "Agent supprime" });
      setToDelete(null);
      load();
    } catch (err) {
      pushToast({ type: "error", title: "Agents", message: err.message });
      setToDelete(null);
    }
  };

  const columns = [
    {
      key: "nom_complet",
      label: "Nom complet",
      render: (row) => (
        <span style={{ fontWeight: 600 }}>{row.nom_complet || `${row.nom} ${row.prenom || ""}`.trim()}</span>
      ),
    },
    { key: "telephone",      label: "Telephone",  render: (row) => row.telephone  || "—" },
    { key: "secteur_display",label: "Secteur",    render: (row) => row.secteur_display || "—" },
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
          <button className="btn-danger" onClick={() => setToDelete(row)}>Supprimer</button>
        </div>
      ),
    }] : []),
  ];

  return (
    <div className="page">
      <div className="page-header-row">
        <div>
          <h2>Agents terrain</h2>
          <p className="dashboard-subtitle">Annuaire des superviseurs adjoints de terrain</p>
        </div>
        {canWrite && (
          <button className="btn-primary" onClick={handleAdd}>
            + Ajouter un agent
          </button>
        )}
      </div>

      {loading ? (
        <LogoLoader compact size={70} />
      ) : agents.length === 0 ? (
        <div style={{ textAlign: "center", color: "#aaa", padding: 48 }}>
          <p style={{ fontSize: 15 }}>Aucun agent terrain enregistre.</p>
          {canWrite && (
            <button className="btn-primary" onClick={handleAdd} style={{ marginTop: 12 }}>
              Ajouter le premier agent
            </button>
          )}
        </div>
      ) : (
        <DataTable columns={columns} rows={agents} pageSize={10} />
      )}

      {/* Statistiques rapides */}
      {agents.length > 0 && (
        <div style={{ display: "flex", gap: 16, marginTop: 20, flexWrap: "wrap" }}>
          {[
            { label: "Total agents",  value: agents.length },
            { label: "Agents actifs", value: agents.filter((a) => a.actif).length },
            { label: "Inactifs",      value: agents.filter((a) => !a.actif).length },
          ].map(({ label, value }) => (
            <div key={label} style={{
              background: "#f9fbe7", border: "1px solid #dce775",
              borderRadius: 8, padding: "10px 20px", textAlign: "center", minWidth: 100,
            }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#558b2f" }}>{value}</div>
              <div style={{ fontSize: 12, color: "#666" }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Dialog ajout/edition */}
      <AgentDialog
        open={openForm}
        onClose={() => setOpenForm(false)}
        onSubmit={handleSubmit}
        initial={editing}
        secteurs={secteurs}
      />

      {/* Dialog confirmation suppression */}
      {toDelete && (
        <div className="dialog-backdrop" onClick={() => setToDelete(null)}>
          <div className="dialog dialog-sm" onClick={(e) => e.stopPropagation()}>
            <h3>Confirmer la suppression</h3>
            <p style={{ fontSize: 14, color: "#555", margin: "12px 0 20px" }}>
              Supprimer <strong>{toDelete.nom_complet || toDelete.nom}</strong> ?
              Cette action est irreversible. Les fiches passees restent inchangees.
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
