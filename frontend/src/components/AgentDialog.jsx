import { useEffect, useState } from "react";
import useBodyScrollLock from "../utils/useBodyScrollLock.js";

const EMPTY = {
  nom: "",
  prenom: "",
  telephone: "",
  secteur: "",
  actif: true,
};

export default function AgentDialog({ open, onClose, onSubmit, initial, secteurs = [] }) {
  useBodyScrollLock(!!open);
  const [form, setForm] = useState(EMPTY);
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

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog dialog-sm" onClick={(e) => e.stopPropagation()}>
        <button className="dialog-close" onClick={onClose}>Fermer</button>
        <h3>{initial ? "Modifier l'agent" : "Ajouter un agent terrain"}</h3>

        <form style={{ display: "flex", flexDirection: "column", gap: 14 }} onSubmit={handleSubmit}>

          <label>
            Nom *
            <input
              name="nom"
              value={form.nom}
              onChange={handleChange}
              placeholder="ex : Kouassi"
              className={errors.nom ? "input-error" : ""}
            />
            {errors.nom && <span className="field-error">{errors.nom}</span>}
          </label>

          <label>
            Prenom
            <input
              name="prenom"
              value={form.prenom}
              onChange={handleChange}
              placeholder="ex : Jean-Baptiste"
            />
          </label>

          <label>
            Telephone
            <input
              name="telephone"
              value={form.telephone}
              onChange={handleChange}
              placeholder="ex : 07 XX XX XX XX"
              inputMode="tel"
            />
          </label>

          <label>
            Secteur affecte
            <select name="secteur" value={form.secteur ?? ""} onChange={handleChange}>
              <option value="">-- Aucun secteur --</option>
              {secteurs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} {s.nom ? `— ${s.nom}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
            <input
              type="checkbox"
              name="actif"
              checked={form.actif}
              onChange={handleChange}
              style={{ width: 16, height: 16 }}
            />
            Agent actif
          </label>

          <div className="dialog-actions">
            <button type="button" onClick={onClose}>Annuler</button>
            <button className="btn-primary" type="submit">
              {initial ? "Mettre a jour" : "Ajouter"}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
