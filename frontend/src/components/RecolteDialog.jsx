import { useEffect, useState } from "react";

// Dialog pour ajouter / modifier une recolte
export default function RecolteDialog({ open, onClose, onSubmit, initial }) {
  // Etat local du formulaire
  const [form, setForm] = useState({
    date: "",
    secteur: "",
    parcelle: "",
    recolteur: "",
    tonnage: "",
    qualite: "",
    humidite: "",
  });

  // Erreurs simples
  const [errors, setErrors] = useState({});

  // Charger les valeurs initiales quand le dialog s'ouvre
  useEffect(() => {
    if (open) {
      setForm(
        initial || {
          date: "",
          secteur: "",
          parcelle: "",
          recolteur: "",
          tonnage: "",
          qualite: "",
          humidite: "",
        }
      );
      setErrors({});
    }
  }, [open, initial]);

  // Si le dialog est ferme, on ne rend rien
  if (!open) return null;

  // Mise a jour du formulaire
  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  // Soumission du formulaire avec validation basique
  const handleSubmit = (e) => {
    e.preventDefault();

    const nextErrors = {};
    if (!form.date) nextErrors.date = "Date requise";
    if (!form.secteur.trim()) nextErrors.secteur = "Secteur requis";
    if (!form.parcelle.trim()) nextErrors.parcelle = "Parcelle requise";
    if (!form.recolteur.trim()) nextErrors.recolteur = "Recolteur requis";
    if (!form.tonnage.trim()) nextErrors.tonnage = "Tonnage requis";
    if (!form.qualite) nextErrors.qualite = "Qualite requise";
    if (!form.humidite.trim()) nextErrors.humidite = "Humidite requise";

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

        <h3>{initial ? "Modifier recolte" : "Ajouter recolte"}</h3>

        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            Date
            <input
              type="date"
              name="date"
              value={form.date}
              onChange={handleChange}
              className={errors.date ? "input-error" : ""}
            />
            {errors.date && <span className="field-error">{errors.date}</span>}
          </label>

          <label>
            Secteur
            <input
              name="secteur"
              value={form.secteur}
              onChange={handleChange}
              className={errors.secteur ? "input-error" : ""}
            />
            {errors.secteur && <span className="field-error">{errors.secteur}</span>}
          </label>

          <label>
            Parcelle
            <input
              name="parcelle"
              value={form.parcelle}
              onChange={handleChange}
              className={errors.parcelle ? "input-error" : ""}
            />
            {errors.parcelle && <span className="field-error">{errors.parcelle}</span>}
          </label>

          <label>
            Recolteur
            <input
              name="recolteur"
              value={form.recolteur}
              onChange={handleChange}
              className={errors.recolteur ? "input-error" : ""}
            />
            {errors.recolteur && <span className="field-error">{errors.recolteur}</span>}
          </label>

          <label>
            Tonnage (t)
            <input
              name="tonnage"
              value={form.tonnage}
              onChange={handleChange}
              className={errors.tonnage ? "input-error" : ""}
            />
            {errors.tonnage && <span className="field-error">{errors.tonnage}</span>}
          </label>

          <label>
            Qualite
            <select
              name="qualite"
              value={form.qualite}
              onChange={handleChange}
              className={errors.qualite ? "input-error" : ""}
            >
              <option value="">-- Choisir --</option>
              <option value="Bonne">Bonne</option>
              <option value="Moyenne">Moyenne</option>
              <option value="Faible">Faible</option>
            </select>
            {errors.qualite && <span className="field-error">{errors.qualite}</span>}
          </label>

          <label>
            Humidite (%)
            <input
              name="humidite"
              value={form.humidite}
              onChange={handleChange}
              className={errors.humidite ? "input-error" : ""}
            />
            {errors.humidite && <span className="field-error">{errors.humidite}</span>}
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
