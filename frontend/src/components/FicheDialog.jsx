import useBodyScrollLock from "../utils/useBodyScrollLock.js";

// Dialog pour afficher les details d'une fiche de recolte
export default function FicheDialog({ open, onClose, fiche }) {
  useBodyScrollLock(!!open);
  if (!open || !fiche) return null;

  // Helpers pour formater les donnees
  const lignes = fiche.lignes || [];
  const superviseurs = fiche.superviseurs_adjoints || [];
  const recus = fiche.recus || [];

  const getRecolteurName = (line) =>
    line.recolteur_nom_display || line.recolteur_nom || "Sans nom";

  const regimeLabel = (regime) => {
    if (regime === "grands") return "Grands";
    if (regime === "moyens") return "Moyens";
    if (regime === "petits") return "Petits";
    return regime;
  };

  // Totaux globaux
  const totalRegimes = lignes.reduce(
    (sum, line) =>
      sum +
      (line.details || []).reduce(
        (s, d) => s + (Number(d.quantite) || 0),
        0
      ),
    0
  );
  const totalPrix = lignes.reduce(
    (sum, line) => sum + (Number(line.prix_fcfa) || 0),
    0
  );

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog fiche-dialog" onClick={(e) => e.stopPropagation()}>
        <button className="dialog-close" onClick={onClose}>Fermer</button>

        <h3>Details de la fiche</h3>

        {/* En-tete */}
        <div className="fiche-dialog-grid">
          <div><strong>Date:</strong> {fiche.date}</div>
          <div><strong>Superviseur:</strong> {fiche.superviseur_general || "-"}</div>
          <div><strong>Total regimes:</strong> {totalRegimes}</div>
          <div><strong>Prix recolte:</strong> {totalPrix} FCFA</div>
        </div>

        {/* Bareme */}
        <div className="fiche-dialog-section">
          <h4>Bareme</h4>
          <div className="fiche-dialog-grid">
            <div>Grands: {fiche.bareme_grands}</div>
            <div>Moyens: {fiche.bareme_moyens}</div>
            <div>Petits: {fiche.bareme_petits}</div>
          </div>
        </div>

        {/* Depenses */}
        <div className="fiche-dialog-section">
          <h4>Depenses</h4>
          <div className="fiche-dialog-grid">
            <div>Nourriture: {fiche.depense_nourriture} FCFA</div>
            <div>Transport: {fiche.depense_transport} FCFA</div>
          </div>
        </div>

        {/* Superviseurs adjoints */}
        <div className="fiche-dialog-section">
          <h4>Superviseurs adjoints</h4>
          {superviseurs.length === 0 ? (
            <p>Aucun superviseur ajoute</p>
          ) : (
            <ul className="fiche-dialog-list">
              {superviseurs.map((s) => (
                <li key={s.id}>
                  <strong>{s.nom}</strong> - {s.secteur_ou_recolteur}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Lignes de recolte */}
        <div className="fiche-dialog-section">
          <h4>Details recolte</h4>
          {lignes.length === 0 ? (
            <p>Aucune ligne</p>
          ) : (
            <div className="fiche-dialog-lines">
              {lignes.map((line) => (
                <div key={line.id} className="fiche-line-card">
                  <div className="fiche-line-head">
                    <strong>{getRecolteurName(line)}</strong>
                    <span>{regimeLabel(line.regime_type)}</span>
                    <span>Prix: {line.prix_fcfa} FCFA</span>
                  </div>
                  <div className="fiche-line-details">
                    {(line.details || []).map((d) => (
                      <span key={d.id} className="fiche-chip">
                        {d.secteur_code || "-"}: {d.quantite}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recus */}
        <div className="fiche-dialog-section">
          <h4>Recus de vente</h4>
          {recus.length === 0 ? (
            <p>Aucun recu</p>
          ) : (
            <div className="fiche-dialog-lines">
              {recus.map((r) => (
                <div key={r.id} className="fiche-line-card">
                  <div className="fiche-line-head">
                    <strong>{r.client || "-"}</strong>
                    <span>Date: {r.date || "-"}</span>
                    <span>Montant: {r.montant} FCFA</span>
                  </div>
                  <div className="fiche-line-details">
                    <span className="fiche-chip">Pesee: {r.pesee_kg}</span>
                    <span className="fiche-chip">Non conformes: {r.non_conformes_pct}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Observations */}
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
