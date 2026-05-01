import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import logo from "../assets/logo.png";

// Barre de navigation en haut pour gagner de l'espace
export default function Sidebar({ isNavigating = false }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <header className="topbar">
      {/* Logo / titre */}
      <div className="topbar-brand">
        <span className={`topbar-logo-wrap ${isNavigating ? "is-loading" : ""}`} aria-hidden="true">
          <img className="topbar-logo" src={logo} alt="" />
        </span>
        <span>Palmeraie</span>
      </div>

      {/* Navigation principale */}
      <nav className="topbar-nav">
        <NavLink to="/dashboard" className={({ isActive }) => (isActive ? "active" : "")}>Dashboard</NavLink>
        <NavLink to="/secteurs" className={({ isActive }) => (isActive ? "active" : "")}>Secteurs</NavLink>
        <NavLink to="/recolteurs" className={({ isActive }) => (isActive ? "active" : "")}>Recolteurs</NavLink>
        <NavLink to="/recoltes" className={({ isActive }) => (isActive ? "active" : "")}>Recoltes</NavLink>
        <NavLink to="/travaux" className={({ isActive }) => (isActive ? "active" : "")}>Travaux</NavLink>
        <NavLink to="/materiels" className={({ isActive }) => (isActive ? "active" : "")}>Materiels</NavLink>
      </nav>

      {/* Zone info (placeholder) */}
      <div className="topbar-info">
        <span>{user?.username || "Admin"}</span>
        <button className="btn-ghost btn-mini" onClick={handleLogout}>
          Deconnexion
        </button>
      </div>
    </header>
  );
}
