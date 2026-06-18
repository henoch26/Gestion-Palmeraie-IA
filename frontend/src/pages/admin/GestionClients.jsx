import { useEffect, useState } from "react";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { createClient, deleteClient, listClients, updateClient } from "../../services/clientService.js";

const EMPTY = { nom: "", telephone: "", adresse: "" };

function ClientDialog({ open, onClose, onSubmit, initial }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!open) return;
    setForm(initial ? { nom: initial.nom || "", telephone: initial.telephone || "", adresse: initial.adresse || "" } : { ...EMPTY });
    setErrors({});
  }, [open, initial]);

  if (!open) return null;

  const handle = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
    if (errors[name]) setErrors((p) => ({ ...p, [name]: null }));
  };

  const submit = () => {
    const errs = {};
    if (!form.nom.trim()) errs.nom = "Le nom est requis";
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onSubmit({ nom: form.nom.trim(), telephone: form.telephone.trim(), adresse: form.adresse.trim() });
  };

  const isEdit = !!initial;

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog dialog-sm" style={{ padding: 0, overflow: "hidden" }}
        onClick={(e) => e.stopPropagation()}>

        {/* En-tête */}
        <div style={{
          background: "linear-gradient(135deg, #1565c0 0%, #42a5f5 100%)",
          padding: "20px 20px 16px", color: "#fff", position: "relative",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 42, height: 42, borderRadius: "50%",
              background: "rgba(255,255,255,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20, flexShrink: 0,
            }}>
              {isEdit ? "✏️" : "🏢"}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>
                {isEdit ? "Modifier le client" : "Nouveau client"}
              </div>
              <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>
                {isEdit ? initial.nom : "Remplissez les informations du client"}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{
            position: "absolute", top: 12, right: 12,
            background: "rgba(255,255,255,0.2)", border: "none",
            borderRadius: 6, color: "#fff", padding: "4px 10px",
            cursor: "pointer", fontSize: 12, fontWeight: 600,
          }}>✕</button>
        </div>

        {/* Corps */}
        <div style={{ padding: "20px 20px 0" }}>
          <div className="mfield" style={{ marginBottom: 14 }}>
            <label className="mfield-label">Nom <span style={{ color: "#d32f2f" }}>*</span></label>
            <input className={`mfield-input${errors.nom ? " mfield-input--error" : ""}`}
              name="nom" value={form.nom} onChange={handle}
              placeholder="ex : SIFCA" autoFocus />
            {errors.nom && <span className="mfield-error">{errors.nom}</span>}
          </div>

          <div className="mfield" style={{ marginBottom: 14 }}>
            <label className="mfield-label">Téléphone</label>
            <input className="mfield-input" name="telephone" value={form.telephone}
              onChange={handle} placeholder="ex : 07 XX XX XX XX" inputMode="tel" />
          </div>

          <div className="mfield" style={{ marginBottom: 20 }}>
            <label className="mfield-label">Adresse</label>
            <input className="mfield-input" name="adresse" value={form.adresse}
              onChange={handle} placeholder="ex : Abidjan, Cocody" />
          </div>
        </div>

        {/* Pied */}
        <div style={{
          display: "flex", justifyContent: "flex-end", gap: 10,
          padding: "14px 20px", borderTop: "1px solid #f0f0f0", background: "#fafafa",
        }}>
          <button type="button" onClick={onClose} style={{
            padding: "8px 18px", borderRadius: 6, border: "1px solid #ddd",
            background: "#fff", cursor: "pointer", fontSize: 13, color: "#555",
          }}>Annuler</button>
          <button type="button" onClick={submit} style={{
            padding: "8px 20px", borderRadius: 6, border: "none",
            background: "linear-gradient(135deg, #1565c0, #42a5f5)",
            color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13,
          }}>{isEdit ? "Mettre à jour" : "Ajouter"}</button>
        </div>
      </div>
    </div>
  );
}

export default function GestionClients() {
  const { pushToast } = useToast();
  const { hasPermission } = useAuth();
  const canWrite = hasPermission("gerer_clients");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      const data = await listClients();
      setRows(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      pushToast({ type: "error", title: "Clients", message: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (payload) => {
    try {
      if (editing) {
        const updated = await updateClient(editing.id, payload);
        setRows((prev) => prev.map((r) => r.id === editing.id ? updated : r));
        pushToast({ type: "success", title: "Clients", message: "Client modifié." });
      } else {
        const created = await createClient(payload);
        setRows((prev) => [created, ...prev]);
        pushToast({ type: "success", title: "Clients", message: "Client ajouté." });
      }
      setOpenForm(false);
      setEditing(null);
    } catch (err) {
      pushToast({ type: "error", title: "Clients", message: err.message });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteClient(toDelete.id);
      setRows((prev) => prev.filter((r) => r.id !== toDelete.id));
      pushToast({ type: "success", title: "Clients", message: "Client supprimé." });
    } catch (err) {
      pushToast({ type: "error", title: "Clients", message: err.message });
    } finally {
      setToDelete(null);
    }
  };

  const filtered = rows.filter((r) =>
    [r.nom, r.telephone, r.adresse].some((v) =>
      (v || "").toLowerCase().includes(search.toLowerCase())
    )
  );

  return (
    <div className="page-container">
      <div className="page-header">
        <h2>Gestion des clients</h2>
        {canWrite && (
          <button className="btn-primary" onClick={() => { setEditing(null); setOpenForm(true); }}>
            + Ajouter un client
          </button>
        )}
      </div>

      {/* Barre de recherche */}
      <div style={{ marginBottom: 16 }}>
        <input
          className="search-input"
          placeholder="Rechercher un client…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 320 }}
        />
      </div>

      {/* Tableau */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#1f4e79", color: "#fff" }}>
              {["Nom", "Téléphone", "Adresse", "Créé le", "Actions"].map((h) => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} style={{ padding: 24, textAlign: "center", color: "#aaa" }}>Chargement…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 24, textAlign: "center", color: "#aaa" }}>
                {search ? "Aucun résultat." : "Aucun client enregistré."}
              </td></tr>
            )}
            {!loading && filtered.map((row, idx) => (
              <tr key={row.id} style={{ background: idx % 2 === 0 ? "#fafafa" : "#fff", borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "8px 14px", fontWeight: 600 }}>{row.nom}</td>
                <td style={{ padding: "8px 14px", color: "#555" }}>{row.telephone || "—"}</td>
                <td style={{ padding: "8px 14px", color: "#555" }}>{row.adresse || "—"}</td>
                <td style={{ padding: "8px 14px", color: "#888", fontSize: 12 }}>
                  {row.created_at ? new Date(row.created_at).toLocaleDateString("fr-FR") : "—"}
                </td>
                <td style={{ padding: "8px 14px" }}>
                  {canWrite && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "nowrap" }}>
                      <button className="btn-secondary btn-sm"
                        onClick={() => { setEditing(row); setOpenForm(true); }}>
                        Modifier
                      </button>
                      <button className="btn-danger btn-sm"
                        onClick={() => setToDelete(row)}>
                        Supprimer
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ClientDialog
        open={openForm}
        onClose={() => { setOpenForm(false); setEditing(null); }}
        onSubmit={handleSubmit}
        initial={editing}
      />

      <ConfirmDialog
        open={!!toDelete}
        title="Supprimer le client"
        message={`Confirmer la suppression de "${toDelete?.nom}" ? Cette action est irréversible.`}
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
