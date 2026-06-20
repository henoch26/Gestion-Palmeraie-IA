/**
 * Gestion du mode hors ligne :
 *  - Stockage des fiches dans IndexedDB quand réseau absent
 *  - Le token d'authentification est sauvegardé avec chaque fiche
 *    pour que la synchronisation fonctionne même si la session
 *    sessionStorage a expiré (fermeture du navigateur entre-temps)
 *  - Synchronisation automatique au retour de la connexion
 */

const DB_NAME    = "palmeraie-offline";
const DB_VERSION = 1;
const STORE_RECOLTES = "pending_recoltes";
const STORE_TRAVAUX  = "pending_travaux";

const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";

// ── Ouverture / initialisation de la base ──────────────────────────────────

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_RECOLTES)) {
        db.createObjectStore(STORE_RECOLTES, { keyPath: "offlineId", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORE_TRAVAUX)) {
        db.createObjectStore(STORE_TRAVAUX, { keyPath: "offlineId", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbAdd(storeName, data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(storeName, "readwrite");
    const req = tx.objectStore(storeName).add({ ...data, savedAt: Date.now() });
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function dbGetAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function dbDelete(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(storeName, "readwrite");
    const req = tx.objectStore(storeName).delete(key);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

/**
 * Envoie un payload vers l'API en utilisant le token stocké hors ligne.
 * N'utilise pas apiPost() pour éviter de dépendre de sessionStorage.
 */
async function postWithStoredToken(endpoint, payload, token) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Token ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Erreur HTTP ${res.status}`);
  }
  return res.json().catch(() => ({}));
}

// ── API publique ────────────────────────────────────────────────────────────

/**
 * Sauvegarde une fiche récolte hors ligne.
 * @param {object} payload - données de la fiche
 * @param {string|null} token - token DRF de l'utilisateur courant
 */
export async function saveRecolteOffline(payload, token = null) {
  await dbAdd(STORE_RECOLTES, { ...payload, _auth_token: token });
}

/**
 * Sauvegarde une fiche travaux hors ligne.
 * @param {object} payload - données de la fiche
 * @param {string|null} token - token DRF de l'utilisateur courant
 */
export async function saveTravauxOffline(payload, token = null) {
  await dbAdd(STORE_TRAVAUX, { ...payload, _auth_token: token });
}

/** Retourne le nombre de fiches en attente de synchronisation. */
export async function getPendingCount() {
  const r = await dbGetAll(STORE_RECOLTES);
  const t = await dbGetAll(STORE_TRAVAUX);
  return r.length + t.length;
}

/**
 * Synchronise toutes les fiches en attente vers l'API.
 * Utilise le token stocké dans IndexedDB pour chaque fiche,
 * ce qui permet la sync même si la session sessionStorage a expiré.
 *
 * @returns {{ synced: number, errors: number, failedItems: Array }}
 */
export async function syncPending() {
  let synced = 0;
  let errors = 0;
  const failedItems = [];

  const recoltes = await dbGetAll(STORE_RECOLTES);
  for (const item of recoltes) {
    const { offlineId, savedAt, _auth_token, ...payload } = item;
    try {
      await postWithStoredToken("/recoltes/", payload, _auth_token);
      await dbDelete(STORE_RECOLTES, offlineId);
      synced++;
    } catch (err) {
      errors++;
      failedItems.push({ type: "récolte", error: err.message });
    }
  }

  const travaux = await dbGetAll(STORE_TRAVAUX);
  for (const item of travaux) {
    const { offlineId, savedAt, _auth_token, ...payload } = item;
    try {
      await postWithStoredToken("/travaux/", payload, _auth_token);
      await dbDelete(STORE_TRAVAUX, offlineId);
      synced++;
    } catch (err) {
      errors++;
      failedItems.push({ type: "travaux", error: err.message });
    }
  }

  return { synced, errors, failedItems };
}
