/**
 * api/axios.js — Client HTTP centralise pour toutes les requetes vers l'API Django.
 *
 * Toutes les vues doivent passer par ces fonctions plutot que d'appeler fetch()
 * directement. Elles gerent automatiquement :
 *   - L'injection du token d'authentification (DRF Token) dans les headers
 *   - Le Content-Type JSON (sauf pour FormData ou il est omis intentionnellement)
 *   - La deconnexion forcee si le serveur repond 401 (token revoque ou expire)
 *   - L'extraction du premier message d'erreur lisible depuis la reponse DRF
 *
 * Fonctions exportees :
 *   apiGet(path)              — GET
 *   apiPost(path, body)       — POST JSON
 *   apiPut(path, body)        — PUT JSON
 *   apiPatch(path, body)      — PATCH JSON
 *   apiDelete(path)           — DELETE
 *   apiPostMultipart(path, fd)— POST multipart/form-data
 *   apiPutMultipart(path, fd) — PUT multipart/form-data
 *
 * Configuration : definir VITE_API_URL dans frontend/.env (dev) ou
 * frontend/.env.production (prod). Defaut : http://127.0.0.1:8000/api
 */
import { getToken } from "../services/authService.js";

// URL de base de l'API, surchargeable via variable d'environnement Vite
const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";
const STORAGE_KEY = "palmeraie_auth";

/**
 * Fonction interne commune a tous les helpers exports.
 * Injecte le token, gere les erreurs reseau et HTTP, et deserialise le JSON.
 */
async function apiRequest(path, options = {}) {
  const token = getToken();
  // Pour FormData, ne pas forcer Content-Type : le navigateur ajoute
  // automatiquement le bon boundary multipart — l'ecraser casserait l'upload.
  const isFormData = options.body instanceof FormData;
  const headers = isFormData
    ? { ...(options.headers || {}) }
    : { "Content-Type": "application/json", ...(options.headers || {}) };

  if (token) {
    headers.Authorization = `Token ${token}`;
  }

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });
  } catch {
    throw new Error("Serveur indisponible");
  }

  // 401 avec session active = compte désactivé ou token révoqué → déconnexion forcée
  if (res.status === 401 && sessionStorage.getItem(STORAGE_KEY)) {
    sessionStorage.removeItem(STORAGE_KEY);
    window.location.href = "/login";
    return;
  }

  // 204: pas de contenu
  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const pickFirst = (obj) => {
      if (!obj || typeof obj !== "object") return "";
      const entries = Object.entries(obj);
      if (!entries.length) return "";
      const [, v] = entries[0];
      if (Array.isArray(v)) return String(v[0] ?? "");
      if (typeof v === "string") return v;
      if (v && typeof v === "object") return pickFirst(v);
      return String(v ?? "");
    };

    const message =
      data.detail ||
      data.error ||
      pickFirst(data) ||
      "Erreur serveur";
    throw new Error(message);
  }

  return data;
}

export const apiGet = (path) => apiRequest(path);
export const apiPost = (path, body) =>
  apiRequest(path, { method: "POST", body: JSON.stringify(body) });
export const apiPut = (path, body) =>
  apiRequest(path, { method: "PUT", body: JSON.stringify(body) });
export const apiPatch = (path, body) =>
  apiRequest(path, { method: "PATCH", body: JSON.stringify(body) });
export const apiDelete = (path) =>
  apiRequest(path, { method: "DELETE" });

// Requêtes multipart (FormData) — Content-Type géré automatiquement par le navigateur
export const apiPostMultipart = (path, formData) =>
  apiRequest(path, { method: "POST", body: formData });
export const apiPutMultipart = (path, formData) =>
  apiRequest(path, { method: "PUT", body: formData });
