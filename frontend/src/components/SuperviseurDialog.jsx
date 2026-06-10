import { useEffect, useState } from "react";
import useBodyScrollLock from "../utils/useBodyScrollLock.js";

const EMPTY = { nom: "", prenom: "", matricule: "", telephone: "", actif: true };

export default function SuperviseurDialog({ open, onClose, onSubmit, initial }) {
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
            matricule: initial.matricule ?? "",
            telephone: initial.telephone ?? "",
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
      matricule: form.matricule.trim(),
      telephone: form.telephone.trim(),
      actif:     form.actif,
    });
  };

  return (
    <div className="dialog-backdrop">
      <div className="dialog dialog-sm" onClick={(e) => e.stopPropagation()}>
        <button className="dialog-close" onClick={onClose}>Fermer</button>
        <h3>{initial ? "Modifier le superviseur" : "Ajouter un superviseur general"}</h3>

        <form style={{ display: "flex", flexDirection: "column", gap: 14 }} onSubmit={handleSubmit}>

          <label>
            Nom *
            <input name="nom" value={form.nom} onChange={handleChange}
              placeholder="ex : Adjoumani" className={errors.nom ? "input-error" : ""} />
            {errors.nom && <span className="field-error">{errors.nom}</span>}
          </label>

          <label>
            Prenom
            <input name="prenom" value={form.prenom} onChange={handleChange}
              placeholder="ex : Firmin" />
          </label>

          <label>
            Matricule
            <input name="matricule" value={form.matricule} onChange={handleChange}
              placeholder="ex : SUP-001" />
          </label>

          <label>
            Telephone
            <input name="telephone" value={form.telephone} onChange={handleChange}
              placeholder="ex : 07 XX XX XX XX" inputMode="tel" />
          </label>

          <label className="checkbox-label">
            <span>Superviseur actif</span>
            <input type="checkbox" name="actif" checked={form.actif} onChange={handleChange} />
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
