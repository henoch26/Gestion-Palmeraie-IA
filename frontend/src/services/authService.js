// Service d'authentification (API backend)

const STORAGE_KEY = "palmeraie_auth";
const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";

// Lecture locale des infos auth
export function getStoredAuth() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Connexion via API
export async function login({ username, password }) {
  if (!username || !password) {
    throw new Error("Identifiants requis");
  }

  const res = await fetch(`${API_BASE}/auth/login/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || "Erreur de connexion");
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  return data;
}

// Deconnexion
export function logout() {
  localStorage.removeItem(STORAGE_KEY);
}

// Token (utile pour les futurs appels API)
export function getToken() {
  const stored = getStoredAuth();
  return stored?.token || null;
}
