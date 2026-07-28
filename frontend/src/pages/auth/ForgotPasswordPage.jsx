import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail } from "lucide-react";
import { forgotPassword } from "../../services/authService.js";
import logo from "../../assets/logo.png";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) { setError("Veuillez saisir votre identifiant ou email."); return; }
    setError("");
    setSubmitting(true);
    try {
      await forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(err.message || "Une erreur est survenue.");
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
            <div className="login-banner-subtitle">Réinitialisation du mot de passe</div>
          </div>
          <span className="login-badge">
            <img className="login-badge-logo" src={logo} alt="Logo Palmeraie" />
          </span>
        </div>

        <div className="login-body">
          {sent ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}><Mail size={48} color="#1565c0" /></div>
              <h2 className="login-title" style={{ marginBottom: 8 }}>Email envoyé</h2>
              <p style={{ color: "#555", fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
                Si un compte correspond à cet identifiant, un email contenant un lien de
                réinitialisation a été envoyé. Vérifiez votre boite mail (et les spams).
              </p>
              <p style={{ color: "#888", fontSize: 13, marginBottom: 20 }}>
                Le lien est valable <strong>1 heure</strong>.
              </p>
              <Link to="/login" className="btn-primary" style={{ display: "inline-block", textDecoration: "none", padding: "10px 24px" }}>
                Retour à la connexion
              </Link>
            </div>
          ) : (
            <>
              <h2 className="login-title">Mot de passe oublié ?</h2>
              <p className="login-subtitle">
                Saisissez votre identifiant ou email. Vous recevrez un lien pour réinitialiser votre mot de passe.
              </p>

              <form className="login-form" onSubmit={handleSubmit}>
                <label>
                  Identifiant ou email
                  <input
                    className="login-input"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(""); }}
                    placeholder="ex : admin ou admin@exemple.com"
                    autoComplete="username email"
                  />
                </label>

                {error && (
                  <p style={{ color: "#c62828", fontSize: 13, margin: "-4px 0 8px" }}>{error}</p>
                )}

                <button className="btn-primary" type="submit" disabled={submitting}>
                  {submitting ? "Envoi en cours..." : "Envoyer le lien"}
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
