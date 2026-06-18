import { getToken } from "../services/authService.js";

// Base URL API (configurable via .env)
const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";
const STORAGE_KEY = "palmeraie_auth";

// Helper pour les requetes HTTP
async function apiRequest(path, options = {}) {
  const token = getToken();
  // Ne pas forcer Content-Type pour FormData (le navigateur le gère avec le boundary)
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
