import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { ToastProvider } from "./context/ToastContext.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { RecoltesProvider } from "./context/RecoltesContext.jsx";
import OfflineBanner from "./components/OfflineBanner.jsx";

// Enregistrement du Service Worker (mode prod uniquement pour éviter les conflits HMR)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .catch((err) => console.warn("SW non enregistré:", err));
  });
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      <RecoltesProvider>
        <ToastProvider>
          <OfflineBanner />
          <App />
        </ToastProvider>
      </RecoltesProvider>
    </AuthProvider>
  </StrictMode>
);
