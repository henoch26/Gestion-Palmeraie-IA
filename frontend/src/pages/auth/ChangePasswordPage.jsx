import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { changePassword } from "../../services/authService.js";
import logo from "../../assets/logo.png";

export default function ChangePasswordPage() {
  const { refreshUser, logout } = useAuth();
  const { pushToast } = useToast();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      pushToast({ type: "error", title: "Erreur", message: "Les mots de passe ne correspondent pas." });
      return;
    }
    if (newPassword.length < 6) {
      pushToast({ type: "error", title: "Erreur", message: "Le mot de passe doit contenir au moins 6 caracteres." });
      return;
    }

    setSubmitting(true);
    try {
      const data = await changePassword({ currentPassword, newPassword });
      refreshUser(data);
      pushToast({ type: "success", title: "Mot de passe", message: "Mot de passe modifie avec succes." });
      navigate("/dashboard", { replace: true });
    } catch (err) {
      pushToast({ type: "error", title: "Erreur", message: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-banner">
          <div className="login-banner-content">
            <div className="login-banner-title">Palmeraie</div>
            <div className="login-banner-subtitle">Changement de mot de passe</div>
          </div>
          <span className="login-badge">
            <img className="login-badge-logo" src={logo} alt="Logo Palmeraie" />
          </span>
        </div>

        <div className="login-body">
          <h2 className="login-title">Nouveau mot de passe</h2>
          <p className="login-subtitle" style={{ color: "#b45309" }}>
            Pour des raisons de securite, vous devez definir un nouveau mot de passe avant de continuer.
          </p>

          <form className="login-form" onSubmit={handleSubmit} autoComplete="off">
            <label>
              Mot de passe actuel
              <input
                type="password"
                className="login-input"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoFocus
                placeholder="Votre mot de passe actuel"
              />
            </label>

            <label>
              Nouveau mot de passe
              <input
                type="password"
                className="login-input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                placeholder="Au moins 6 caracteres"
              />
            </label>

            <label>
              Confirmer le mot de passe
              <input
                type="password"
                className="login-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="Repeter le nouveau mot de passe"
              />
            </label>

            <button className="btn-primary" type="submit" disabled={submitting}>
              {submitting ? "Enregistrement..." : "Enregistrer"}
            </button>
          </form>

          <p className="login-hint">
            <button
              type="button"
              style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", textDecoration: "underline", fontSize: "inherit" }}
              onClick={logout}
            >
              Se deconnecter
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
