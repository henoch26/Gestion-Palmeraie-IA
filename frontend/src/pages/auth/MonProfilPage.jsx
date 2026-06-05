import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { getStoredAuth, updateProfile } from "../../services/authService.js";

export default function MonProfilPage() {
  const { user, refreshUser } = useAuth();
  const { pushToast } = useToast();

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    numero_telephone: "",
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (user) {
      setForm({
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        email: user.email || "",
        numero_telephone: user.numero_telephone || "",
      });
    }
  }, [user]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: null }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateProfile(form);
      // updateProfile a deja mis a jour le localStorage — on synchronise le contexte React
      const stored = getStoredAuth();
      if (stored) refreshUser(stored);
      pushToast({ type: "success", title: "Profil", message: "Informations mises a jour avec succes." });
    } catch (err) {
      pushToast({ type: "error", title: "Erreur", message: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Mon profil</h1>
          <p className="page-subtitle">Modifier vos informations personnelles</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 520 }}>
        {/* Bandeau info compte */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--color-border)", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--color-primary, #2e7d32)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.3rem", fontWeight: 700, flexShrink: 0 }}>
            {(user?.first_name?.[0] || user?.username?.[0] || "?").toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: "1rem" }}>
              {[user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.username}
            </div>
            <div style={{ fontSize: "0.82rem", color: "var(--color-muted)" }}>
              @{user?.username} &bull; {user?.role_display || user?.role}
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}>

          <div className="modal-section-label">Identite</div>

          <div className="mfield-row">
            <div className="mfield">
              <label className="mfield-label">Prenom</label>
              <input
                className="mfield-input"
                name="first_name"
                value={form.first_name}
                onChange={handleChange}
                placeholder="Votre prenom"
              />
            </div>
            <div className="mfield">
              <label className="mfield-label">Nom</label>
              <input
                className="mfield-input"
                name="last_name"
                value={form.last_name}
                onChange={handleChange}
                placeholder="Votre nom"
              />
            </div>
          </div>

          <div className="modal-section-label" style={{ marginTop: 4 }}>Contact</div>

          <div className="mfield">
            <label className="mfield-label">Numero WhatsApp</label>
            <input
              className="mfield-input"
              name="numero_telephone"
              value={form.numero_telephone}
              onChange={handleChange}
              placeholder="ex: 07 12 34 56 78"
            />
          </div>

          <div className="mfield">
            <label className="mfield-label">Adresse email</label>
            <input
              className={`mfield-input${errors.email ? " mfield-input--error" : ""}`}
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              placeholder="ex: votre@email.com"
            />
            {errors.email && <span className="mfield-error">{errors.email}</span>}
          </div>

          <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Enregistrement..." : "Enregistrer les modifications"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
