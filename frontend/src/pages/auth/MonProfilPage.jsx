import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { changePassword, getStoredAuth, updateProfile } from "../../services/authService.js";

function SectionCard({ title, subtitle, children }) {
  return (
    <div className="card" style={{ maxWidth: 520, marginBottom: 24 }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--color-border)" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 700, margin: 0 }}>{title}</h2>
        {subtitle && <p style={{ fontSize: "0.82rem", color: "var(--color-muted)", margin: "4px 0 0" }}>{subtitle}</p>}
      </div>
      <div style={{ padding: "20px" }}>
        {children}
      </div>
    </div>
  );
}

export default function MonProfilPage() {
  const { user, refreshUser } = useAuth();
  const { pushToast } = useToast();

  // ── Informations personnelles ──────────────────────────────────
  const [infoForm, setInfoForm] = useState({
    first_name: "", last_name: "", email: "", numero_telephone: "",
  });
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoErrors, setInfoErrors] = useState({});

  useEffect(() => {
    if (user) {
      setInfoForm({
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        email: user.email || "",
        numero_telephone: user.numero_telephone || "",
      });
    }
  }, [user]);

  const handleInfoChange = (e) => {
    const { name, value } = e.target;
    setInfoForm((prev) => ({ ...prev, [name]: value }));
    if (infoErrors[name]) setInfoErrors((prev) => ({ ...prev, [name]: null }));
  };

  const handleInfoSubmit = async (e) => {
    e.preventDefault();
    setSavingInfo(true);
    try {
      await updateProfile(infoForm);
      const stored = getStoredAuth();
      if (stored) refreshUser(stored);
      pushToast({ type: "success", title: "Profil", message: "Informations mises a jour." });
    } catch (err) {
      pushToast({ type: "error", title: "Erreur", message: err.message });
    } finally {
      setSavingInfo(false);
    }
  };

  // ── Changement de mot de passe ─────────────────────────────────
  const [pwdForm, setPwdForm] = useState({ current: "", next: "", confirm: "" });
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdErrors, setPwdErrors] = useState({});

  const handlePwdChange = (e) => {
    const { name, value } = e.target;
    setPwdForm((prev) => ({ ...prev, [name]: value }));
    if (pwdErrors[name]) setPwdErrors((prev) => ({ ...prev, [name]: null }));
  };

  const handlePwdSubmit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!pwdForm.current) errs.current = "Requis";
    if (!pwdForm.next) errs.next = "Requis";
    else if (pwdForm.next.length < 6) errs.next = "Au moins 6 caracteres";
    if (pwdForm.next !== pwdForm.confirm) errs.confirm = "Les mots de passe ne correspondent pas";
    if (Object.keys(errs).length > 0) { setPwdErrors(errs); return; }

    setSavingPwd(true);
    try {
      const data = await changePassword({ currentPassword: pwdForm.current, newPassword: pwdForm.next });
      refreshUser(data);
      setPwdForm({ current: "", next: "", confirm: "" });
      pushToast({ type: "success", title: "Mot de passe", message: "Mot de passe modifie avec succes." });
    } catch (err) {
      pushToast({ type: "error", title: "Erreur", message: err.message });
    } finally {
      setSavingPwd(false);
    }
  };

  const displayName = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.username;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Mon profil</h1>
          <p className="page-subtitle">Gerer vos informations personnelles et votre mot de passe</p>
        </div>
      </div>

      {/* Bandeau identite */}
      <div className="card" style={{ maxWidth: 520, marginBottom: 24 }}>
        <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: "50%",
            background: "var(--color-primary, #2e7d32)", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "1.3rem", fontWeight: 700, flexShrink: 0,
          }}>
            {(user?.first_name?.[0] || user?.username?.[0] || "?").toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: "1rem" }}>{displayName}</div>
            <div style={{ fontSize: "0.82rem", color: "var(--color-muted)" }}>
              @{user?.username} &bull; {user?.role_display || user?.role}
            </div>
          </div>
        </div>
      </div>

      {/* ── Informations personnelles ── */}
      <SectionCard
        title="Informations personnelles"
        subtitle="Prenom, nom, email et numero WhatsApp"
      >
        <form onSubmit={handleInfoSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="mfield-row">
            <div className="mfield">
              <label className="mfield-label">Prenom</label>
              <input
                className="mfield-input"
                name="first_name"
                value={infoForm.first_name}
                onChange={handleInfoChange}
                placeholder="Votre prenom"
              />
            </div>
            <div className="mfield">
              <label className="mfield-label">Nom</label>
              <input
                className="mfield-input"
                name="last_name"
                value={infoForm.last_name}
                onChange={handleInfoChange}
                placeholder="Votre nom"
              />
            </div>
          </div>

          <div className="mfield">
            <label className="mfield-label">Numero WhatsApp</label>
            <input
              className="mfield-input"
              name="numero_telephone"
              value={infoForm.numero_telephone}
              onChange={handleInfoChange}
              placeholder="ex: 07 12 34 56 78"
            />
          </div>

          <div className="mfield">
            <label className="mfield-label">Adresse email</label>
            <input
              className={`mfield-input${infoErrors.email ? " mfield-input--error" : ""}`}
              type="email"
              name="email"
              value={infoForm.email}
              onChange={handleInfoChange}
              placeholder="ex: votre@email.com"
            />
            {infoErrors.email && <span className="mfield-error">{infoErrors.email}</span>}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="submit" className="btn btn-primary" disabled={savingInfo}>
              {savingInfo ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </form>
      </SectionCard>

      {/* ── Changer le mot de passe ── */}
      <SectionCard
        title="Changer le mot de passe"
        subtitle="Saisissez votre mot de passe actuel pour en definir un nouveau"
      >
        <form onSubmit={handlePwdSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }} autoComplete="off">
          <div className="mfield">
            <label className="mfield-label">Mot de passe actuel <span className="req">*</span></label>
            <input
              className={`mfield-input${pwdErrors.current ? " mfield-input--error" : ""}`}
              type="password"
              name="current"
              value={pwdForm.current}
              onChange={handlePwdChange}
              placeholder="Votre mot de passe actuel"
              autoComplete="current-password"
            />
            {pwdErrors.current && <span className="mfield-error">{pwdErrors.current}</span>}
          </div>

          <div className="mfield">
            <label className="mfield-label">Nouveau mot de passe <span className="req">*</span></label>
            <input
              className={`mfield-input${pwdErrors.next ? " mfield-input--error" : ""}`}
              type="password"
              name="next"
              value={pwdForm.next}
              onChange={handlePwdChange}
              placeholder="Au moins 6 caracteres"
              autoComplete="new-password"
            />
            {pwdErrors.next && <span className="mfield-error">{pwdErrors.next}</span>}
          </div>

          <div className="mfield">
            <label className="mfield-label">Confirmer le nouveau mot de passe <span className="req">*</span></label>
            <input
              className={`mfield-input${pwdErrors.confirm ? " mfield-input--error" : ""}`}
              type="password"
              name="confirm"
              value={pwdForm.confirm}
              onChange={handlePwdChange}
              placeholder="Repeter le nouveau mot de passe"
              autoComplete="new-password"
            />
            {pwdErrors.confirm && <span className="mfield-error">{pwdErrors.confirm}</span>}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="submit" className="btn btn-primary" disabled={savingPwd}>
              {savingPwd ? "Modification..." : "Changer le mot de passe"}
            </button>
          </div>
        </form>
      </SectionCard>
    </div>
  );
}
