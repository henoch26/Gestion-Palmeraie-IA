import { useEffect, useState } from "react";
import useBodyScrollLock from "../utils/useBodyScrollLock.js";

// Dialog pour ajouter / modifier un recolteur
export default function RecolteurDialog({ open, onClose, onSubmit, initial }) {
  useBodyScrollLock(!!open);
  // Etat local du formulaire
  const [form, setForm] = useState({
    nom: "",
    lieu_residence: "",
  });

  // Erreurs simples
  const [errors, setErrors] = useState({});

  // Charger les valeurs initiales
  useEffect(() => {
    if (open) {
      setForm(
        initial
          ? {
              nom: initial.nom || "",
              lieu_residence: initial.lieu_residence || "",
            }
          : {
              nom: "",
              lieu_residence: "",
            }
      );
      setErrors({});
    }
  }, [open, initial]);

  if (!open) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  // Validation simple
  const handleSubmit = (e) => {
    e.preventDefault();

    const nextErrors = {};
    if (!form.nom.trim()) nextErrors.nom = "Nom requis";
    if (!form.lieu_residence.trim()) nextErrors.lieu_residence = "Lieu requis";

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    onSubmit(form);
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog dialog-sm" onClick={(e) => e.stopPropagation()}>
        <button className="dialog-close" onClick={onClose}>Fermer</button>
        <h3>{initial ? "Modifier recolteur" : "Ajouter recolteur"}</h3>

        <form className="form-grid" onSubmit={handleSubmit}>
          <div className="form-hint">
            <strong>Code :</strong>{" "}
            {initial?.code ? initial.code : "Genere automatiquement"}
          </div>

          <label>
            Nom
            <input
              name="nom"
              value={form.nom}
              onChange={handleChange}
              className={errors.nom ? "input-error" : ""}
            />
            {errors.nom && <span className="field-error">{errors.nom}</span>}
          </label>

          <label>
            Lieu de residence
            <input
              name="lieu_residence"
              value={form.lieu_residence}
              onChange={handleChange}
              className={errors.lieu_residence ? "input-error" : ""}
            />
            {errors.lieu_residence && <span className="field-error">{errors.lieu_residence}</span>}
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
