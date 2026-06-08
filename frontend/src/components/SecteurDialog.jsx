import { useEffect, useMemo, useState } from "react";
import { sanitizeDecimal } from "../utils/number.js";
import useBodyScrollLock from "../utils/useBodyScrollLock.js";

const RELIEF_OPTIONS = [
  "Plateau", "Pentus", "Plateau / Pentus", "Pentus - Plateau",
];

const SOL_OPTIONS = [
  "Sableux", "Argileux", "Humifere", "Gravillonnaire",
  "Sableux / Argileux", "Argileux / Gravillonnaire",
  "Gravillonnaire / Argileux / Sableux", "Humifere - Argileux",
  "Sableux - Humifere", "Argileux - Gravillonnaire", "Sableux - Argileux",
];

const EMPTY = {
  nom: "",
  superficie_ha: "",
  situation_relief: "",
  type_sol: "",
  statut: "actif",
  age_moyen_plants: "",
  nb_palmiers: "",
  rendement_cible_t_ha: "",

};

export default function SecteurDialog({ open, onClose, onSubmit, initial }) {
  useBodyScrollLock(!!open);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});

  const reliefOptions = useMemo(() => {
    const v = (form.situation_relief || "").trim();
    if (!v || RELIEF_OPTIONS.includes(v)) return RELIEF_OPTIONS;
    return [v, ...RELIEF_OPTIONS];
  }, [form.situation_relief]);

  const solOptions = useMemo(() => {
    const v = (form.type_sol || "").trim();
    if (!v || SOL_OPTIONS.includes(v)) return SOL_OPTIONS;
    return [v, ...SOL_OPTIONS];
  }, [form.type_sol]);

  useEffect(() => {
    if (open) {
      setForm(
        initial ? {
          nom:                  initial.nom                ?? "",
          superficie_ha:        initial.superficie_ha      ?? "",
          situation_relief:     initial.situation_relief   ?? "",
          type_sol:             initial.type_sol           ?? "",
          statut:               initial.statut             ?? "actif",
          age_moyen_plants:     initial.age_moyen_plants   ?? "",
          nb_palmiers:          initial.nb_palmiers        ?? "",
          rendement_cible_t_ha: initial.rendement_cible_t_ha ?? "",
        } : { ...EMPTY }
      );
      setErrors({});
    }
  }, [open, initial]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    const decimaux = ["superficie_ha", "rendement_cible_t_ha"];
    setForm((prev) => ({ ...prev, [name]: decimaux.includes(name) ? sanitizeDecimal(value) : value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.nom.trim())          errs.nom          = "Nom requis";
    if (!form.superficie_ha.toString().trim()) errs.superficie_ha = "Superficie requise";
    if (Object.keys(errs).length) { setErrors(errs); return; }

    onSubmit({
      nom:                  form.nom.trim(),
      superficie_ha:        form.superficie_ha,
      situation_relief:     form.situation_relief  || "",
      type_sol:             form.type_sol          || "",
      statut:               form.statut            || "actif",
      age_moyen_plants:     form.age_moyen_plants  !== "" ? Number(form.age_moyen_plants)  : null,
      nb_palmiers:          form.nb_palmiers       !== "" ? Number(form.nb_palmiers)        : null,
      rendement_cible_t_ha: form.rendement_cible_t_ha !== "" ? form.rendement_cible_t_ha   : null,
    });
  };

  if (!open) return null;

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog dialog-sm" onClick={(e) => e.stopPropagation()}>
        <button className="dialog-close" onClick={onClose}>Fermer</button>

        <h3>{initial ? "Modifier secteur" : "Ajouter secteur"}</h3>

        <form className="form-grid" style={{ gridTemplateColumns: "1fr" }} onSubmit={handleSubmit}>
          {initial?.code && (
            <div className="form-hint">
              <strong>Code :</strong> {initial.code}
            </div>
          )}

          {/* ── Informations générales ── */}
          <label>
            Nom *
            <input name="nom" value={form.nom} onChange={handleChange}
              className={errors.nom ? "input-error" : ""} />
            {errors.nom && <span className="field-error">{errors.nom}</span>}
          </label>

          <label>
            Superficie (ha) *
            <input type="number" name="superficie_ha" value={form.superficie_ha}
              onChange={handleChange} step="0.01" min="0"
              className={errors.superficie_ha ? "input-error" : ""} inputMode="decimal" />
            {errors.superficie_ha && <span className="field-error">{errors.superficie_ha}</span>}
          </label>

          <label>
            Statut
            <select name="statut" value={form.statut} onChange={handleChange}>
              <option value="actif">Actif</option>
              <option value="inactif">Inactif</option>
            </select>
          </label>

          <label>
            Situation relief
            <select name="situation_relief" value={form.situation_relief} onChange={handleChange}>
              <option value="">-- Choisir --</option>
              {reliefOptions.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>

          <label>
            Type de sol
            <select name="type_sol" value={form.type_sol} onChange={handleChange}>
              <option value="">-- Choisir --</option>
              {solOptions.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>

          {/* ── Données agronomiques ── */}
          <div style={{ gridColumn: "1 / -1", borderTop: "1px solid #e0e0e0",
            paddingTop: 10, marginTop: 4, fontSize: 12, fontWeight: 700,
            color: "#555", textTransform: "uppercase", letterSpacing: ".5px" }}>
            Données agronomiques
          </div>

          <label>
            Âge moyen des plants (années)
            <input type="number" name="age_moyen_plants" value={form.age_moyen_plants}
              onChange={handleChange} min="0" step="1" inputMode="numeric"
              placeholder="ex : 12" />
          </label>

          <label>
            Nombre de palmiers
            <input type="number" name="nb_palmiers" value={form.nb_palmiers}
              onChange={handleChange} min="0" step="1" inputMode="numeric"
              placeholder="ex : 450" />
          </label>

          <label>
            Rendement cible (t/ha)
            <input type="number" name="rendement_cible_t_ha" value={form.rendement_cible_t_ha}
              onChange={handleChange} min="0" step="0.01" inputMode="decimal"
              placeholder="ex : 2.5" />
          </label>

          {/* ── Actions ── */}
          <div className="dialog-actions">
            <button type="button" onClick={onClose}>Annuler</button>
            <button className="btn-primary" type="submit">
              {initial ? "Mettre à jour" : "Ajouter"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
