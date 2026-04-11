import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar.jsx";

// Layout principal: topbar + contenu
export default function MainLayout() {
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
