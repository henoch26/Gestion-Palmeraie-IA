/**
 * AuthContext.jsx — Contexte React global pour l'authentification.
 *
 * Fournit via useAuth() :
 *   user            — Objet utilisateur complet (id, username, role, permissions…)
 *   token           — Token DRF stocke en sessionStorage
 *   isAuthenticated — true si un token est present
 *   isAdmin         — true si role === "admin"
 *   isSuperviseur   — true si role === "superviseur"
 *   isNonAdmin      — true pour superviseur ET superviseur_adjoint
 *   mustChangePassword — true si l'admin a force un changement de MDP
 *   hasPermission(code) — verifie si le user a un droit specifique
 *                         (l'admin a TOUS les droits implicitement)
 *   login(credentials)  — Appelle l'API et stocke le token
 *   logout()            — Efface le token et reinitialise l'etat
 *   refreshUser(data)   — Met a jour le profil sans nouveau login
 *   loading             — true pendant la lecture du sessionStorage au demarrage
 *
 * Au montage, le contexte restaure la session depuis sessionStorage et
 * rafraichit les donnees utilisateur depuis /api/me/ pour rester a jour.
 */
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getStoredAuth, login as loginService, logout as logoutService, refreshMe, updateStoredAuth } from "../services/authService.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState({ token: null, user: null });
  const [loading, setLoading] = useState(true);

  // Restauration de session au demarrage + rafraichissement depuis l'API
  useEffect(() => {
    const stored = getStoredAuth();
    if (stored?.token) {
      setAuth(stored);
      // Rafraichit les donnees (role, permissions) en cas de modification cote admin
      refreshMe().then((fresh) => { if (fresh) setAuth(fresh); });
    }
    setLoading(false);
  }, []);

  const login = async (credentials) => {
    const data = await loginService(credentials);
    setAuth(data);
    return data;
  };

  const logout = () => {
    logoutService();
    setAuth({ token: null, user: null });
  };

  const refreshUser = (data) => {
    updateStoredAuth(data);
    setAuth(data);
  };

  const value = useMemo(() => {
    const role = auth.user?.role ?? null;
    const permissions = auth.user?.permissions ?? [];
    return {
      user: auth.user,
      token: auth.token,
      role,
      isAuthenticated: !!auth.token,
      isAdmin: role === "admin",
      isSuperviseur: role === "superviseur",
      isSuperviseurAdjoint: role === "superviseur_adjoint",
      isEncadreurTechnique: role === "encadreur_technique",
      isIARole: ["admin", "superviseur", "superviseur_adjoint", "encadreur_technique"].includes(role),
      // Vrai pour superviseur ET superviseur_adjoint (tous deux non-admin)
      isNonAdmin: role === "superviseur" || role === "superviseur_adjoint",
      mustChangePassword: auth.user?.must_change_password ?? false,
      permissions,
      // L'admin a tous les droits implicitement
      hasPermission: (code) => role === "admin" || permissions.includes(code),
      login,
      logout,
      refreshUser,
      loading,
    };
  }, [auth, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit etre utilise dans AuthProvider");
  return ctx;
}
