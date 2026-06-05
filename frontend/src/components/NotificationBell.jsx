import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getNotifications, markAllRead, markRead } from "../services/notificationService.js";

const POLL_INTERVAL = 30_000; // 30 secondes

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
  const [notifs, setNotifs] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await getNotifications();
      setNotifs(data.results || []);
      setUnread(data.unread_count || 0);
    } catch {
      // silencieux — ne pas perturber l'interface si l'API echoue
    }
  }, []);

  // Polling toutes les 30 secondes
  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [load]);

  // Fermer le dropdown si clic en dehors
  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleOpen = () => setOpen((v) => !v);

  const handleClickNotif = async (notif) => {
    if (!notif.lu) {
      await markRead(notif.id);
      setNotifs((prev) => prev.map((n) => n.id === notif.id ? { ...n, lu: true } : n));
      setUnread((v) => Math.max(0, v - 1));
    }
    setOpen(false);
    if (notif.lien) navigate(notif.lien);
  };

  const handleMarkAll = async () => {
    await markAllRead();
    setNotifs((prev) => prev.map((n) => ({ ...n, lu: true })));
    setUnread(0);
  };

  return (
    <div className="notif-bell-wrap" ref={dropdownRef}>
      <button className="notif-bell-btn" onClick={handleOpen} aria-label="Notifications">
        <span className="notif-bell-icon">&#128276;</span>
        {unread > 0 && (
          <span className="notif-badge">{unread > 99 ? "99+" : unread}</span>
        )}
      </button>

      {open && (
        <div className="notif-dropdown">
          <div className="notif-dropdown-header">
            <span>Notifications</span>
            {unread > 0 && (
              <button className="btn-link-small" onClick={handleMarkAll}>
                Tout marquer lu
              </button>
            )}
          </div>

          <div className="notif-list">
            {notifs.length === 0 ? (
              <p className="notif-empty">Aucune notification</p>
            ) : (
              notifs.map((n) => (
                <button
                  key={n.id}
                  className={`notif-item ${n.lu ? "notif-item--lu" : "notif-item--unread"}`}
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
        </div>
      )}
    </div>
  );
}
