/**
 * App.jsx â€” Point d'entree de l'application React. Definit l'arborescence des routes.
 *
 * Trois niveaux de protection :
 *   ProtectedRoute   â€” Redirige vers /login si non authentifie
 *   AdminRoute       â€” Redirige si l'utilisateur n'est pas admin
 *   RequirePermissionâ€” Redirige si le superviseur n'a pas le droit specifie
 *
 * Verification de sante du serveur :
 *   Au demarrage, un appel GET /api/health/ verifie que le backend est joignable.
 *   Un toast persistant s'affiche si le serveur est indisponible, avec un bouton
 *   "Reessayer". Le toast disparait automatiquement des que le serveur repond.
 */
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
import GestionClients from "./pages/admin/GestionClients.jsx";
import ParametreBonus from "./pages/admin/ParametreBonus.jsx";
import JournalAudit from "./pages/admin/JournalAudit.jsx";
import MonAudit from "./pages/superviseur/MonAudit.jsx";
import ListeAgents from "./pages/agents/ListeAgents.jsx";
import DetailSuperviseur from "./pages/superviseurs/DetailSuperviseur.jsx";
import LoginPage from "./pages/auth/LoginPage.jsx";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage.jsx";
import ResetPasswordPage from "./pages/auth/ResetPasswordPage.jsx";
import ChangePasswordPage from "./pages/auth/ChangePasswordPage.jsx";
import MonProfilPage from "./pages/auth/MonProfilPage.jsx";
import ProtectedRoute from "./routes/ProtectedRoute.jsx";
import AdminRoute from "./routes/AdminRoute.jsx";
import RequirePermission from "./routes/RequirePermission.jsx";
import RequireIARole from "./routes/RequireIARole.jsx";
import DashboardIA from "./pages/ia/DashboardIA.jsx";
import ListePredictions from "./pages/ia/ListePredictions.jsx";
import ListeAnomalies from "./pages/ia/ListeAnomalies.jsx";
import ListeModeles from "./pages/ia/ListeModeles.jsx";
import PrescriptionsIA from "./pages/ia/PrescriptionsIA.jsx";
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
          {/* Routes publiques */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Routes protegees (tous les utilisateurs connectes) */}
          <Route element={<ProtectedRoute />}>
            {/* Changement de mot de passe obligatoire (hors MainLayout) */}
            <Route path="/changer-mot-de-passe" element={<ChangePasswordPage />} />

            <Route element={<MainLayout />}>
              <Route index element={<Navigate to="/dashboard" replace />}/>
              <Route path="/dashboard" element={<DashboardPage />}/>
              {/* Accessible aux deux roles â€” l'API filtre selon le role */}
              <Route path="/profil" element={<MonProfilPage />}/>
              <Route path="/recoltes" element={<HistoriqueRecoltes />}/>
              <Route path="/travaux" element={<HistoriqueTravaux />}/>
              <Route path="/agents" element={<ListeAgents />}/>
              <Route path="/superviseurs/:id" element={<DetailSuperviseur />}/>

              {/* Ressources â€” accessibles a l'admin ou aux superviseurs avec permission */}
              <Route path="/secteurs" element={<ListeSecteurs />}/>
              <Route path="/secteurs/:id" element={<DetailSecteur />}/>
              <Route path="/recolteurs" element={<ListeRecolteurs />}/>
              <Route path="/recolteurs/:id" element={<DetailRecolteur />}/>
              <Route path="/materiels" element={<ListeMateriels />}/>

              {/* Page audit superviseur (accessible Ã  tous les connectÃ©s) */}
              <Route path="/mon-audit" element={<MonAudit />}/>

              {/* Clients â€” admin ou superviseur avec droit gerer_clients */}
              <Route path="/clients" element={<RequirePermission code="gerer_clients"><GestionClients /></RequirePermission>} />

              {/* Module IA â€” accessible Ã  tous les utilisateurs connectÃ©s */}
              <Route path="/ia" element={<RequireIARole><DashboardIA /></RequireIARole>}/>
              <Route path="/ia/predictions" element={<RequireIARole><ListePredictions /></RequireIARole>}/>
              <Route path="/ia/anomalies" element={<RequireIARole><ListeAnomalies /></RequireIARole>}/>
              <Route path="/ia/prescriptions" element={<RequireIARole><PrescriptionsIA /></RequireIARole>}/>
              <Route path="/ia/modeles" element={<RequireIARole><ListeModeles /></RequireIARole>}/>

              {/* Routes admin uniquement */}
              <Route element={<AdminRoute />}>
                <Route path="/utilisateurs" element={<GestionUtilisateurs />}/>
                <Route path="/parametre-bonus" element={<ParametreBonus />}/>
                <Route path="/journal-audit" element={<JournalAudit />}/>
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
