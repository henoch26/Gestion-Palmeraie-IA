import { useEffect, useState } from "react";
import useBodyScrollLock from "../utils/useBodyScrollLock.js";

const EMPTY = { nom: "", prenom: "", telephone: "", secteur: "", actif: true };

export default function AgentDialog({ open, onClose, onSubmit, initial, secteurs = [] }) {
  useBodyScrollLock(!!open);
  const [form, setForm]     = useState(EMPTY);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!open) return;
    setForm(
      initial
        ? {
            nom:       initial.nom       ?? "",
            prenom:    initial.prenom    ?? "",
            telephone: initial.telephone ?? "",
            secteur:   initial.secteur   ?? "",
            actif:     initial.actif     ?? true,
          }
        : { ...EMPTY }
    );
    setErrors({});
  }, [open, initial]);

  if (!open) return null;

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((p) => ({ ...p, [name]: type === "checkbox" ? checked : value }));
    if (errors[name]) setErrors((p) => ({ ...p, [name]: null }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.nom.trim()) errs.nom = "Le nom est requis";
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onSubmit({
      nom:       form.nom.trim(),
      prenom:    form.prenom.trim(),
      telephone: form.telephone.trim(),
      secteur:   form.secteur || null,
      actif:     form.actif,
    });
  };

  const isEdit = !!initial;

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog dialog-sm" style={{ padding: 0, overflow: "hidden" }}
        onClick={(e) => e.stopPropagation()}>

        {/* ── En-tête coloré ─────────────────────────────────── */}
        <div style={{
          background: "linear-gradient(135deg, #2e7d32 0%, #43a047 100%)",
          padding: "20px 20px 16px",
          color: "#fff",
          position: "relative",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 42, height: 42, borderRadius: "50%",
              background: "rgba(255,255,255,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20, flexShrink: 0,
            }}>
              {isEdit ? "✏️" : "👤"}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>
                {isEdit ? "Modifier l'agent" : "Nouvel agent terrain"}
              </div>
              <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>
                {isEdit
                  ? `${initial.nom} ${initial.prenom || ""}`.trim()
                  : "Remplissez les informations de l'agent"}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              position: "absolute", top: 12, right: 12,
              background: "rgba(255,255,255,0.2)", border: "none",
              borderRadius: 6, color: "#fff", padding: "4px 10px",
              cursor: "pointer", fontSize: 12, fontWeight: 600,
            }}
          >
            ✕
          </button>
        </div>

        {/* ── Corps du formulaire ────────────────────────────── */}
        <form onSubmit={handleSubmit} style={{ padding: "20px 20px 0" }}>

          <div className="modal-section-label" style={{ marginBottom: 12 }}>
            Identite
          </div>

          <div className="mfield-row" style={{ marginBottom: 14 }}>
            <div className="mfield">
              <label className="mfield-label">
                Nom <span style={{ color: "#d32f2f" }}>*</span>
              </label>
              <input
                className={`mfield-input${errors.nom ? " mfield-input--error" : ""}`}
                name="nom"
                value={form.nom}
                onChange={handleChange}
                placeholder="ex : Kouassi"
                autoFocus
              />
              {errors.nom && <span className="mfield-error">{errors.nom}</span>}
            </div>
            <div className="mfield">
              <label className="mfield-label">Prenom</label>
              <input
                className="mfield-input"
                name="prenom"
                value={form.prenom}
                onChange={handleChange}
                placeholder="ex : Jean-Baptiste"
              />
            </div>
          </div>

          <div className="modal-section-label" style={{ marginBottom: 12 }}>
            Contact & affectation
          </div>

          <div className="mfield" style={{ marginBottom: 14 }}>
            <label className="mfield-label">Telephone</label>
            <input
              className="mfield-input"
              name="telephone"
              value={form.telephone}
              onChange={handleChange}
              placeholder="ex : 07 XX XX XX XX"
              inputMode="tel"
            />
          </div>

          <div className="mfield" style={{ marginBottom: 14 }}>
            <label className="mfield-label">Secteur affecte</label>
            <select
              className="mfield-input"
              name="secteur"
              value={form.secteur ?? ""}
              onChange={handleChange}
            >
              <option value="">— Aucun secteur —</option>
              {secteurs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code}{s.nom ? ` — ${s.nom}` : ""}
                </option>
              ))}
            </select>
          </div>

          <label className="checkbox-label" style={{ marginBottom: 20 }}>
            <span style={{ fontSize: 13, color: "#444" }}>Agent actif</span>
            <input
              type="checkbox"
              name="actif"
              checked={form.actif}
              onChange={handleChange}
            />
          </label>

        </form>

        {/* ── Pied de page ───────────────────────────────────── */}
        <div style={{
          display: "flex", justifyContent: "flex-end", gap: 10,
          padding: "14px 20px",
          borderTop: "1px solid #f0f0f0",
          background: "#fafafa",
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 18px", borderRadius: 6, border: "1px solid #ddd",
              background: "#fff", cursor: "pointer", fontSize: 13, color: "#555",
            }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            style={{
              padding: "8px 20px", borderRadius: 6, border: "none",
              background: "linear-gradient(135deg, #2e7d32, #43a047)",
              color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13,
            }}
          >
            {isEdit ? "Mettre a jour" : "Ajouter l'agent"}
          </button>
        </div>

      </div>
    </div>
  );
}
