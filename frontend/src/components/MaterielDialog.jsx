import { useEffect, useState } from "react";
import { sanitizeDecimal, sanitizeInt } from "../utils/number.js";
import useBodyScrollLock from "../utils/useBodyScrollLock.js";

const CATEGORIE_OPTIONS = [
  { value: "vehicule",         label: "Véhicule" },
  { value: "outil",            label: "Outil" },
  { value: "equipement_lourd", label: "Équipement lourd" },
  { value: "petit_materiel",   label: "Petit matériel" },
];

const EMPTY = {
  numero: "",
  designation: "",
  quantite: "",
  etat_physique: "",
  statut_utilisation: "",
  date_acquisition: "",
  valeur_achat: "",
  fournisseur: "",
  date_derniere_maintenance: "",
  date_prochaine_maintenance: "",
  categorie: "",
  localisation: "",
  responsable: "",
};

export default function MaterielDialog({ open, onClose, onSubmit, initial }) {
  useBodyScrollLock(!!open);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!open) return;
    setForm(
      initial ? {
        numero:                    initial.numero                    ?? "",
        designation:               initial.designation               ?? "",
        quantite:                  initial.quantite                  ?? "",
        etat_physique:             initial.etat_physique             ?? "",
        statut_utilisation:        initial.statut_utilisation        ?? "",
        date_acquisition:          initial.date_acquisition          ?? "",
        valeur_achat:              initial.valeur_achat              ?? "",
        fournisseur:               initial.fournisseur               ?? "",
        date_derniere_maintenance: initial.date_derniere_maintenance ?? "",
        date_prochaine_maintenance:initial.date_prochaine_maintenance?? "",
        categorie:                 initial.categorie                 ?? "",
        localisation:              initial.localisation              ?? "",
        responsable:               initial.responsable               ?? "",
      } : { ...EMPTY }
    );
    setErrors({});
  }, [open, initial]);

  if (!open) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    const intFields     = ["numero", "quantite"];
    const decimalFields = ["valeur_achat"];
    let next = value;
    if (intFields.includes(name))     next = sanitizeInt(value);
    if (decimalFields.includes(name)) next = sanitizeDecimal(value);
    setForm((p) => ({ ...p, [name]: next }));
    if (errors[name]) setErrors((p) => ({ ...p, [name]: null }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = {};
    if (!String(form.numero).trim()) errs.numero      = "Numéro requis";
    if (!form.designation.trim())    errs.designation = "Désignation requise";
    if (Object.keys(errs).length) { setErrors(errs); return; }

    onSubmit({
      numero:                    Number(form.numero),
      designation:               form.designation.trim(),
      quantite:                  form.quantite !== "" ? Number(form.quantite) : 0,
      etat_physique:             form.etat_physique             || "",
      statut_utilisation:        form.statut_utilisation        || "",
      date_acquisition:          form.date_acquisition          || null,
      valeur_achat:              form.valeur_achat              !== "" ? form.valeur_achat : null,
      fournisseur:               form.fournisseur               || null,
      date_derniere_maintenance: form.date_derniere_maintenance || null,
      date_prochaine_maintenance:form.date_prochaine_maintenance|| null,
      categorie:                 form.categorie                 || null,
      localisation:              form.localisation              || null,
      responsable:               form.responsable               || null,
    });
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog dialog-md" onClick={(e) => e.stopPropagation()}>
        <button className="dialog-close" onClick={onClose}>Fermer</button>
        <h3>{initial ? "Modifier matériel" : "Ajouter matériel"}</h3>

        <form className="form-grid" onSubmit={handleSubmit}>

          {/* ── Identification ── */}
          <label>
            N° *
            <input name="numero" value={form.numero} onChange={handleChange}
              inputMode="numeric" className={errors.numero ? "input-error" : ""}
              placeholder="ex : 42" />
            {errors.numero && <span className="field-error">{errors.numero}</span>}
          </label>

          <label>
            Désignation *
            <input name="designation" value={form.designation} onChange={handleChange}
              className={errors.designation ? "input-error" : ""}
              placeholder="ex : Tracteur John Deere" />
            {errors.designation && <span className="field-error">{errors.designation}</span>}
          </label>

          <label>
            Catégorie
            <select name="categorie" value={form.categorie} onChange={handleChange}>
              <option value="">-- Choisir --</option>
              {CATEGORIE_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </label>

          <label>
            Quantité
            <input name="quantite" value={form.quantite} onChange={handleChange}
              inputMode="numeric" placeholder="1" />
          </label>

          <label>
            État physique
            <input name="etat_physique" value={form.etat_physique} onChange={handleChange}
              placeholder="ex : Bon état" />
          </label>

          <label>
            Statut d'utilisation
            <input name="statut_utilisation" value={form.statut_utilisation} onChange={handleChange}
              placeholder="ex : En service" />
          </label>

          <label>
            Localisation
            <input name="localisation" value={form.localisation} onChange={handleChange}
              placeholder="ex : Hangar principal" />
          </label>

          <label>
            Responsable
            <input name="responsable" value={form.responsable} onChange={handleChange}
              placeholder="Nom du responsable" />
          </label>

          {/* ── Acquisition ── */}
          <div style={{ gridColumn: "1 / -1", borderTop: "1px solid #e0e0e0",
            paddingTop: 10, marginTop: 4, fontSize: 12, fontWeight: 700,
            color: "#555", textTransform: "uppercase", letterSpacing: ".5px" }}>
            Acquisition
          </div>

          <label>
            Date d'acquisition
            <input type="date" name="date_acquisition" value={form.date_acquisition}
              onChange={handleChange} />
          </label>

          <label>
            Valeur d'achat (FCFA)
            <input name="valeur_achat" value={form.valeur_achat} onChange={handleChange}
              inputMode="decimal" placeholder="ex : 2500000" />
          </label>

          <label>
            Fournisseur
            <input name="fournisseur" value={form.fournisseur} onChange={handleChange}
              placeholder="Nom du fournisseur" />
          </label>

          {/* ── Maintenance ── */}
          <div style={{ gridColumn: "1 / -1", borderTop: "1px solid #e0e0e0",
            paddingTop: 10, marginTop: 4, fontSize: 12, fontWeight: 700,
            color: "#555", textTransform: "uppercase", letterSpacing: ".5px" }}>
            Maintenance
          </div>

          <label>
            Dernière maintenance
            <input type="date" name="date_derniere_maintenance"
              value={form.date_derniere_maintenance} onChange={handleChange} />
          </label>

          <label>
            Prochaine maintenance
            <input type="date" name="date_prochaine_maintenance"
              value={form.date_prochaine_maintenance} onChange={handleChange} />
          </label>

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
