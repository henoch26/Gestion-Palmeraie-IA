import useBodyScrollLock from "../utils/useBodyScrollLock.js";

export default function FicheTravauxDialog({ open, onClose, fiche }) {
  useBodyScrollLock(!!open);
  if (!open || !fiche) return null;

  const secteurs = fiche.secteurs_couverts_codes || [];
  const consommables = fiche.consommables || [];
  const repartitions = fiche.repartitions || [];

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog fiche-dialog" onClick={(e) => e.stopPropagation()}>
        <button className="dialog-close" onClick={onClose}>Fermer</button>

        <h3>Details de la fiche travaux</h3>

        <div className="fiche-dialog-grid">
          <div><strong>Superviseur:</strong> {fiche.superviseur_travaux || "-"}</div>
          <div><strong>Nature:</strong> {fiche.nature_travaux_display || fiche.nature_travaux || "-"}</div>
          <div><strong>Periode:</strong> {fiche.periode_travaux || "-"}</div>
          <div><strong>Superficie (ha):</strong> {fiche.superficie_couverte_ha ?? "-"}</div>
          <div><strong>Nb personnes:</strong> {fiche.nb_personnes ?? "-"}</div>
          <div><strong>Total cout:</strong> {fiche.total_cout ?? 0} FCFA</div>
          <div style={{ gridColumn: "1 / -1" }}>
            <strong>Secteurs couverts:</strong> {secteurs.length ? secteurs.join(", ") : "-"}
          </div>
        </div>

        <div className="fiche-dialog-section">
          <h4>Consommables</h4>
          {consommables.length === 0 ? (
            <p>Aucun consommable</p>
          ) : (
            <ul className="fiche-dialog-list">
              {consommables.map((c) => (
                <li key={c.id}>
                  <strong>{c.designation}</strong>{" "}
                  — {c.quantite} {c.unite || ""} — PU: {c.prix_unitaire} — PT: {c.prix_total}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="fiche-dialog-section">
          <h4>Repartition des taches</h4>
          {repartitions.length === 0 ? (
            <p>Aucune repartition</p>
          ) : (
            <ul className="fiche-dialog-list">
              {repartitions.map((r) => (
                <li key={r.id}>
                  <strong>{r.nom_prenom}</strong>{" "}
                  — {r.nature_taches || "-"} — {r.quantite} — PU: {r.prix_unitaire} — PT: {r.prix_total}
                </li>
              ))}
            </ul>
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
