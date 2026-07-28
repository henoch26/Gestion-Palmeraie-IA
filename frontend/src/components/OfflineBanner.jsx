/**
 * Bandeau persistant affiché :
 *  - En rouge quand le navigateur est hors ligne
 *  - En orange pendant la synchronisation des fiches en attente
 *  - En rouge foncé si la synchronisation a échoué partiellement
 *
 * syncPending() gère son propre token (stocké dans IndexedDB avec chaque fiche),
 * donc la sync fonctionne même si la session sessionStorage a expiré.
 */
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, XCircle, RefreshCw } from "lucide-react";
import { getPendingCount, syncPending } from "../utils/offline.js";

export default function OfflineBanner() {
  const [isOffline,   setIsOffline]   = useState(!navigator.onLine);
  const [pending,     setPending]     = useState(0);
  const [syncing,     setSyncing]     = useState(false);
  const [syncErrors,  setSyncErrors]  = useState(0);
  const [failedItems, setFailedItems] = useState([]);
  const syncDoneRef = useRef(false);

  // Suivi de la connectivité
  useEffect(() => {
    const goOffline = () => { setIsOffline(true);  setSyncErrors(0); setFailedItems([]); };
    const goOnline  = () =>   setIsOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online",  goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online",  goOnline);
    };
  }, []);

  // Sondage du nombre de fiches en attente
  useEffect(() => {
    getPendingCount().then(setPending).catch(() => {});
    const interval = setInterval(() => {
      getPendingCount().then(setPending).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Synchronisation automatique au retour en ligne
  useEffect(() => {
    if (!isOffline && pending > 0 && !syncDoneRef.current) {
      syncDoneRef.current = true;
      setSyncing(true);
      setSyncErrors(0);
      setFailedItems([]);

      syncPending()
        .then(({ synced, errors, failedItems: failed }) => {
          if (synced > 0) getPendingCount().then(setPending).catch(() => {});
          if (errors > 0) {
            setSyncErrors(errors);
            setFailedItems(failed);
          }
        })
        .catch(() => {
          setSyncErrors(1);
          setFailedItems([{ type: "inconnu", error: "Erreur réseau inattendue" }]);
        })
        .finally(() => {
          setSyncing(false);
          syncDoneRef.current = false;
        });
    }
    if (isOffline) syncDoneRef.current = false;
  }, [isOffline, pending]);

  if (!isOffline && pending === 0 && syncErrors === 0) return null;

  const bg = isOffline ? "#b91c1c" : syncErrors > 0 ? "#7f1d1d" : "#d97706";

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999,
      background: bg, color: "#fff",
      padding: "8px 16px",
      fontSize: 14, fontWeight: 500,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ display: "flex", alignItems: "center" }}>
          {isOffline ? <AlertTriangle size={18} /> : syncErrors > 0 ? <XCircle size={18} /> : <RefreshCw size={18} />}
        </span>

        {isOffline ? (
          <span>
            Mode hors ligne — les données saisies seront synchronisées à la reconnexion.
            {pending > 0 && ` (${pending} fiche(s) en attente)`}
          </span>
        ) : syncing ? (
          <span>Synchronisation en cours… ({pending} fiche(s))</span>
        ) : syncErrors > 0 ? (
          <span>
            Synchronisation partielle — {syncErrors} fiche(s) n'ont pas pu être envoyées.
            {pending > 0 && ` (${pending} fiche(s) toujours en attente)`}
          </span>
        ) : (
          <span>Connexion rétablie — fiches synchronisées avec succès.</span>
        )}
      </div>

      {syncErrors > 0 && failedItems.length > 0 && (
        <ul style={{ margin: "6px 0 0 30px", padding: 0, fontSize: 12, opacity: 0.9 }}>
          {failedItems.map((item, i) => (
            <li key={i}>Fiche {item.type} — {item.error}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
