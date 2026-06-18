import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useRecoltes } from "../context/RecoltesContext.jsx";
import NotificationBell from "./NotificationBell.jsx";
import logo from "../assets/logo.png";

// ── Icones SVG ───────────────────────────────────────────────────
function Ico({ size = 16, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" style={{ flexShrink: 0 }}>
      {children}
    </svg>
  );
}

const IcoGrid    = () => <Ico><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></Ico>;
const IcoBar     = () => <Ico><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></Ico>;
const IcoTrend   = () => <Ico><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></Ico>;
const IcoPie     = () => <Ico><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></Ico>;
const IcoClock   = () => <Ico><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></Ico>;
const IcoEdit    = () => <Ico><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></Ico>;
const IcoLeaf    = () => <Ico><path d="M17 8C8 10 5.9 16.17 3.82 19.76"/><path d="M21 3a22.34 22.34 0 0 1-2 7C16 17 12 21 3 21"/></Ico>;
const IcoTool    = () => <Ico><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></Ico>;
const IcoMap     = () => <Ico><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></Ico>;
const IcoPerson  = () => <Ico><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></Ico>;
const IcoUsers   = () => <Ico><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></Ico>;
const IcoBox     = () => <Ico><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></Ico>;
const IcoCheck   = () => <Ico><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></Ico>;
const IcoList    = () => <Ico><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></Ico>;
const IcoLogout  = () => <Ico><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></Ico>;
const IcoMenu    = () => <Ico size={20}><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></Ico>;
const IcoChevsL  = () => <Ico size={15}><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></Ico>;
const IcoChevsR  = () => <Ico size={15}><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></Ico>;

function ChevronIcon({ open }) {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0, transition: "transform 0.2s", transform: open ? "rotate(90deg)" : "none" }}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// ── Sections → routes pour auto-ouverture ────────────────────────
const SECTION_ROUTES = {
  dashboard:  ["/dashboard"],
  recoltes:   ["/recoltes"],
  travaux:    ["/travaux"],
  agents:     ["/agents"],
  ressources: ["/secteurs", "/recolteurs", "/materiels"],
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

// ── Lien simple ───────────────────────────────────────────────────
function SidebarLink({ to, label, icon: Icon, sub = false }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `sidebar-${sub ? "sublink" : "link"}${isActive ? " active" : ""}`}
      title={label}
    >
      {!sub && <span className="sidebar-ico"><Icon /></span>}
      <span className="sidebar-txt">{label}</span>
    </NavLink>
  );
}

// ── Lien avec onglet (?tab=xxx) ───────────────────────────────────
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

// ── Section collapsible ───────────────────────────────────────────
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

// ── Composant principal ───────────────────────────────────────────
export default function Sidebar({ isNavigating = false }) {
  const { user, isAdmin, isSuperviseur, hasPermission, logout } = useAuth();
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
      // déplier le menu et ouvrir la section cliquée
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

          {/* ── Dashboard ── */}
          <SidebarSection skey="dashboard" label="Dashboard" icon={IcoGrid} {...sp}>
            <TabLink pathname="/dashboard" tabKey="overview"   label="Vue d'ensemble" defaultTab="overview" />
            <TabLink pathname="/dashboard" tabKey="secteurs"   label="Secteurs"       defaultTab="overview" />
            <TabLink pathname="/dashboard" tabKey="financier"  label="Financier"      defaultTab="overview" />
            <TabLink pathname="/dashboard" tabKey="recolteurs" label="Recolteurs"     defaultTab="overview" />
          </SidebarSection>

          {/* ── Recoltes ── */}
          <SidebarSection skey="recoltes" label="Recoltes" icon={IcoLeaf} {...sp}>
            {!isAdmin && <TabLink pathname="/recoltes" tabKey="saisie" label="Saisie" defaultTab="saisie" />}
            <TabLink pathname="/recoltes" tabKey="analyses"   label="Analyses"   defaultTab={isAdmin ? "historique" : "saisie"} />
            <TabLink pathname="/recoltes" tabKey="historique" label="Historique" defaultTab={isAdmin ? "historique" : "saisie"}
              badge={!isAdmin ? pendingCount : 0}
            />
            <TabLink pathname="/recoltes" tabKey="ventes" label="Ventes" defaultTab={isAdmin ? "historique" : "saisie"} />
          </SidebarSection>

          {/* ── Travaux ── */}
          <SidebarSection skey="travaux" label="Travaux" icon={IcoTool} {...sp}>
            {!isAdmin && <TabLink pathname="/travaux" tabKey="saisie"     label="Saisie"     defaultTab="saisie" />}
            <TabLink pathname="/travaux" tabKey="historique" label="Historique" defaultTab={isAdmin ? "historique" : "saisie"} />
          </SidebarSection>

          {/* ── Agents terrain ── */}
          {hasPermission("gerer_agents") && (
            <SidebarSection skey="agents" label="Agents terrain" icon={IcoPerson} {...sp}>
              <SidebarLink to="/agents" label="Annuaire agents" icon={IcoPerson} sub />
            </SidebarSection>
          )}

          {/* ── Ressources — admin ou superviseur avec permission ── */}
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

          {/* ── Mon compte ── */}
          <SidebarSection skey="compte" label="Mon compte" icon={IcoPerson} {...sp}>
            <SidebarLink to="/profil" label="Mon profil" icon={IcoPerson} sub />
            {!isAdmin && <SidebarLink to="/mon-audit" label="Mes actions" icon={IcoList} sub />}
          </SidebarSection>

          {/* ── Clients (admin ou droit gerer_clients) ── */}
          {!isAdmin && hasPermission("gerer_clients") && (
            <SidebarSection skey="clients" label="Clients" icon={IcoUsers} {...sp}>
              <SidebarLink to="/clients" label="Gestion clients" icon={IcoUsers} sub />
            </SidebarSection>
          )}

          {/* ── Administration (admin) ── */}
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
              <span className={`role-badge role-badge--${isAdmin ? "admin" : "superviseur"}`}>
                {isAdmin ? "Admin" : "Superviseur"}
              </span>
              <NavLink to="/profil"
                className={({ isActive }) => `sidebar-username${isActive ? " active" : ""}`}
              >
                {user?.username || "—"}
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
