/**
 * Sidebar.jsx Ã¢â‚¬â€ Navigation principale de l'application.
 *
 * Comportement :
 *   - Reduit/developpe (collapsed) avec preference persistee dans localStorage.
 *   - Sur mobile, s'ouvre en overlay via un bouton hamburger.
 *   - Les sections se referment/ouvrent automatiquement selon la route active.
 *   - L'affichage des sections est conditionne par le role et les permissions :
 *       isAdmin         Ã¢â€ â€™ toutes les sections visibles
 *       hasPermission() Ã¢â€ â€™ sections Ressources, Agents, Clients filtrees
 *
 * Composants internes :
 *   SidebarSection   Ã¢â‚¬â€ Section collapsible avec bouton toggle
 *   SidebarLink      Ã¢â‚¬â€ Lien NavLink simple (highlight sur route active)
 *   TabLink          Ã¢â‚¬â€ Lien vers un onglet (?tab=xxx) de la meme page
 */
import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, BrainCircuit, TrendingUp, AlertTriangle, Leaf, Wrench,
  Map, User, Users, Package, CircleCheck, ClipboardList, LogOut, Menu,
  ChevronsLeft, ChevronsRight, ChevronRight, Cpu,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useRecoltes } from "../context/RecoltesContext.jsx";
import NotificationBell from "./NotificationBell.jsx";
import logo from "../assets/logo.png";

// â”€â”€ Icones SVG â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const IcoGrid   = (props) => <LayoutDashboard size={16} {...props} />;
const IcoBar    = (props) => <BrainCircuit size={16} {...props} />;
const IcoTrend  = (props) => <TrendingUp size={16} {...props} />;
const IcoPie    = (props) => <AlertTriangle size={16} {...props} />;
const IcoLeaf   = (props) => <Leaf size={16} {...props} />;
const IcoTool   = (props) => <Wrench size={16} {...props} />;
const IcoMap    = (props) => <Map size={16} {...props} />;
const IcoPerson = (props) => <User size={16} {...props} />;
const IcoUsers  = (props) => <Users size={16} {...props} />;
const IcoBox    = (props) => <Package size={16} {...props} />;
const IcoCheck  = (props) => <CircleCheck size={16} {...props} />;
const IcoList   = (props) => <ClipboardList size={16} {...props} />;
const IcoLogout = (props) => <LogOut size={16} {...props} />;
const IcoMenu   = (props) => <Menu size={20} {...props} />;
const IcoChevsL = (props) => <ChevronsLeft size={15} {...props} />;
const IcoChevsR = (props) => <ChevronsRight size={15} {...props} />;
const IcoCpu    = (props) => <Cpu size={16} {...props} />;

function ChevronIcon({ open }) {
  return (
    <ChevronRight
      size={12}
      strokeWidth={2.5}
      style={{ flexShrink: 0, transition: "transform 0.2s", transform: open ? "rotate(90deg)" : "none" }}
    />
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Sections Ã¢â€ â€™ routes pour auto-ouverture Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const SECTION_ROUTES = {
  dashboard:  ["/dashboard"],
  recoltes:   ["/recoltes"],
  travaux:    ["/travaux"],
  agents:     ["/agents"],
  ressources: ["/secteurs", "/recolteurs", "/materiels"],
  ia:         ["/ia"],
  admin:      ["/utilisateurs", "/clients", "/parametre-bonus", "/journal-audit"],
  compte:     ["/profil", "/mon-audit"],
};

function initOpen(pathname) {
  return Object.fromEntries(
    Object.entries(SECTION_ROUTES).map(([k, routes]) => [
      k, routes.some((r) => pathname.startsWith(r)),
    ])
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Lien simple Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function SidebarLink({ to, label, icon: Icon, sub = false, end = false }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `sidebar-${sub ? "sublink" : "link"}${isActive ? " active" : ""}`}
      title={label}
    >
      {!sub && <span className="sidebar-ico"><Icon /></span>}
      <span className="sidebar-txt">{label}</span>
    </NavLink>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Lien avec onglet (?tab=xxx) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function TabLink({ pathname, tabKey, label, defaultTab, badge = 0 }) {
  const { pathname: loc, search } = useLocation();
  const currentTab = new URLSearchParams(search).get("tab");
  const isActive =
    loc === pathname &&
    (currentTab === tabKey || (!currentTab && tabKey === defaultTab));
  return (
    <Link
      to={`${pathname}?tab=${tabKey}`}
      className={`sidebar-sublink${isActive ? " active" : ""}`}
      title={label}
    >
      <span className="sidebar-txt">{label}</span>
      {badge > 0 && (
        <span style={{
          marginLeft: 6,
          background: "#f57f17",
          color: "#fff",
          borderRadius: 10,
          padding: "1px 7px",
          fontSize: 11,
          fontWeight: 700,
          lineHeight: 1.5,
          flexShrink: 0,
        }}>
          {badge}
        </span>
      )}
    </Link>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Section collapsible Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function SidebarSection({ skey, label, icon: Icon, openSections, onToggle, children }) {
  const isOpen = openSections[skey] ?? false;
  return (
    <div className="sidebar-section">
      <button
        className="sidebar-section-btn"
        onClick={() => onToggle(skey)}
        title={label}
        aria-expanded={isOpen}
      >
        <span className="sidebar-ico"><Icon /></span>
        <span className="sidebar-txt">{label}</span>
        <span className="sidebar-chevron"><ChevronIcon open={isOpen} /></span>
      </button>
      <div className={`sidebar-section-items${isOpen ? " open" : ""}`}>
        {children}
      </div>
    </div>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Composant principal Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
export default function Sidebar({ isNavigating = false }) {
  const { user, role, isAdmin, isSuperviseur, isIARole, hasPermission, logout } = useAuth();
  const { pendingCount } = useRecoltes();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("sidebar-collapsed") === "true"
  );
  const [open, setOpen] = useState(() => initOpen(pathname));
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setOpen((prev) => {
      const next = { ...prev };
      for (const [k, routes] of Object.entries(SECTION_ROUTES)) {
        if (routes.some((r) => pathname.startsWith(r))) next[k] = true;
      }
      return next;
    });
    setMobileOpen(false);
  }, [pathname]);

  const toggleCollapsed = () =>
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });

  const handleSectionClick = (k) => {
    if (collapsed) {
      // dÃƒÂ©plier le menu et ouvrir la section cliquÃƒÂ©e
      setCollapsed(false);
      localStorage.setItem("sidebar-collapsed", "false");
      setOpen((prev) => ({ ...prev, [k]: true }));
    } else {
      setOpen((prev) => ({ ...prev, [k]: !prev[k] }));
    }
  };

  const handleLogout = () => { logout(); navigate("/login"); };

  const sp = { openSections: open, collapsed, onToggle: handleSectionClick };

  return (
    <>
      <button className="sidebar-mobile-btn" onClick={() => setMobileOpen(true)} aria-label="Menu">
        <IcoMenu />
      </button>

      {mobileOpen && (
        <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />
      )}

      <aside className={`sidebar${collapsed ? " collapsed" : ""}${mobileOpen ? " mobile-open" : ""}`}>

        {/* Brand */}
        <div className="sidebar-brand">
          <span className={`sidebar-logo-wrap${isNavigating ? " is-loading" : ""}`}>
            <img className="sidebar-logo" src={logo} alt="" />
          </span>
          <span className="sidebar-brand-txt">Palmeraie</span>
          <button className="sidebar-toggle" onClick={toggleCollapsed}
            title={collapsed ? "Developper" : "Reduire"}>
            {collapsed ? <IcoChevsR /> : <IcoChevsL />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">

          {/* Ã¢â€â‚¬Ã¢â€â‚¬ Dashboard Ã¢â€â‚¬Ã¢â€â‚¬ */}
          <SidebarSection skey="dashboard" label="Dashboard" icon={IcoGrid} {...sp}>
            <TabLink pathname="/dashboard" tabKey="overview"   label="Vue d'ensemble" defaultTab="overview" />
            <TabLink pathname="/dashboard" tabKey="secteurs"   label="Secteurs"       defaultTab="overview" />
            <TabLink pathname="/dashboard" tabKey="financier"  label="Financier"      defaultTab="overview" />
            <TabLink pathname="/dashboard" tabKey="recolteurs" label="Recolteurs"     defaultTab="overview" />
          </SidebarSection>

          {/* Ã¢â€â‚¬Ã¢â€â‚¬ Recoltes Ã¢â€â‚¬Ã¢â€â‚¬ */}
          <SidebarSection skey="recoltes" label="Recoltes" icon={IcoLeaf} {...sp}>
            {!isAdmin && <TabLink pathname="/recoltes" tabKey="saisie" label="Saisie" defaultTab="saisie" />}
            <TabLink pathname="/recoltes" tabKey="analyses"   label="Analyses"   defaultTab={isAdmin ? "historique" : "saisie"} />
            <TabLink pathname="/recoltes" tabKey="historique" label="Historique" defaultTab={isAdmin ? "historique" : "saisie"}
              badge={!isAdmin ? pendingCount : 0}
            />
            <TabLink pathname="/recoltes" tabKey="ventes" label="Ventes" defaultTab={isAdmin ? "historique" : "saisie"} />
          </SidebarSection>

          {/* Ã¢â€â‚¬Ã¢â€â‚¬ Travaux Ã¢â€â‚¬Ã¢â€â‚¬ */}
          <SidebarSection skey="travaux" label="Travaux" icon={IcoTool} {...sp}>
            {!isAdmin && <TabLink pathname="/travaux" tabKey="saisie"     label="Saisie"     defaultTab="saisie" />}
            <TabLink pathname="/travaux" tabKey="historique" label="Historique" defaultTab={isAdmin ? "historique" : "saisie"} />
          </SidebarSection>

          {/* Ã¢â€â‚¬Ã¢â€â‚¬ Agents terrain Ã¢â€â‚¬Ã¢â€â‚¬ */}
          {hasPermission("gerer_agents") && (
            <SidebarSection skey="agents" label="Agents terrain" icon={IcoPerson} {...sp}>
              <SidebarLink to="/agents" label="Annuaire agents" icon={IcoPerson} sub />
            </SidebarSection>
          )}

          {/* Ã¢â€â‚¬Ã¢â€â‚¬ Ressources Ã¢â‚¬â€ admin ou superviseur avec permission Ã¢â€â‚¬Ã¢â€â‚¬ */}
          {(isAdmin || hasPermission("consulter_secteur") || hasPermission("gerer_recolteurs") || hasPermission("gerer_materiels")) && (
            <SidebarSection skey="ressources" label="Ressources" icon={IcoMap} {...sp}>
              {(isAdmin || hasPermission("consulter_secteur")) && (
                <SidebarLink to="/secteurs" label="Secteurs" icon={IcoMap} sub />
              )}
              {(isAdmin || hasPermission("gerer_recolteurs")) && (
                <SidebarLink to="/recolteurs" label="Personnel" icon={IcoPerson} sub />
              )}
              {(isAdmin || hasPermission("gerer_materiels")) && (
                <SidebarLink to="/materiels" label="Materiels" icon={IcoBox} sub />
              )}
            </SidebarSection>
          )}

          {/* Intelligence Artificielle */}
          {isIARole && (
            <SidebarSection skey="ia" label="Centre d'Intelligence Artificielle" icon={IcoBar} {...sp}>
              <SidebarLink to="/ia" label="Centre decisionnel" icon={IcoGrid} sub end />
              <SidebarLink to="/ia/predictions" label="Historique predictions" icon={IcoTrend} sub />
              <SidebarLink to="/ia/anomalies" label="Anomalies" icon={IcoPie} sub />
              <SidebarLink to="/ia/prescriptions" label="Plans IA" icon={IcoCheck} sub />
              {isAdmin && <SidebarLink to="/ia/modeles" label="Modeles" icon={IcoCpu} sub />}
            </SidebarSection>
          )}
          {/* Ã¢â€â‚¬Ã¢â€â‚¬ Mon compte Ã¢â€â‚¬Ã¢â€â‚¬ */}
          <SidebarSection skey="compte" label="Mon compte" icon={IcoPerson} {...sp}>
            <SidebarLink to="/profil" label="Mon profil" icon={IcoPerson} sub />
            {!isAdmin && <SidebarLink to="/mon-audit" label="Mes actions" icon={IcoList} sub />}
          </SidebarSection>

          {/* Ã¢â€â‚¬Ã¢â€â‚¬ Clients (admin ou droit gerer_clients) Ã¢â€â‚¬Ã¢â€â‚¬ */}
          {!isAdmin && hasPermission("gerer_clients") && (
            <SidebarSection skey="clients" label="Clients" icon={IcoUsers} {...sp}>
              <SidebarLink to="/clients" label="Gestion clients" icon={IcoUsers} sub />
            </SidebarSection>
          )}

          {/* Ã¢â€â‚¬Ã¢â€â‚¬ Administration (admin) Ã¢â€â‚¬Ã¢â€â‚¬ */}
          {isAdmin && (
            <SidebarSection skey="admin" label="Administration" icon={IcoUsers} {...sp}>
              <SidebarLink to="/utilisateurs" label="Utilisateurs" icon={IcoUsers} sub />
              <SidebarLink to="/clients" label="Clients" icon={IcoUsers} sub />
              <SidebarLink to="/parametre-bonus" label="Parametres" icon={IcoCheck} sub />
              <SidebarLink to="/journal-audit" label="Journal d'audit" icon={IcoList} sub />
            </SidebarSection>
          )}

        </nav>

        {/* Pied de page */}
        <div className="sidebar-footer">
          <div className="sidebar-footer-row">
            <NotificationBell />
            <span className="sidebar-footer-meta">
              <span className={`role-badge role-badge--${role || "utilisateur"}`}>
                {user?.role_display || (isAdmin ? "Admin" : "Utilisateur")}
              </span>
              <NavLink to="/profil"
                className={({ isActive }) => `sidebar-username${isActive ? " active" : ""}`}
              >
                {user?.username || "Ã¢â‚¬â€"}
              </NavLink>
            </span>
            <button className="sidebar-logout-icon" onClick={handleLogout} title="Deconnexion">
              <IcoLogout />
            </button>
          </div>
          <button className="sidebar-logout-full" onClick={handleLogout}>
            Deconnexion
          </button>
        </div>

      </aside>
    </>
  );
}
