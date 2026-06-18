import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { resetPassword } from "../../services/authService.js";
import logo from "../../assets/logo.png";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!password) { setError("Veuillez saisir un nouveau mot de passe."); return; }
    if (password.length < 6) { setError("Le mot de passe doit contenir au moins 6 caractères."); return; }
    if (password !== confirm) { setError("Les mots de passe ne correspondent pas."); return; }
    if (!token) { setError("Lien invalide. Refaites une demande de réinitialisation."); return; }

    setSubmitting(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err.message || "Lien invalide ou expiré.");
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
            <div className="login-banner-subtitle">Nouveau mot de passe</div>
          </div>
          <span className="login-badge">
            <img className="login-badge-logo" src={logo} alt="Logo Palmeraie" />
          </span>
        </div>

        <div className="login-body">
          {!token ? (
            <div style={{ textAlign: "center" }}>
              <p style={{ color: "#c62828", marginBottom: 16 }}>Lien invalide ou manquant.</p>
              <Link to="/forgot-password" className="btn-primary" style={{ display: "inline-block", textDecoration: "none", padding: "10px 24px" }}>
                Faire une nouvelle demande
              </Link>
            </div>
          ) : done ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
              <h2 className="login-title" style={{ marginBottom: 8 }}>Mot de passe modifié</h2>
              <p style={{ color: "#555", fontSize: 14, marginBottom: 24 }}>
                Votre mot de passe a été réinitialisé avec succès. Vous pouvez vous connecter.
              </p>
              <Link to="/login" className="btn-primary" style={{ display: "inline-block", textDecoration: "none", padding: "10px 24px" }}>
                Se connecter
              </Link>
            </div>
          ) : (
            <>
              <h2 className="login-title">Nouveau mot de passe</h2>
              <p className="login-subtitle">Choisissez un mot de passe sécurisé (min. 6 caractères).</p>

              <form className="login-form" onSubmit={handleSubmit}>
                <label>
                  Nouveau mot de passe
                  <input
                    type="password"
                    className="login-input"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(""); }}
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                </label>
                <label>
                  Confirmer le mot de passe
                  <input
                    type="password"
                    className="login-input"
                    value={confirm}
                    onChange={(e) => { setConfirm(e.target.value); setError(""); }}
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                </label>

                {error && (
                  <p style={{ color: "#c62828", fontSize: 13, margin: "-4px 0 8px" }}>{error}</p>
                )}

                <button className="btn-primary" type="submit" disabled={submitting}>
                  {submitting ? "Enregistrement..." : "Enregistrer le mot de passe"}
                </button>
              </form>

              <p style={{ textAlign: "center", marginTop: 16, fontSize: 13 }}>
                <Link to="/login" style={{ color: "#1f4e79", textDecoration: "none", fontWeight: 600 }}>
                  ← Retour à la connexion
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
