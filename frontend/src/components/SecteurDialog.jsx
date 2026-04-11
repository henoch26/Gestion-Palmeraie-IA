import { useEffect, useMemo, useState } from "react";
import { sanitizeDecimal } from "../utils/number.js";

// Secteurs connus (valeurs initiales). L'utilisateur peut modifier la superficie ensuite.
const SECTEURS_KNOWN = [
  { code: "GP_1", nom: "GP 1", superficie_ha: "7.47", situation_relief: "Plateau", type_sol: "Sableux / Argileux" },
  { code: "GP_2", nom: "GP 2", superficie_ha: "4.60", situation_relief: "Plateau / Pentus", type_sol: "Argileux / Gravillonnaire" },
  { code: "RTE_BOUB", nom: "Rte Boub", superficie_ha: "1.90", situation_relief: "Plateau", type_sol: "Argileux" },
  { code: "PM_1", nom: "PM 1", superficie_ha: "3.48", situation_relief: "Plateau / Pentus", type_sol: "Gravillonnaire / Argileux / Sableux" },
  { code: "PM_2", nom: "PM 2", superficie_ha: "4.44", situation_relief: "Pentus - Plateau", type_sol: "Humifere - Argileux" },
  { code: "JC_1", nom: "JC 1", superficie_ha: "6.80", situation_relief: "Pentus - Plateau", type_sol: "Sableux - Humifere" },
  { code: "JC_2", nom: "JC 2", superficie_ha: "1.17", situation_relief: "Plateau", type_sol: "Sableux" },
  { code: "CO", nom: "CO", superficie_ha: "2.07", situation_relief: "Plateau", type_sol: "Argileux - Gravillonnaire" },
  { code: "AA", nom: "AA", superficie_ha: "2.67", situation_relief: "Plateau", type_sol: "Sableux - Argileux" },
];

// Dialog pour ajouter ou modifier un secteur
export default function SecteurDialog({ open, onClose, onSubmit, initial, existingCodes = [] }) {
  // Formulaire local
  const [form, setForm] = useState({
    code: "",
    nom: "",
    superficie_ha: "",
    situation_relief: "",
    type_sol: "",
  });

  // Gestion simple des erreurs
  const [errors, setErrors] = useState({});

  const reliefOptionsBase = useMemo(() => {
    const vals = SECTEURS_KNOWN.map((s) => (s.situation_relief || "").trim()).filter(Boolean);
    return Array.from(new Set(vals));
  }, []);

  const solOptionsBase = useMemo(() => {
    const vals = SECTEURS_KNOWN.map((s) => (s.type_sol || "").trim()).filter(Boolean);
    return Array.from(new Set(vals));
  }, []);

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
              code: initial.code ?? "",
              nom: initial.nom ?? "",
              superficie_ha: initial.superficie_ha ?? "",
              situation_relief: initial.situation_relief ?? "",
              type_sol: initial.type_sol ?? "",
            }
          : {
              code: "",
              nom: "",
              superficie_ha: "",
              situation_relief: "",
              type_sol: "",
            }
      );
      setErrors({});
    }
  }, [open, initial]);

  const taken = useMemo(() => new Set(existingCodes), [existingCodes]);
  const availableKnown = useMemo(() => SECTEURS_KNOWN, []);
  const hasAvailableChoices = initial || availableKnown.length > 0;
  const selectedIsTaken = useMemo(() => (!initial ? taken.has(form.code) : false), [form.code, initial, taken]);

  const handleKnownSelect = (code) => {
    const s = SECTEURS_KNOWN.find((k) => k.code === code);
    if (!s) return;
    setForm((prev) => ({
      ...prev,
      code: s.code,
      nom: s.nom,
      superficie_ha: s.superficie_ha,
      situation_relief: s.situation_relief || "",
      type_sol: s.type_sol || "",
    }));
  };

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
    if (!form.code.trim()) nextErrors.code = "Code requis";
    if (!form.nom.trim()) nextErrors.nom = "Nom requis";
    if (!form.superficie_ha.trim()) nextErrors.superficie_ha = "Superficie requise";

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    onSubmit({
      code: form.code.trim(),
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
          <label>
            Nom
            {initial ? (
              <input
                name="nom"
                value={form.nom}
                onChange={handleChange}
                className={errors.nom ? "input-error" : ""}
              />
            ) : (
              <select
                value={form.code}
                onChange={(e) => handleKnownSelect(e.target.value)}
                className={errors.code ? "input-error" : ""}
                disabled={!hasAvailableChoices}
              >
                {!hasAvailableChoices ? (
                  <option value="">Tous les secteurs sont deja ajoutes</option>
                ) : (
                  <>
                    <option value="">-- Choisir un secteur --</option>
                    {availableKnown.map((s) => (
                      <option key={s.code} value={s.code} disabled={taken.has(s.code)}>
                        {s.nom} - {s.code}{taken.has(s.code) ? " (deja ajoute)" : ""}
                      </option>
                    ))}
                  </>
                )}
              </select>
            )}
            {errors.nom && <span className="field-error">{errors.nom}</span>}
            {!initial && selectedIsTaken && (
              <span className="field-error">
                Ce secteur existe deja. Utilisez "Modifier" depuis la liste des secteurs.
              </span>
            )}
          </label>

          <label>
            Code
            <input
              name="code"
              value={form.code}
              disabled
              className={errors.code ? "input-error" : ""}
            />
            {errors.code && <span className="field-error">{errors.code}</span>}
          </label>

          <label>
            Superficie (ha)
            <input
              name="superficie_ha"
              value={form.superficie_ha}
              onChange={handleChange}
              className={errors.superficie_ha ? "input-error" : ""}
              inputMode="decimal"
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
              disabled={!hasAvailableChoices || selectedIsTaken}
            >
              {initial ? "Mettre a jour" : "Ajouter"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
