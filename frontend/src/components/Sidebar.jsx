import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import NotificationBell from "./NotificationBell.jsx";
import logo from "../assets/logo.png";

export default function Sidebar({ isNavigating = false }) {
  const { user, isAdmin, isSuperviseur, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const navLink = (to, label) => (
    <NavLink to={to} className={({ isActive }) => (isActive ? "active" : "")}>
      {label}
    </NavLink>
  );

  return (
    <header className="topbar">
      {/* Logo / titre */}
      <div className="topbar-brand">
        <span className={`topbar-logo-wrap ${isNavigating ? "is-loading" : ""}`} aria-hidden="true">
          <img className="topbar-logo" src={logo} alt="" />
        </span>
        <span>Palmeraie</span>
      </div>

      {/* Navigation — filtrée par rôle */}
      <nav className="topbar-nav">
        {navLink("/dashboard", "Dashboard")}

        {/* Admin uniquement : vue globale des secteurs, récolteurs, exports */}
        {isAdmin && navLink("/secteurs", "Secteurs")}
        {isAdmin && navLink("/recolteurs", "Recolteurs")}

        {/* Les deux rôles peuvent accéder aux récoltes et travaux (filtrés côté API) */}
        {navLink("/recoltes", "Recoltes")}
        {navLink("/travaux", "Travaux")}

        {/* Admin uniquement : matériels, utilisateurs */}
        {isAdmin && navLink("/materiels", "Materiels")}
        {isAdmin && navLink("/utilisateurs", "Utilisateurs")}
      </nav>

      {/* Zone info utilisateur */}
      <div className="topbar-info">
        <NotificationBell />
        <span className={`role-badge role-badge--${isAdmin ? "admin" : "superviseur"}`}>
          {isAdmin ? "Admin" : "Superviseur"}
        </span>
        <NavLink to="/profil" className={({ isActive }) => `topbar-username ${isActive ? "active" : ""}`}>
          {user?.username || "—"}
        </NavLink>
        <button className="btn-ghost btn-mini" onClick={handleLogout}>
          Deconnexion
        </button>
      </div>
    </header>
  );
}
