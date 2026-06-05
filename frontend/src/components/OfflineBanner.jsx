import { useEffect, useRef, useState } from "react";
import { apiPost } from "../api/axios.js";
import { getPendingCount, syncPending } from "../utils/offline.js";

export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const syncDoneRef = useRef(false);

  // Suivi réseau
  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  // Comptage des fiches en attente
  useEffect(() => {
    getPendingCount().then(setPending).catch(() => {});
    const interval = setInterval(() => {
      getPendingCount().then(setPending).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Synchronisation automatique au retour de la connexion
  useEffect(() => {
    if (!isOffline && pending > 0 && !syncDoneRef.current) {
      syncDoneRef.current = true;
      setSyncing(true);
      syncPending(apiPost)
        .then(({ synced }) => {
          if (synced > 0) getPendingCount().then(setPending).catch(() => {});
        })
        .catch(() => {})
        .finally(() => {
          setSyncing(false);
          syncDoneRef.current = false;
        });
    }
    if (isOffline) syncDoneRef.current = false;
  }, [isOffline, pending]);

  if (!isOffline && pending === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: isOffline ? "#b91c1c" : "#d97706",
        color: "#fff",
        padding: "8px 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontSize: 14,
        fontWeight: 500,
      }}
    >
      <span style={{ fontSize: 18 }}>{isOffline ? "⚠️" : "🔄"}</span>
      {isOffline ? (
        <span>
          Mode hors ligne — les données saisies seront synchronisées à la reconnexion.
          {pending > 0 && ` (${pending} fiche(s) en attente)`}
        </span>
      ) : syncing ? (
        <span>Synchronisation en cours… ({pending} fiche(s))</span>
      ) : (
        <span>Connexion rétablie — {pending} fiche(s) synchronisée(s).</span>
      )}
    </div>
  );
}
