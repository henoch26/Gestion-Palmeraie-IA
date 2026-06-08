import { useEffect } from "react";
import useBodyScrollLock from "../utils/useBodyScrollLock.js";

function CheckIcon({ size = 54 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="10" fill="rgba(46,125,50,0.12)" />
      <path
        d="M9.2 12.6l-1.9-1.9a1 1 0 10-1.4 1.4l2.6 2.6a1 1 0 001.4 0l6.2-6.2a1 1 0 10-1.4-1.4l-5.5 5.5z"
        fill="rgb(46,125,50)"
      />
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke="rgba(46,125,50,0.55)"
        strokeWidth="1.2"
      />
    </svg>
  );
}

// Boite succes avec bouton OK et actions optionnelles
export default function SuccessDialog({
  open,
  title = "Succes",
  message = "Operation reussie",
  onClose,
  actions = [],
}) {
  useBodyScrollLock(!!open);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="dialog-backdrop">
      <div className="dialog dialog-sm success-dialog" onClick={(e) => e.stopPropagation()}>
        <h3 className="success-dialog-title">{title}</h3>
        <p className="success-dialog-message">{message}</p>
        <div className="success-dialog-icon">
          <CheckIcon />
        </div>

        <div className="dialog-actions success-dialog-actions">
          {actions.map((a, i) => (
            <button key={i} className={a.className || "btn-primary"} onClick={a.onClick}>
              {a.label}
            </button>
          ))}
          <button className={actions.length > 0 ? "btn-ghost" : "btn-primary"} onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
