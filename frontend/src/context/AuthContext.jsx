import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getStoredAuth, login as loginService, logout as logoutService, updateStoredAuth } from "../services/authService.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState({ token: null, user: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = getStoredAuth();
    if (stored) setAuth(stored);
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
    return {
      user: auth.user,
      token: auth.token,
      role,
      isAuthenticated: !!auth.token,
      isAdmin: role === "admin",
      isSuperviseur: role === "superviseur",
      isSuperviseurAdjoint: role === "superviseur_adjoint",
      // Vrai pour superviseur ET superviseur_adjoint (tous deux non-admin)
      isNonAdmin: role === "superviseur" || role === "superviseur_adjoint",
      mustChangePassword: auth.user?.must_change_password ?? false,
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
