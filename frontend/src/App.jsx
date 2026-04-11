import "./App.css"
import { useEffect, useState } from "react";
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
import LoginPage from "./pages/auth/LoginPage.jsx";
import ProtectedRoute from "./routes/ProtectedRoute.jsx";
import { apiGet } from "./api/axios.js";


export default function App(){
  // Etat simple pour afficher une erreur API (ex: DB indisponible)
  const [apiError, setApiError] = useState("");

  // Verifie que l'API est joignable au demarrage
  const checkHealth = async () => {
    try {
      await apiGet("/health/");
      setApiError("");
    } catch (err) {
      setApiError(err.message || "API indisponible");
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  return(
    <>
      {/* Bandeau d'alerte si l'API est KO */}
      {apiError && (
        <div className="api-banner">
          <strong>API indisponible :</strong> {apiError}
          <button className="api-retry" onClick={checkHealth}>Reessayer</button>
        </div>
      )}

      <BrowserRouter>
        <Routes>
          {/* Route publique */}
          <Route path="/login" element={<LoginPage />} />

          {/* Routes protegees */}
          <Route element={<ProtectedRoute />}>
          <Route element={<MainLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />}/>
            <Route path="/dashboard" element={<DashboardPage />}/>
            <Route path="/secteurs" element={<ListeSecteurs  />}/>
            <Route path="/secteurs/:id" element={<DetailSecteur />}/>
            <Route path="/recolteurs" element={<ListeRecolteurs  />}/>
            <Route path="/recolteurs/:id" element={<DetailRecolteur />}/>
            <Route path="/recoltes" element={<HistoriqueRecoltes  />}/>
            <Route path="/travaux" element={<HistoriqueTravaux  />}/>
            <Route path="/materiels" element={<ListeMateriels  />}/>
          </Route>
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
    </>
  )
}
