import useBodyScrollLock from "../utils/useBodyScrollLock.js";

const fmt = (n) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(n || 0));

const AVANCEMENT_LABEL = {
  planifie: "Planifié",
  en_cours: "En cours",
  termine:  "Terminé",
};

const AVANCEMENT_COLOR = {
  planifie: "#1565c0",
  en_cours: "#e65100",
  termine:  "#2e7d32",
};

export default function FicheTravauxDialog({ open, onClose, fiche }) {
  useBodyScrollLock(!!open);
  if (!open || !fiche) return null;

  const secteurs     = fiche.secteurs_couverts_codes || [];
  const consommables = fiche.consommables || [];
  const repartitions = fiche.repartitions || [];

  const avancement = fiche.statut_avancement || "";

  return (
    <div className="dialog-backdrop">
      <div className="dialog fiche-dialog" onClick={(e) => e.stopPropagation()}>
        <button className="dialog-close" onClick={onClose}>Fermer</button>

        <h3>Détails de la fiche travaux</h3>

        {/* ── En-tête ── */}
        <div className="fiche-dialog-grid">
          <div><strong>Superviseur :</strong> {fiche.superviseur_travaux || "-"}</div>
          <div><strong>Nature :</strong> {fiche.nature_travaux_display || fiche.nature_travaux || "-"}</div>
          {fiche.type_travaux && (
            <div><strong>Type :</strong> {fiche.type_travaux_display || fiche.type_travaux}</div>
          )}
          <div><strong>Période :</strong> {fiche.periode_travaux || "-"}</div>
          {fiche.date_debut && (
            <div><strong>Date début :</strong> {fiche.date_debut}</div>
          )}
          {fiche.date_fin && (
            <div><strong>Date fin :</strong> {fiche.date_fin}</div>
          )}
          <div><strong>Superficie (ha) :</strong> {fiche.superficie_couverte_ha ?? "-"}</div>
          <div><strong>Nb personnes :</strong> {fiche.nb_personnes ?? "-"}</div>
          <div>
            <strong>Coût total :</strong>{" "}
            {fmt(fiche.cout_total_calcule ?? fiche.total_cout ?? 0)} FCFA
          </div>
          {avancement && (
            <div>
              <strong>Avancement :</strong>{" "}
              <span style={{
                color: AVANCEMENT_COLOR[avancement] || "#333",
                fontWeight: 600,
              }}>
                {AVANCEMENT_LABEL[avancement] || avancement}
              </span>
            </div>
          )}
          <div style={{ gridColumn: "1 / -1" }}>
            <strong>Secteurs couverts :</strong>{" "}
            {secteurs.length ? secteurs.join(", ") : "-"}
          </div>
        </div>

        {/* ── Consommables ── */}
        <div className="fiche-dialog-section">
          <h4>Consommables</h4>
          {consommables.length === 0 ? (
            <p>Aucun consommable</p>
          ) : (
            <div className="fiche-dialog-lines">
              {consommables.map((c) => (
                <div key={c.id} className="fiche-line-card">
                  <div className="fiche-line-head">
                    <strong>{c.designation}</strong>
                    <span>{c.quantite} {c.unite || ""}</span>
                    <span>PU : {fmt(c.prix_unitaire)} FCFA</span>
                    <span>Total : {fmt(c.prix_total ?? (Number(c.quantite) * Number(c.prix_unitaire)))} FCFA</span>
                  </div>
                  {(c.fournisseur || c.numero_lot || c.date_peremption) && (
                    <div className="fiche-line-details">
                      {c.fournisseur && (
                        <span className="fiche-chip">Fourn. : {c.fournisseur}</span>
                      )}
                      {c.numero_lot && (
                        <span className="fiche-chip">Lot : {c.numero_lot}</span>
                      )}
                      {c.date_peremption && (
                        <span className="fiche-chip">Pérem. : {c.date_peremption}</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Répartition des tâches ── */}
        <div className="fiche-dialog-section">
          <h4>Répartition des tâches</h4>
          {repartitions.length === 0 ? (
            <p>Aucune répartition</p>
          ) : (
            <div className="fiche-dialog-lines">
              {repartitions.map((r) => (
                <div key={r.id} className="fiche-line-card">
                  <div className="fiche-line-head">
                    <strong>{r.nom_prenom}</strong>
                    {r.matricule_ouvrier && (
                      <span className="fiche-chip">{r.matricule_ouvrier}</span>
                    )}
                    <span>{r.nature_taches || "-"}</span>
                    <span>
                      Salaire :{" "}
                      {fmt(r.salaire_total_calcule ?? (Number(r.quantite) * Number(r.prix_unitaire)))} FCFA
                    </span>
                  </div>
                  <div className="fiche-line-details">
                    <span className="fiche-chip">Qté : {r.quantite}</span>
                    <span className="fiche-chip">PU : {fmt(r.prix_unitaire)} FCFA</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {fiche.observations && (
          <div className="fiche-dialog-section">
            <h4>Observations</h4>
            <p>{fiche.observations}</p>
          </div>
        )}
      </div>
    </div>
  );
}
