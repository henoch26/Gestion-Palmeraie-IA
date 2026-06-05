/**
 * Gestion du mode hors ligne :
 *  - Stockage des fiches dans IndexedDB quand réseau absent
 *  - Synchronisation automatique au retour de la connexion
 */

const DB_NAME = "palmeraie-offline";
const DB_VERSION = 1;
const STORE_RECOLTES = "pending_recoltes";
const STORE_TRAVAUX = "pending_travaux";

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
    const tx = db.transaction(storeName, "readwrite");
    const req = tx.objectStore(storeName).add({ ...data, savedAt: Date.now() });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbDelete(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const req = tx.objectStore(storeName).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ── API publique ────────────────────────────────────────────────────────────

/** Sauvegarde une fiche récolte hors ligne. */
export async function saveRecolteOffline(payload) {
  await dbAdd(STORE_RECOLTES, payload);
}

/** Sauvegarde une fiche travaux hors ligne. */
export async function saveTravauxOffline(payload) {
  await dbAdd(STORE_TRAVAUX, payload);
}

/** Retourne le nombre de fiches en attente de synchronisation. */
export async function getPendingCount() {
  const r = await dbGetAll(STORE_RECOLTES);
  const t = await dbGetAll(STORE_TRAVAUX);
  return r.length + t.length;
}

/**
 * Synchronise toutes les fiches en attente vers l'API.
 * @param {function} apiPost - fonction de requête POST (ex: apiPost de axios.js)
 * @returns {{ synced: number, errors: number }}
 */
export async function syncPending(apiPost) {
  let synced = 0;
  let errors = 0;

  const recoltes = await dbGetAll(STORE_RECOLTES);
  for (const item of recoltes) {
    const { offlineId, savedAt, ...payload } = item;
    try {
      await apiPost("/recoltes/", payload);
      await dbDelete(STORE_RECOLTES, offlineId);
      synced++;
    } catch {
      errors++;
    }
  }

  const travaux = await dbGetAll(STORE_TRAVAUX);
  for (const item of travaux) {
    const { offlineId, savedAt, ...payload } = item;
    try {
      await apiPost("/travaux/", payload);
      await dbDelete(STORE_TRAVAUX, offlineId);
      synced++;
    } catch {
      errors++;
    }
  }

  return { synced, errors };
}
