import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getStoredAuth, login as loginService, logout as logoutService } from "../services/authService.js";

// Contexte d'authentification
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Etat auth: token + user
  const [auth, setAuth] = useState({ token: null, user: null });
  const [loading, setLoading] = useState(true);

  // Chargement au demarrage (localStorage)
  useEffect(() => {
    const stored = getStoredAuth();
    if (stored) setAuth(stored);
    setLoading(false);
  }, []);

  // Connexion
  const login = async (credentials) => {
    const data = await loginService(credentials);
    setAuth(data);
    return data;
  };

  // Deconnexion
  const logout = () => {
    logoutService();
    setAuth({ token: null, user: null });
  };

  // Valeur exposee
  const value = useMemo(
    () => ({
      user: auth.user,
      token: auth.token,
      isAuthenticated: !!auth.token,
      login,
      logout,
      loading,
    }),
    [auth, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Hook pratique
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit etre utilise dans AuthProvider");
  return ctx;
}
