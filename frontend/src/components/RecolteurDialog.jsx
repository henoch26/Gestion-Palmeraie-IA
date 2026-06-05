import { useEffect, useState } from "react";
import useBodyScrollLock from "../utils/useBodyScrollLock.js";

const OPERATEURS = [
  { value: "orange_money", label: "Orange Money" },
  { value: "mtn_momo", label: "MTN MoMo" },
  { value: "moov_money", label: "Moov Money" },
  { value: "autre", label: "Autre" },
];

const emptyForm = {
  nom: "",
  lieu_residence: "",
  numero_telephone: "",
  numero_whatsapp: "",
  whatsapp_actif: false,
  est_wave: false,
  est_mobile_money: false,
  operateur_mm: "",
};

export default function RecolteurDialog({ open, onClose, onSubmit, initial }) {
  useBodyScrollLock(!!open);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (open) {
      setForm(
        initial
          ? {
              nom: initial.nom || "",
              lieu_residence: initial.lieu_residence || "",
              numero_telephone: initial.numero_telephone || "",
              numero_whatsapp: initial.numero_whatsapp || "",
              whatsapp_actif: !!initial.whatsapp_actif,
              est_wave: !!initial.est_wave,
              est_mobile_money: !!initial.est_mobile_money,
              operateur_mm: initial.operateur_mm || "",
            }
          : { ...emptyForm }
      );
      setErrors({});
    }
  }, [open, initial]);

  if (!open) return null;

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => {
      const next = { ...prev, [name]: type === "checkbox" ? checked : value };
      // Effacer l'opérateur si Mobile Money décoché
      if (name === "est_mobile_money" && !checked) {
        next.operateur_mm = "";
      }
      return next;
    });
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: null }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.nom.trim()) errs.nom = "Nom requis";
    if (!form.lieu_residence.trim()) errs.lieu_residence = "Lieu de residence requis";
    if (!form.numero_telephone.trim()) errs.numero_telephone = "Numero de telephone requis";
    if (form.est_mobile_money && !form.operateur_mm) errs.operateur_mm = "Selectionner un operateur";
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    onSubmit(form);
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog dialog-md" onClick={(e) => e.stopPropagation()}>
        <button className="dialog-close" onClick={onClose}>Fermer</button>
        <h3>{initial ? "Modifier recolteur" : "Ajouter recolteur"}</h3>

        <form className="form-grid" onSubmit={handleSubmit}>

          {/* Identite */}
          <label>
            Nom complet *
            <input name="nom" value={form.nom} onChange={handleChange}
              className={errors.nom ? "input-error" : ""} placeholder="Prenom et nom" />
            {errors.nom && <span className="field-error">{errors.nom}</span>}
          </label>

          <label>
            Lieu de residence *
            <input name="lieu_residence" value={form.lieu_residence} onChange={handleChange}
              className={errors.lieu_residence ? "input-error" : ""} placeholder="Village / Quartier" />
            {errors.lieu_residence && <span className="field-error">{errors.lieu_residence}</span>}
          </label>

          {/* Contact principal */}
          <label>
            Numero de telephone * <small className="field-hint">(identifiant unique)</small>
            <input name="numero_telephone" value={form.numero_telephone} onChange={handleChange}
              className={errors.numero_telephone ? "input-error" : ""}
              placeholder="ex: 07 00 00 00 00" />
            {errors.numero_telephone && <span className="field-error">{errors.numero_telephone}</span>}
          </label>

          <label>
            Numero WhatsApp <small className="field-hint">(laisser vide si identique au telephone)</small>
            <input name="numero_whatsapp" value={form.numero_whatsapp} onChange={handleChange}
              placeholder="ex: 07 00 00 00 00" />
          </label>

          {/* Options de paiement mobile */}
          <fieldset className="form-fieldset">
            <legend>Paiements mobiles</legend>

            <label className="checkbox-label">
              <input type="checkbox" name="whatsapp_actif" checked={form.whatsapp_actif} onChange={handleChange} />
              <span>WhatsApp actif sur ce numero</span>
            </label>

            <label className="checkbox-label">
              <input type="checkbox" name="est_wave" checked={form.est_wave} onChange={handleChange} />
              <span>Compte Wave</span>
            </label>

            <label className="checkbox-label">
              <input type="checkbox" name="est_mobile_money" checked={form.est_mobile_money} onChange={handleChange} />
              <span>Compte Mobile Money</span>
            </label>

            {form.est_mobile_money && (
              <label>
                Operateur Mobile Money *
                <select name="operateur_mm" value={form.operateur_mm} onChange={handleChange}
                  className={errors.operateur_mm ? "input-error" : ""}>
                  <option value="">-- Choisir --</option>
                  {OPERATEURS.map((op) => (
                    <option key={op.value} value={op.value}>{op.label}</option>
                  ))}
                </select>
                {errors.operateur_mm && <span className="field-error">{errors.operateur_mm}</span>}
              </label>
            )}
          </fieldset>

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
