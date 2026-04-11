import { useEffect, useState } from "react";

// Dialog pour ajouter / modifier un recolteur
export default function RecolteurDialog({ open, onClose, onSubmit, initial }) {
  // Etat local du formulaire
  const [form, setForm] = useState({
    code: "",
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
              code: initial.code || "",
              nom: initial.nom || "",
              lieu_residence: initial.lieu_residence || "",
            }
          : {
              code: "",
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
    if (!form.code.trim()) nextErrors.code = "Code requis";
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
          <label>
            Code
            <input
              name="code"
              value={form.code}
              onChange={handleChange}
              className={errors.code ? "input-error" : ""}
            />
            {errors.code && <span className="field-error">{errors.code}</span>}
          </label>

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
