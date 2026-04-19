import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import logo from "../../assets/logo.png";
import LogoLoader from "../../components/LogoLoader.jsx";

// Page de connexion (mock)
export default function LoginPage() {
  const { login } = useAuth();
  const { pushToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  // Etat du formulaire
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const transitionTimerRef = useRef(null);

  // Route de redirection apres login
  const from = location.state?.from?.pathname || "/dashboard";

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      await login({ username, password });
      // Petite animation de transition vers le dashboard (pour mieux la voir)
      setTransitioning(true);
      transitionTimerRef.current = setTimeout(() => {
        navigate(from, { replace: true });
      }, 2600);
    } catch (err) {
      pushToast({
        type: "error",
        title: "Connexion",
        message: err.message || "Erreur de connexion",
        duration: 3500,
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (transitioning) {
    return (
      <div className="login-page">
        <div className="login-transition-card">
          <LogoLoader label="Ouverture du dashboard..." size={120} />
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-banner">
          <div className="login-banner-content">
            <div className="login-banner-title">Palmeraie</div>
            <div className="login-banner-subtitle">Suivi des recoltes et travaux</div>
          </div>

          <span className="login-badge">
            <img className="login-badge-logo" src={logo} alt="Logo Palmeraie" />
          </span>
        </div>

        <div className="login-body">
          <h2 className="login-title">Connexion</h2>
          <p className="login-subtitle">Acces securise au tableau de bord</p>

          <form className="login-form" onSubmit={handleSubmit}>
            <label>
              Identifiant
              <input
                className="login-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
              />
            </label>
            <label>
              Mot de passe
              <input
                type="password"
                className="login-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="admin"
              />
            </label>

            <button className="btn-primary" type="submit" disabled={submitting}>
              {submitting ? "Connexion..." : "Se connecter"}
            </button>
          </form>

          <p className="login-hint">Utilise ton compte Django (superuser)</p>
        </div>
      </div>
    </div>
  );
}
