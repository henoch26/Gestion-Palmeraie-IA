import { createContext, useCallback, useContext, useState } from "react";

// Context pour afficher des notifications (toasts)
const ToastContext = createContext(null);

// Provider global: garde la liste des toasts
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  // Ajoute un toast et le supprime automatiquement
  const pushToast = useCallback((toast) => {
    const id = crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    const next = {
      id,
      type: "info", // info | success | error | warning
      title: "",
      message: "",
      duration: 3000,
      ...toast,
    };

    setToasts((prev) => [...prev, next]);

    // Auto-dismiss
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, next.duration);
  }, []);

  // Retire un toast manuellement
  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ pushToast }}>
      {children}

      {/* Zone d'affichage des toasts */}
      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            {t.title && <strong>{t.title}</strong>}
            {t.message && <div>{t.message}</div>}
            <button className="toast-close" onClick={() => removeToast(t.id)}>
              x
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// Hook pour utiliser le toast n'importe ou
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast doit etre utilise dans ToastProvider");
  return ctx;
}
