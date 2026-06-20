import { useEffect, useState } from "react";
import useBodyScrollLock from "../utils/useBodyScrollLock.js";

const EMPTY = {
  nom: "", lieu_residence: "", numero_telephone: "",
  whatsapp_actif: false, est_wave: false, date_naissance: "",
};

export default function RecolteurDialog({ open, onClose, onSubmit, initial }) {
  useBodyScrollLock(!!open);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (open) {
      setForm(
        initial ? {
          nom:              initial.nom              || "",
          lieu_residence:   initial.lieu_residence   || "",
          numero_telephone: initial.numero_telephone || "",
          whatsapp_actif:   !!initial.whatsapp_actif,
          est_wave:         !!initial.est_wave,
          date_naissance:   initial.date_naissance   || "",
        } : { ...EMPTY }
      );
      setErrors({});
    }
  }, [open, initial]);

  if (!open) return null;

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: null }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.nom.trim())            errs.nom            = "Nom requis";
    if (!form.lieu_residence.trim()) errs.lieu_residence = "Lieu de résidence requis";

    if (!form.numero_telephone.trim()) {
      errs.numero_telephone = "Numéro de téléphone requis";
    } else {
      const digits = form.numero_telephone.replace(/\D/g, "");
      if (digits.length < 8 || digits.length > 15) {
        errs.numero_telephone = "Numéro invalide (8 à 15 chiffres attendus)";
      } else if (!/^[\d\s+\-(). ]+$/.test(form.numero_telephone.trim())) {
        errs.numero_telephone = "Caractères invalides — chiffres, espaces, +, -, () uniquement";
      }
    }

    const today = new Date().toISOString().split("T")[0];
    if (form.date_naissance) {
      if (form.date_naissance > today) {
        errs.date_naissance = "La date de naissance ne peut pas être dans le futur";
      } else if (form.date_naissance < "1930-01-01") {
        errs.date_naissance = "Date de naissance invalide (trop ancienne)";
      }
    }

    if (Object.keys(errs).length) { setErrors(errs); return; }
    onSubmit(form);
  };

  return (
    <div className="dialog-backdrop">
      <div className="dialog dialog-md" onClick={(e) => e.stopPropagation()}>
        <button className="dialog-close" onClick={onClose}>Fermer</button>
        <h3>{initial ? "Modifier personnel" : "Ajouter personnel"}</h3>

        <form className="form-grid" onSubmit={handleSubmit}>

          {/* ── Identité ── */}
          <label>
            Nom complet *
            <input name="nom" value={form.nom} onChange={handleChange}
              className={errors.nom ? "input-error" : ""} placeholder="Prénom et nom" />
            {errors.nom && <span className="field-error">{errors.nom}</span>}
          </label>

          <label>
            Lieu de résidence *
            <input name="lieu_residence" value={form.lieu_residence} onChange={handleChange}
              className={errors.lieu_residence ? "input-error" : ""} placeholder="Village / Quartier" />
            {errors.lieu_residence && <span className="field-error">{errors.lieu_residence}</span>}
          </label>

          <label>
            Date de naissance
            <input type="date" name="date_naissance" value={form.date_naissance} onChange={handleChange}
              min="1930-01-01"
              max={new Date().toISOString().split("T")[0]} />
            {errors.date_naissance && <span className="field-error">{errors.date_naissance}</span>}
          </label>

          {/* ── Contact ── */}
          <div style={{ gridColumn: "1 / -1", borderTop: "1px solid #e0e0e0",
            paddingTop: 10, marginTop: 4, fontSize: 12, fontWeight: 700,
            color: "#555", textTransform: "uppercase", letterSpacing: ".5px" }}>
            Contact
          </div>

          <label style={{ gridColumn: "1 / -1" }}>
            Téléphone * <small className="field-hint">(identifiant unique)</small>
            <input name="numero_telephone" value={form.numero_telephone} onChange={handleChange}
              className={errors.numero_telephone ? "input-error" : ""}
              placeholder="ex : 07 00 00 00 00" />
            {errors.numero_telephone && <span className="field-error">{errors.numero_telephone}</span>}
          </label>

          {/* ── Paiements mobiles ── */}
          <fieldset className="form-fieldset" style={{ gridColumn: "1 / -1" }}>
            <legend>Paiements mobiles</legend>

            <label className="checkbox-label">
              <span>WhatsApp actif sur ce numéro</span>
              <input type="checkbox" name="whatsapp_actif" checked={form.whatsapp_actif} onChange={handleChange} />
            </label>

            <label className="checkbox-label">
              <span>Compte Wave</span>
              <input type="checkbox" name="est_wave" checked={form.est_wave} onChange={handleChange} />
            </label>
          </fieldset>

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
