import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { getNotifications, markAllRead, markRead } from "../services/notificationService.js";

const POLL_INTERVAL = 30_000;

const TYPE_COLORS = {
  success: "#2e7d32",
  warning: "#b45309",
  info: "#1976d2",
};

function timeAgo(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "A l instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  return `Il y a ${Math.floor(hours / 24)} j`;
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const bellRef = useRef(null);
  const dropdownRef = useRef(null);
  const [notifs, setNotifs] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const load = useCallback(async () => {
    try {
      const data = await getNotifications();
      setNotifs(data.results || []);
      setUnread(data.unread_count || 0);
    } catch {
      // silencieux
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [load]);

  // Fermer si clic en dehors du dropdown ET du bouton
  useEffect(() => {
    const handleClick = (e) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        bellRef.current && !bellRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleOpen = () => {
    if (!open && bellRef.current) {
      const rect = bellRef.current.getBoundingClientRect();
      setPos({
        top: rect.top,
        left: rect.right + 8,
      });
    }
    setOpen((v) => !v);
  };

  const handleClickNotif = async (notif) => {
    setOpen(false);
    if (!notif.lu) {
      markRead(notif.id).then(load);
    }
    if (notif.lien) navigate(notif.lien);
  };

  const handleMarkAll = async () => {
    setOpen(false);
    await markAllRead();
    load();
  };

  const dropdown = open && createPortal(
    <div
      ref={dropdownRef}
      className="notif-dropdown"
      style={{
        position: "fixed",
        top: Math.max(8, pos.top - 300),
        left: pos.left,
        zIndex: 9999,
      }}
    >
      <div className="notif-dropdown-header">
        <span>Notifications</span>
        {unread > 0 && (
          <button className="btn-link-small" onClick={handleMarkAll}>
            Tout marquer lu
          </button>
        )}
      </div>
      <div className="notif-list">
        {notifs.filter((n) => !n.lu).length === 0 ? (
          <p className="notif-empty">Aucune nouvelle notification</p>
        ) : (
          notifs.filter((n) => !n.lu).map((n) => (
            <button
              key={n.id}
              className="notif-item notif-item--unread"
              onClick={() => handleClickNotif(n)}
            >
              <span
                className="notif-dot"
                style={{ background: TYPE_COLORS[n.type] || "#666" }}
              />
              <span className="notif-item-content">
                <span className="notif-message">{n.message}</span>
                <span className="notif-time">{timeAgo(n.created_at)}</span>
              </span>
            </button>
          ))
        )}
      </div>
    </div>,
    document.body
  );

  return (
    <div className="notif-bell-wrap" ref={bellRef}>
      <button className="notif-bell-btn" onClick={handleOpen} aria-label="Notifications">
        <span className="notif-bell-icon"><Bell size={18} /></span>
        {unread > 0 && (
          <span className="notif-badge">{unread > 99 ? "99+" : unread}</span>
        )}
      </button>
      {dropdown}
    </div>
  );
}
