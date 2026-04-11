import { useEffect, useState } from "react";
import { sanitizeInt } from "../utils/number.js";

export default function MaterielDialog({ open, onClose, onSubmit, initial }) {
  const [form, setForm] = useState({
    numero: "",
    designation: "",
    quantite: "",
    etat_physique: "",
    statut_utilisation: "",
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!open) return;
    setForm(
      initial
        ? {
            numero: initial.numero ?? "",
            designation: initial.designation ?? "",
            quantite: initial.quantite ?? "",
            etat_physique: initial.etat_physique ?? "",
            statut_utilisation: initial.statut_utilisation ?? "",
          }
        : {
            numero: "",
            designation: "",
            quantite: "",
            etat_physique: "",
            statut_utilisation: "",
          }
    );
    setErrors({});
  }, [open, initial]);

  if (!open) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    const next =
      name === "numero" || name === "quantite" ? sanitizeInt(value) : value;
    setForm((p) => ({ ...p, [name]: next }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const nextErrors = {};
    if (!String(form.numero).trim()) nextErrors.numero = "Numero requis";
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    onSubmit({
      numero: Number(form.numero),
      designation: form.designation || "",
      quantite: form.quantite ? Number(form.quantite) : 0,
      etat_physique: form.etat_physique || "",
      statut_utilisation: form.statut_utilisation || "",
    });
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog dialog-sm" onClick={(e) => e.stopPropagation()}>
        <button className="dialog-close" onClick={onClose}>Fermer</button>
        <h3>{initial ? "Modifier materiel" : "Ajouter materiel"}</h3>

        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            N°
            <input
              name="numero"
              value={form.numero}
              onChange={handleChange}
              className={errors.numero ? "input-error" : ""}
              inputMode="numeric"
            />
            {errors.numero && <span className="field-error">{errors.numero}</span>}
          </label>

          <label>
            Designation
            <input
              name="designation"
              value={form.designation}
              onChange={handleChange}
            />
          </label>

          <label>
            Quantite
            <input
              name="quantite"
              value={form.quantite}
              onChange={handleChange}
              inputMode="numeric"
            />
          </label>

          <label>
            Etat physique
            <input
              name="etat_physique"
              value={form.etat_physique}
              onChange={handleChange}
            />
          </label>

          <label>
            Statut d'utilisation
            <input
              name="statut_utilisation"
              value={form.statut_utilisation}
              onChange={handleChange}
            />
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

