/**
 * authService.js — Gestion de la session utilisateur (login, logout, token).
 *
 * La session est stockee dans sessionStorage (cle "palmeraie_auth") sous la forme :
 *   { token: "...", user: { id, username, role, permissions, ... } }
 *
 * sessionStorage a ete choisi plutot que localStorage pour que la session
 * expire automatiquement a la fermeture du navigateur (securite).
 *
 * Fonctions exportees :
 *   getStoredAuth()          — Lecture de la session courante (ou null)
 *   login(credentials)       — Appel POST /auth/login/ + stockage du token
 *   logout()                 — Suppression de la session
 *   getToken()               — Raccourci pour recuperer le token seul
 *   updateProfile(data)      — PATCH /auth/profile/
 *   updateStoredAuth(data)   — Met a jour sessionStorage sans appel API
 *   forgotPassword(email)    — POST /auth/forgot-password/
 *   resetPassword(tok, pwd)  — POST /auth/reset-password/
 *   refreshMe()              — GET /auth/me/ pour rafraichir permissions/role
 *   changePassword({...})    — POST /auth/change-password/
 */

const STORAGE_KEY = "palmeraie_auth";
const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";

// Lecture locale des infos auth
export function getStoredAuth() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
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

  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  return data;
}

// Deconnexion
export function logout() {
  sessionStorage.removeItem(STORAGE_KEY);
}

// Token (utile pour les futurs appels API)
export function getToken() {
  const stored = getStoredAuth();
  return stored?.token || null;
}

// Mise à jour du profil (prénom, nom, email, téléphone)
export async function updateProfile(data) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/auth/profile/`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Token ${token}`,
    },
    body: JSON.stringify(data),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.detail || "Erreur lors de la mise à jour du profil");
  updateStoredAuth({ token: getToken(), ...json });
  return json;
}

// Mise à jour du stockage local (ex. après changement de mot de passe)
export function updateStoredAuth(data) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// Mot de passe oublié — envoie l'email de réinitialisation
export async function forgotPassword(email) {
  const res = await fetch(`${API_BASE}/auth/forgot-password/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "Erreur lors de la demande");
  return data;
}

// Réinitialisation du mot de passe avec le token reçu par email
export async function resetPassword(token, password) {
  const res = await fetch(`${API_BASE}/auth/reset-password/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "Lien invalide ou expiré");
  return data;
}

// Rafraîchissement silencieux des données utilisateur (permissions incluses)
export async function refreshMe() {
  const token = getToken();
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE}/auth/me/`, {
      headers: { Authorization: `Token ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (data?.user) {
      const updated = { token, ...data };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    }
  } catch {
    // silencieux — pas de connexion réseau, on garde la session en cache
  }
  return null;
}

// Changement de mot de passe
export async function changePassword({ currentPassword, newPassword }) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/auth/change-password/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Token ${token}`,
    },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || "Erreur lors du changement de mot de passe");
  }

  updateStoredAuth(data);
  return data;
}
