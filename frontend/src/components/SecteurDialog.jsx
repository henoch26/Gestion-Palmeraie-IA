import { useEffect, useMemo, useState } from "react";
import { sanitizeDecimal } from "../utils/number.js";
import useBodyScrollLock from "../utils/useBodyScrollLock.js";

// Valeurs pour alimenter les listes (relief / sol) sans dependances externes
const RELIEF_OPTIONS = [
  "Plateau",
  "Pentus",
  "Plateau / Pentus",
  "Pentus - Plateau",
];

const SOL_OPTIONS = [
  "Sableux",
  "Argileux",
  "Humifere",
  "Gravillonnaire",
  "Sableux / Argileux",
  "Argileux / Gravillonnaire",
  "Gravillonnaire / Argileux / Sableux",
  "Humifere - Argileux",
  "Sableux - Humifere",
  "Argileux - Gravillonnaire",
  "Sableux - Argileux",
];

// Dialog pour ajouter ou modifier un secteur
export default function SecteurDialog({ open, onClose, onSubmit, initial }) {
  useBodyScrollLock(!!open);
  // Formulaire local
  const [form, setForm] = useState({
    nom: "",
    superficie_ha: "",
    situation_relief: "",
    type_sol: "",
  });

  // Gestion simple des erreurs
  const [errors, setErrors] = useState({});

  const reliefOptionsBase = useMemo(() => Array.from(new Set(RELIEF_OPTIONS)), []);
  const solOptionsBase = useMemo(() => Array.from(new Set(SOL_OPTIONS)), []);

  const reliefOptions = useMemo(() => {
    const v = (form.situation_relief || "").trim();
    if (!v) return reliefOptionsBase;
    if (reliefOptionsBase.includes(v)) return reliefOptionsBase;
    // Garder la valeur existante visible si elle n'est pas dans la liste
    return [v, ...reliefOptionsBase];
  }, [form.situation_relief, reliefOptionsBase]);

  const solOptions = useMemo(() => {
    const v = (form.type_sol || "").trim();
    if (!v) return solOptionsBase;
    if (solOptionsBase.includes(v)) return solOptionsBase;
    return [v, ...solOptionsBase];
  }, [form.type_sol, solOptionsBase]);

  // Quand on ouvre le dialog, on charge l'etat initial
  useEffect(() => {
    if (open) {
      setForm(
        initial
          ? {
              nom: initial.nom ?? "",
              superficie_ha: initial.superficie_ha ?? "",
              situation_relief: initial.situation_relief ?? "",
              type_sol: initial.type_sol ?? "",
            }
          : {
              nom: "",
              superficie_ha: "",
              situation_relief: "",
              type_sol: "",
            }
      );
      setErrors({});
    }
  }, [open, initial]);

  // Mise a jour du formulaire a chaque frappe
  const handleChange = (e) => {
    const { name, value } = e.target;
    const nextValue = name === "superficie_ha" ? sanitizeDecimal(value) : value;
    setForm((prev) => ({ ...prev, [name]: nextValue }));
  };

  // Soumission du formulaire avec validation basique
  const handleSubmit = (e) => {
    e.preventDefault();

    const nextErrors = {};
    if (!form.nom.trim()) nextErrors.nom = "Nom requis";
    if (!form.superficie_ha.trim()) nextErrors.superficie_ha = "Superficie requise";

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    onSubmit({
      nom: form.nom.trim(),
      superficie_ha: form.superficie_ha,
      situation_relief: form.situation_relief || "",
      type_sol: form.type_sol || "",
    }); // on renvoie les donnees au parent
  };

  // Si le dialog est ferme, on ne rend rien
  if (!open) return null;

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog dialog-sm" onClick={(e) => e.stopPropagation()}>
        <button className="dialog-close" onClick={onClose}>Fermer</button>

        {/* Titre dynamique */}
        <h3>{initial ? "Modifier secteur" : "Ajouter secteur"}</h3>

        {/* Formulaire */}
        <form className="form-grid" onSubmit={handleSubmit}>
          {initial?.code && (
            <div className="form-hint">
              <strong>Code :</strong> {initial.code} (genere automatiquement)
            </div>
          )}

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
            Superficie (ha)
            <input
              type="number"
              name="superficie_ha"
              value={form.superficie_ha}
              onChange={handleChange}
              className={errors.superficie_ha ? "input-error" : ""}
              inputMode="decimal"
              step="0.01"
              min="0"
            />
            {errors.superficie_ha && <span className="field-error">{errors.superficie_ha}</span>}
          </label>

          <label>
            Situation relief
            <select
              name="situation_relief"
              value={form.situation_relief}
              onChange={handleChange}
            >
              <option value="">-- Choisir --</option>
              {reliefOptions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>

          <label>
            Type de sol
            <select
              name="type_sol"
              value={form.type_sol}
              onChange={handleChange}
            >
              <option value="">-- Choisir --</option>
              {solOptions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>

          {/* Actions */}
          <div className="dialog-actions">
            <button type="button" onClick={onClose}>Annuler</button>
            <button
              className="btn-primary"
              type="submit"
            >
              {initial ? "Mettre a jour" : "Ajouter"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
