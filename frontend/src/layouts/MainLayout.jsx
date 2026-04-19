import { Outlet, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import Sidebar from "../components/Sidebar.jsx";

// Layout principal: topbar + contenu
export default function MainLayout() {
  const { pathname } = useLocation();
  const [isNavigating, setIsNavigating] = useState(false);
  const timerRef = useRef(null);

  // Micro-animation de chargement lors d'un changement de page
  useEffect(() => {
    setIsNavigating(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setIsNavigating(false), 650);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [pathname]);

  return (
    <div className="app-layout">
      <Sidebar isNavigating={isNavigating} />
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
