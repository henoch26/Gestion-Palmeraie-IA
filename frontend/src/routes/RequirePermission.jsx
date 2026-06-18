import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import LogoLoader from "../components/LogoLoader.jsx";

export default function RequirePermission({ code, children }) {
  const { isAuthenticated, hasPermission, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="page"><LogoLoader /></div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!hasPermission(code)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
