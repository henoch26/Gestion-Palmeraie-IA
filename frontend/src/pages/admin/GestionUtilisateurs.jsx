import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [createdCredentials, setCreatedCredentials] = useState(null);
  const [droitsList, setDroitsList] = useState([]);
  const [selectedPermissions, setSelectedPermissions] = useState([]);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [resetPwd, setResetPwd] = useState("");

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

  const fetchDroits = async () => {
    try {
      const data = await apiGet(endpoints.droits);
      setDroitsList(data || []);
    } catch {
      // silencieux
    }
  };

  useEffect(() => { fetchUsers(); fetchDroits(); }, []);


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
    setSelectedPermissions(u.permissions || []);
    setResetPwd("");
    setErrors({});
    setShowForm(true);
  };

  const openCreate = () => {
    setEditingUser(null);
    setForm(emptyForm);
    setSelectedPermissions([]);
    setResetPwd("");
    setErrors({});
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditingUser(null); setResetPwd(""); setErrors({}); };

  // Vrai si l'utilisateur a déjà pris possession de son compte (changé le mot de passe temporaire)
  const accountOwned = Boolean(editingUser && editingUser.must_change_password === false);

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
    if (editingUser && !accountOwned && form.password && form.password.length < 6) errs.password = "Au moins 6 caracteres";
    if (editingUser && accountOwned && resetPwd && resetPwd.length < 6) errs.resetPwd = "Au moins 6 caracteres";
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setSaving(true);
    try {
      if (editingUser) {
        const payload = { role: form.role };

        if (accountOwned) {
          // Compte géré par son titulaire : seuls rôle, droits et réinitialisation MDP autorisés
          if (resetPwd) {
            payload.password = resetPwd;
            payload.must_change_password = true;
          }
        } else {
          // Compte non encore pris en main : on peut modifier les champs personnels
          payload.first_name = form.first_name;
          payload.last_name = form.last_name;
          payload.email = form.email;
          payload.numero_telephone = form.numero_telephone;
          if (form.password) payload.password = form.password;
        }

        if (editingUser.role === "superviseur" || form.role === "superviseur") {
          payload.permissions = selectedPermissions;
        }

        await apiPatch(`${endpoints.users}${editingUser.id}/`, payload);
        pushToast({ type: "success", title: "Utilisateur modifie", message: `${editingUser.username} mis a jour` });
        closeForm();
        fetchUsers();
      } else {
        const payload = { ...form };
        await apiPost(endpoints.users, payload);
        closeForm();
        fetchUsers();
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

  const handleDelete = (u) => {
    if (u.id === currentUser?.id) return;
    setDeleteConfirm(u);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await apiDelete(`${endpoints.users}${deleteConfirm.id}/`);
      pushToast({ type: "success", title: "Compte supprime", message: deleteConfirm.username });
      fetchUsers();
    } catch {
      pushToast({ type: "error", title: "Erreur", message: "Suppression impossible" });
    } finally {
      setDeleteConfirm(null);
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
                  <td style={{ display: "flex", gap: 6, flexWrap: "nowrap", alignItems: "center", whiteSpace: "nowrap" }}>
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
                    {u.role === "superviseur" && u.superviseur_id && (
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => navigate(`/superviseurs/${u.superviseur_id}`)}
                      >
                        Voir
                      </button>
                    )}
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

                {!editingUser ? (
                  /* Creation : mot de passe temporaire requis */
                  <div className="mfield">
                    <label className="mfield-label">Mot de passe temporaire <span className="req">*</span></label>
                    <input
                      className={`mfield-input${errors.password ? " mfield-input--error" : ""}`}
                      type="password"
                      name="password"
                      value={form.password}
                      onChange={handleChange}
                      placeholder="Min. 6 caracteres"
                      autoComplete="new-password"
                    />
                    {errors.password && <span className="mfield-error">{errors.password}</span>}
                  </div>
                ) : accountOwned ? (
                  /* Edition compte possédé : section réinitialisation uniquement */
                  <div style={{ background: "#fff8e1", border: "1px solid #ffe082", borderRadius: 6, padding: "12px 14px", marginBottom: 8 }}>
                    <p style={{ fontSize: 12, color: "#795548", fontWeight: 700, marginBottom: 4 }}>
                      Reinitialiser le mot de passe
                    </p>
                    <p style={{ fontSize: 11, color: "#888", marginBottom: 10, lineHeight: 1.5 }}>
                      Ce compte est gere par son titulaire. Seule la reinitialisation du mot de passe est autorisee.
                      Le superviseur devra le changer a sa prochaine connexion.
                    </p>
                    <div className="mfield" style={{ marginBottom: 0 }}>
                      <label className="mfield-label">Nouveau mot de passe temporaire</label>
                      <input
                        className={`mfield-input${errors.resetPwd ? " mfield-input--error" : ""}`}
                        type="password"
                        value={resetPwd}
                        onChange={(e) => {
                          setResetPwd(e.target.value);
                          if (errors.resetPwd) setErrors((p) => ({ ...p, resetPwd: null }));
                        }}
                        placeholder="Laisser vide pour ne pas reinitialiser"
                        autoComplete="new-password"
                      />
                      {errors.resetPwd && <span className="mfield-error">{errors.resetPwd}</span>}
                    </div>
                  </div>
                ) : (
                  /* Edition compte non encore pris en main : changement optionnel */
                  <div className="mfield">
                    <label className="mfield-label">Nouveau mot de passe</label>
                    <input
                      className={`mfield-input${errors.password ? " mfield-input--error" : ""}`}
                      type="password"
                      name="password"
                      value={form.password}
                      onChange={handleChange}
                      placeholder="Laisser vide pour ne pas changer"
                      autoComplete="new-password"
                    />
                    {errors.password && <span className="mfield-error">{errors.password}</span>}
                  </div>
                )}

                {/* Identite */}
                <div className="modal-section-label" style={{ marginTop: 8 }}>Identite</div>

                {accountOwned ? (
                  /* Compte possédé : lecture seule */
                  <div style={{ background: "#f5f5f5", border: "1px dashed #ccc", borderRadius: 6, padding: "10px 14px", marginBottom: 8 }}>
                    <p style={{ fontSize: 11, color: "#888", marginBottom: 8 }}>
                      Gere par le titulaire via son profil — lecture seule.
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 11, color: "#aaa", marginBottom: 2 }}>Prenom</div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{editingUser.first_name || "—"}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: "#aaa", marginBottom: 2 }}>Nom</div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{editingUser.last_name || "—"}</div>
                      </div>
                    </div>
                  </div>
                ) : (
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
                )}

                {/* Contact */}
                <div className="modal-section-label" style={{ marginTop: 8 }}>Contact</div>

                {accountOwned ? (
                  /* Compte possédé : lecture seule */
                  <div style={{ background: "#f5f5f5", border: "1px dashed #ccc", borderRadius: 6, padding: "10px 14px", marginBottom: 8 }}>
                    <p style={{ fontSize: 11, color: "#888", marginBottom: 8 }}>
                      Gere par le titulaire — lecture seule.
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 11, color: "#aaa", marginBottom: 2 }}>WhatsApp</div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{editingUser.numero_telephone || "—"}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: "#aaa", marginBottom: 2 }}>Email</div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{editingUser.email || "—"}</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mfield">
                      <label className="mfield-label">Numero WhatsApp</label>
                      <input
                        className="mfield-input"
                        name="numero_telephone"
                        value={form.numero_telephone}
                        onChange={handleChange}
                        placeholder="ex: 07 12 34 56 78"
                      />
                      <small className="mfield-hint">&#128241; Utilise pour envoyer les identifiants via WhatsApp</small>
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
                      <small className="mfield-hint">&#9993; Utilise pour envoyer les identifiants par email</small>
                      {errors.email && <span className="mfield-error">{errors.email}</span>}
                    </div>
                  </>
                )}

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

                {/* Permissions — visible uniquement pour les superviseurs */}
                {(form.role === "superviseur") && editingUser && droitsList.length > 0 && (
                  <>
                    <div className="modal-section-label" style={{ marginTop: 8 }}>
                      Droits accordes a ce superviseur
                    </div>
                    <div style={{
                      background: "#f9fbe7",
                      border: "1px solid #dce775",
                      borderRadius: 8,
                      padding: "12px 14px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}>
                      {droitsList.map((d) => {
                        const checked = selectedPermissions.includes(d.code);
                        return (
                          <label
                            key={d.code}
                            style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              style={{ marginTop: 3, flexShrink: 0 }}
                              onChange={() =>
                                setSelectedPermissions((prev) =>
                                  checked ? prev.filter((c) => c !== d.code) : [...prev, d.code]
                                )
                              }
                            />
                            <span>
                              <span style={{ fontWeight: 600, fontSize: 13 }}>{d.label}</span>
                              {d.description && (
                                <span style={{ display: "block", fontSize: 11, color: "#666" }}>
                                  {d.description}
                                </span>
                              )}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </>
                )}

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

      {/* Dialog confirmation suppression */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Supprimer le compte</h2>
              <button className="btn-ghost btn-mini" onClick={() => setDeleteConfirm(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14, color: "#555", marginBottom: 8 }}>
                Vous allez supprimer le compte de{" "}
                <strong>{[deleteConfirm.first_name, deleteConfirm.last_name].filter(Boolean).join(" ") || deleteConfirm.username}</strong>
                {" "}(<code>{deleteConfirm.username}</code>).
              </p>
              <p style={{ fontSize: 13, color: "#c62828", fontWeight: 600 }}>
                Cette action est irreversible. Toutes les donnees liees a ce compte seront conservees mais le compte sera supprime.
              </p>
            </div>
            <div className="modal-footer" style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>
                Annuler
              </button>
              <button className="btn btn-danger" onClick={confirmDelete}>
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
