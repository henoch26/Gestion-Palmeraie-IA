import "./App.css"
import { useCallback, useEffect, useRef } from "react";
import { BrowserRouter,Routes,Route,Navigate } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";
import DashboardPage from "./pages/dashboard/DashboardPage.jsx";
import ListeSecteurs from "./pages/secteurs/ListeSecteurs.jsx";
import DetailSecteur from "./pages/secteurs/DetailSecteur.jsx";
import ListeRecolteurs from "./pages/recolteurs/ListeRecolteurs.jsx";
import DetailRecolteur from "./pages/recolteurs/DetailRecolteur.jsx";
import HistoriqueRecoltes from "./pages/recoltes/HistoriqueRecoltes.jsx";
import HistoriqueTravaux from "./pages/travaux/HistoriqueTravaux.jsx";
import ListeMateriels from "./pages/materiels/ListeMateriels.jsx";
import GestionUtilisateurs from "./pages/admin/GestionUtilisateurs.jsx";
import LoginPage from "./pages/auth/LoginPage.jsx";
import ChangePasswordPage from "./pages/auth/ChangePasswordPage.jsx";
import MonProfilPage from "./pages/auth/MonProfilPage.jsx";
import ProtectedRoute from "./routes/ProtectedRoute.jsx";
import AdminRoute from "./routes/AdminRoute.jsx";
import { apiGet } from "./api/axios.js";
import { useToast } from "./context/ToastContext.jsx";


export default function App(){
  const { pushToast, removeToast } = useToast();
  const apiToastIdRef = useRef(null);
  const apiWasDownRef = useRef(false);
  const checkHealthRef = useRef(null);

  // Verifie que l'API est joignable au demarrage
  const checkHealth = useCallback(async () => {
    try {
      await apiGet("/health/");
      if (apiToastIdRef.current) {
        removeToast(apiToastIdRef.current);
        apiToastIdRef.current = null;
      }

      if (apiWasDownRef.current) {
        pushToast({
          type: "success",
          title: "Serveur",
          message: "Connexion retablie",
          duration: 2200,
        });
        apiWasDownRef.current = false;
      }
    } catch (err) {
      apiWasDownRef.current = true;

      // Un seul toast persistant tant que le serveur est KO
      if (!apiToastIdRef.current) {
        const id = pushToast({
          type: "error",
          title: "Serveur indisponible",
          message: err.message || "Impossible de joindre le serveur",
          duration: 0,
          actionLabel: "Reessayer",
          onAction: () => checkHealthRef.current?.(),
          dismissOnAction: false,
          onClose: () => {
            apiToastIdRef.current = null;
          },
        });
        apiToastIdRef.current = id;
      }
    }
  }, [pushToast, removeToast]);

  useEffect(() => {
    checkHealthRef.current = checkHealth;
  }, [checkHealth]);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  return(
    <>
      <BrowserRouter>
        <Routes>
          {/* Route publique */}
          <Route path="/login" element={<LoginPage />} />

          {/* Routes protegees (tous les utilisateurs connectes) */}
          <Route element={<ProtectedRoute />}>
            {/* Changement de mot de passe obligatoire (hors MainLayout) */}
            <Route path="/changer-mot-de-passe" element={<ChangePasswordPage />} />

            <Route element={<MainLayout />}>
              <Route index element={<Navigate to="/dashboard" replace />}/>
              <Route path="/dashboard" element={<DashboardPage />}/>
              {/* Accessible aux deux roles — l'API filtre selon le role */}
              <Route path="/profil" element={<MonProfilPage />}/>
              <Route path="/recoltes" element={<HistoriqueRecoltes />}/>
              <Route path="/travaux" element={<HistoriqueTravaux />}/>

              {/* Routes admin uniquement */}
              <Route element={<AdminRoute />}>
                <Route path="/secteurs" element={<ListeSecteurs />}/>
                <Route path="/secteurs/:id" element={<DetailSecteur />}/>
                <Route path="/recolteurs" element={<ListeRecolteurs />}/>
                <Route path="/recolteurs/:id" element={<DetailRecolteur />}/>
                <Route path="/materiels" element={<ListeMateriels />}/>
                <Route path="/utilisateurs" element={<GestionUtilisateurs />}/>
              </Route>
            </Route>
          </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
    </>
  )
}
