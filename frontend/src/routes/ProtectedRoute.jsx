import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import LogoLoader from "../components/LogoLoader.jsx";

const CHANGE_PWD_PATH = "/changer-mot-de-passe";

// Route protegee: redirige vers /login si non connecte
export default function ProtectedRoute() {
  const { isAuthenticated, mustChangePassword, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="page">
        <LogoLoader />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Forcer le changement de mot de passe avant tout accès
  if (mustChangePassword && location.pathname !== CHANGE_PWD_PATH) {
    return <Navigate to={CHANGE_PWD_PATH} replace />;
  }

  return <Outlet />;
}
