import { useEffect, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/axios.js";
import { endpoints } from "../../api/endpoints.js";
import { useToast } from "../../context/ToastContext.jsx";
import { useAuth } from "../../context/AuthContext.jsx";

const ROLE_LABELS = { admin: "Administrateur", superviseur: "Superviseur" };

const emptyForm = {
  username: "", password: "", first_name: "", last_name: "",
  email: "", numero_telephone: "", role: "superviseur",
};

function CredentialsModal({ credentials, onClose }) {
  const [copied, setCopied] = useState(false);

  const message =
    `Bonjour ${credentials.first_name || credentials.username},\n\n` +
    `Voici vos identifiants de connexion a l'application Palmeraie :\n` +
    `Nom d'utilisateur : ${credentials.username}\n` +
    `Mot de passe temporaire : ${credentials.password}\n\n` +
    `Vous devrez changer votre mot de passe des la premiere connexion.`;

  const handleCopy = () => {
    navigator.clipboard.writeText(message).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleWhatsApp = () => {
    const phone = credentials.numero_telephone.replace(/\s+/g, "").replace(/^0/, "225");
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank");
  };

return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Compte cree — Partager les identifiants</h2>
          <button className="btn-ghost btn-mini" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ marginBottom: 12, color: "var(--color-muted)", fontSize: "0.9rem" }}>
            Le compte a ete cree avec un mot de passe temporaire. Transmettez ces identifiants au superviseur.
          </p>

          <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, padding: "14px 16px", marginBottom: 16, fontFamily: "monospace", fontSize: "0.95rem", lineHeight: 1.8 }}>
            <div><strong>Utilisateur :</strong> {credentials.username}</div>
            <div><strong>Mot de passe :</strong> {credentials.password}</div>
            {credentials.email && <div><strong>Email :</strong> {credentials.email}</div>}
            {credentials.numero_telephone && <div><strong>Tel :</strong> {credentials.numero_telephone}</div>}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button className="btn btn-secondary" onClick={handleCopy} style={{ width: "100%" }}>
              {copied ? "Copie !" : "Copier les identifiants"}
            </button>

            {credentials.numero_telephone && (
              <button
                className="btn btn-primary"
                onClick={handleWhatsApp}
                style={{ width: "100%", background: "#25D366", borderColor: "#25D366" }}
              >
                Envoyer par WhatsApp
              </button>
            )}

          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

export default function GestionUtilisateurs() {
  const { user: currentUser } = useAuth();
  const { pushToast } = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [createdCredentials, setCreatedCredentials] = useState(null);

  const fetchUsers = async () => {
    try {
      const data = await apiGet(endpoints.users);
      setUsers(data);
    } catch {
      pushToast({ type: "error", title: "Erreur", message: "Impossible de charger les utilisateurs" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const openCreate = () => {
    setEditingUser(null);
    setForm(emptyForm);
    setErrors({});
    setShowForm(true);
  };

  const openEdit = (u) => {
    setEditingUser(u);
    setForm({
      username: u.username,
      password: "",
      first_name: u.first_name || "",
      last_name: u.last_name || "",
      email: u.email || "",
      numero_telephone: u.numero_telephone || "",
      role: u.role,
    });
    setErrors({});
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditingUser(null); setErrors({}); };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: null }));
  };

  const validate = () => {
    const errs = {};
    if (!editingUser && !form.username.trim()) errs.username = "Nom d'utilisateur requis";
    if (!editingUser && !form.password.trim()) errs.password = "Mot de passe requis";
    if (!editingUser && form.password.trim().length < 6) errs.password = "Au moins 6 caracteres";
    if (editingUser && form.password && form.password.length < 6) errs.password = "Au moins 6 caracteres";
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setSaving(true);
    try {
      const payload = { ...form };
      if (!payload.password) delete payload.password;

      if (editingUser) {
        delete payload.username;
        await apiPatch(`${endpoints.users}${editingUser.id}/`, payload);
        pushToast({ type: "success", title: "Utilisateur modifie", message: `${editingUser.username} mis a jour` });
        closeForm();
        fetchUsers();
      } else {
        await apiPost(endpoints.users, payload);
        closeForm();
        fetchUsers();
        // Afficher le modal de partage des identifiants
        setCreatedCredentials({
          username: form.username,
          password: form.password,
          first_name: form.first_name,
          email: form.email,
          numero_telephone: form.numero_telephone,
        });
      }
    } catch (err) {
      const data = err?.response?.data || {};
      if (typeof data === "object") {
        const fieldErrors = {};
        Object.entries(data).forEach(([k, v]) => { fieldErrors[k] = Array.isArray(v) ? v[0] : v; });
        setErrors(fieldErrors);
      } else {
        pushToast({ type: "error", title: "Erreur", message: "Une erreur est survenue" });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (u) => {
    if (u.id === currentUser?.id) return;
    try {
      await apiPatch(`${endpoints.users}${u.id}/`, { is_active: !u.is_active });
      pushToast({
        type: u.is_active ? "warning" : "success",
        title: u.is_active ? "Compte desactive" : "Compte reactive",
        message: u.username,
      });
      fetchUsers();
    } catch {
      pushToast({ type: "error", title: "Erreur", message: "Modification impossible" });
    }
  };

  const handleDelete = async (u) => {
    if (u.id === currentUser?.id) return;
    if (!window.confirm(`Supprimer le compte de ${u.username} ? Cette action est irreversible.`)) return;
    try {
      await apiDelete(`${endpoints.users}${u.id}/`);
      pushToast({ type: "success", title: "Compte supprime", message: u.username });
      fetchUsers();
    } catch {
      pushToast({ type: "error", title: "Erreur", message: "Suppression impossible" });
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Gestion des utilisateurs</h1>
          <p className="page-subtitle">Comptes administrateurs et superviseurs</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          + Nouvel utilisateur
        </button>
      </div>

      {loading ? (
        <p className="text-muted">Chargement...</p>
      ) : (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nom d&apos;utilisateur</th>
                <th>Nom complet</th>
                <th>Contact</th>
                <th>Role</th>
                <th>Statut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ opacity: u.is_active ? 1 : 0.5 }}>
                  <td>
                    <strong>{u.username}</strong>
                    {u.id === currentUser?.id && (
                      <span className="badge badge-info" style={{ marginLeft: 6 }}>vous</span>
                    )}
                  </td>
                  <td>{[u.first_name, u.last_name].filter(Boolean).join(" ") || "—"}</td>
                  <td style={{ fontSize: "0.85rem", color: "var(--color-muted)" }}>
                    {u.numero_telephone && <div>{u.numero_telephone}</div>}
                    {u.email && <div>{u.email}</div>}
                    {!u.numero_telephone && !u.email && "—"}
                  </td>
                  <td>
                    <span className={`role-badge role-badge--${u.role}`}>
                      {ROLE_LABELS[u.role] || u.role}
                    </span>
                  </td>
                  <td style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <span className={`badge ${u.is_active ? "badge-success" : "badge-danger"}`}>
                      {u.is_active ? "Actif" : "Desactive"}
                    </span>
                    {u.must_change_password && (
                      <span className="badge badge-warning" title="Ce compte doit changer son mot de passe a la prochaine connexion">
                        MDP temporaire
                      </span>
                    )}
                  </td>
                  <td className="actions-cell">
                    <button className="btn btn-sm btn-secondary" onClick={() => openEdit(u)}>
                      Modifier
                    </button>
                    {u.id !== currentUser?.id && (
                      <>
                        <button
                          className={`btn btn-sm ${u.is_active ? "btn-warning" : "btn-success"}`}
                          onClick={() => handleToggleActive(u)}
                        >
                          {u.is_active ? "Desactiver" : "Reactiver"}
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(u)}>
                          Supprimer
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={6} className="text-center text-muted">Aucun utilisateur</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal formulaire */}
      {showForm && (
        <div className="modal-overlay" onClick={closeForm}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingUser ? `Modifier ${editingUser.username}` : "Nouvel utilisateur"}</h2>
              <button className="btn-ghost btn-mini" onClick={closeForm}>✕</button>
            </div>

            <form onSubmit={handleSubmit} autoComplete="off">
              <div className="modal-body modal-form">

                {/* Identifiants */}
                <div className="modal-section-label">Identifiants de connexion</div>

                {!editingUser && (
                  <div className="mfield">
                    <label className="mfield-label">Nom d&apos;utilisateur <span className="req">*</span></label>
                    <input
                      className={`mfield-input${errors.username ? " mfield-input--error" : ""}`}
                      name="username"
                      value={form.username}
                      onChange={handleChange}
                      placeholder="ex: konan.sylvestre"
                      autoComplete="off"
                      autoFocus
                    />
                    {errors.username && <span className="mfield-error">{errors.username}</span>}
                  </div>
                )}

                <div className="mfield">
                  <label className="mfield-label">
                    {editingUser ? "Nouveau mot de passe" : "Mot de passe temporaire"}{" "}
                    {!editingUser && <span className="req">*</span>}
                  </label>
                  <input
                    className={`mfield-input${errors.password ? " mfield-input--error" : ""}`}
                    type="password"
                    name="password"
                    value={form.password}
                    onChange={handleChange}
                    placeholder={editingUser ? "Laisser vide pour ne pas changer" : "Min. 6 caracteres"}
                    autoComplete="new-password"
                  />
                  {errors.password && <span className="mfield-error">{errors.password}</span>}
                </div>

                {/* Identite */}
                <div className="modal-section-label" style={{ marginTop: 8 }}>Identite</div>

                <div className="mfield-row">
                  <div className="mfield">
                    <label className="mfield-label">Prenom</label>
                    <input
                      className="mfield-input"
                      name="first_name"
                      value={form.first_name}
                      onChange={handleChange}
                      placeholder="Prenom"
                    />
                  </div>
                  <div className="mfield">
                    <label className="mfield-label">Nom</label>
                    <input
                      className="mfield-input"
                      name="last_name"
                      value={form.last_name}
                      onChange={handleChange}
                      placeholder="Nom de famille"
                    />
                  </div>
                </div>

                {/* Contact */}
                <div className="modal-section-label" style={{ marginTop: 8 }}>Contact (pour envoi des identifiants)</div>

                <div className="mfield">
                  <label className="mfield-label">Numero WhatsApp</label>
                  <input
                    className="mfield-input"
                    name="numero_telephone"
                    value={form.numero_telephone}
                    onChange={handleChange}
                    placeholder="ex: 07 12 34 56 78"
                  />
                  <small className="mfield-hint">&#128241; Utilisé pour envoyer les identifiants via WhatsApp</small>
                </div>

                <div className="mfield">
                  <label className="mfield-label">Adresse email</label>
                  <input
                    className={`mfield-input${errors.email ? " mfield-input--error" : ""}`}
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="ex: superviseur@example.com"
                  />
                  <small className="mfield-hint">&#9993; Utilisé pour envoyer les identifiants par email</small>
                  {errors.email && <span className="mfield-error">{errors.email}</span>}
                </div>

                {/* Role */}
                <div className="modal-section-label" style={{ marginTop: 8 }}>Role</div>

                <div className="mfield">
                  <label className="mfield-label">Role <span className="req">*</span></label>
                  <select className="mfield-input" name="role" value={form.role} onChange={handleChange}>
                    <option value="superviseur">Superviseur</option>
                    <option value="admin">Administrateur</option>
                  </select>
                  <small className="mfield-hint">
                    {form.role === "superviseur"
                      ? "&#128274; Acces limite : saisie de ses propres fiches uniquement"
                      : "&#128275; Acces complet a toute l'application"}
                  </small>
                </div>

                {errors.non_field_errors && (
                  <p className="mfield-error">{errors.non_field_errors}</p>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeForm}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Enregistrement..." : editingUser ? "Mettre a jour" : "Creer le compte"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal partage des identifiants */}
      {createdCredentials && (
        <CredentialsModal
          credentials={createdCredentials}
          onClose={() => setCreatedCredentials(null)}
        />
      )}
    </div>
  );
}
