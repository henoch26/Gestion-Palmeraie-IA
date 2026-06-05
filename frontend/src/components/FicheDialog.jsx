import useBodyScrollLock from "../utils/useBodyScrollLock.js";

const fmt = (n) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(n || 0));

export default function FicheDialog({ open, onClose, fiche }) {
  useBodyScrollLock(!!open);
  if (!open || !fiche) return null;

  const lignes = fiche.lignes || [];
  const superviseurs = fiche.superviseurs_adjoints || [];
  const recus = fiche.recus || [];

  const getRecolteurName = (line) =>
    line.recolteur_nom_display || line.recolteur_nom || "Sans nom";

  const regimeLabel = (r) =>
    ({ grands: "Grands", moyens: "Moyens", petits: "Petits" }[r] || r);

  // ── Totaux ────────────────────────────────────────────────────────────────
  const totalRegimes = lignes.reduce(
    (sum, line) =>
      sum + (line.details || []).reduce((s, d) => s + (Number(d.quantite) || 0), 0),
    0
  );
  const totalPrix = lignes.reduce((sum, line) => sum + (Number(line.prix_fcfa) || 0), 0);

  // Décomposition des dépenses
  const depNourriture = Number(fiche.depense_nourriture || 0);
  const depTransport = Number(fiche.depense_transport || 0);
  const depSalaire = Number(fiche.depense_salaire || 0);
  const depTotal = Number(fiche.depense_total || 0) || depNourriture + depTransport + depSalaire;

  // Style pour la ligne total dépenses
  const totalRowStyle = {
    borderTop: "2px solid #e0e0e0",
    paddingTop: 6,
    marginTop: 4,
    fontWeight: 700,
    color: "#b71c1c",
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog fiche-dialog" onClick={(e) => e.stopPropagation()}>
        <button className="dialog-close" onClick={onClose}>Fermer</button>

        <h3>Details de la fiche</h3>

        {/* En-tete */}
        <div className="fiche-dialog-grid">
          <div><strong>Date :</strong> {fiche.date}</div>
          <div><strong>Superviseur :</strong> {fiche.superviseur_general || "-"}</div>
          <div><strong>Statut :</strong> {fiche.statut_display || fiche.statut || "-"}</div>
          <div><strong>Total régimes :</strong> {fmt(totalRegimes)}</div>
          <div><strong>Prix récolte :</strong> {fmt(totalPrix)} FCFA</div>
        </div>

        {/* Barème */}
        <div className="fiche-dialog-section">
          <h4>Barème</h4>
          <div className="fiche-dialog-grid">
            <div>Grands : {fiche.bareme_grands} FCFA/rég.</div>
            <div>Moyens : {fiche.bareme_moyens} FCFA/rég.</div>
            <div>Petits : {fiche.bareme_petits} FCFA/rég.</div>
          </div>
        </div>

        {/* ── Dépenses ── */}
        <div className="fiche-dialog-section">
          <h4>Dépenses</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Nourriture</span>
              <span>{fmt(depNourriture)} FCFA</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Transport</span>
              <span>{fmt(depTransport)} FCFA</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Salaire récolteurs</span>
              <span>{fmt(depSalaire)} FCFA</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", ...totalRowStyle }}>
              <span>TOTAL DÉPENSES</span>
              <span>{fmt(depTotal)} FCFA</span>
            </div>
          </div>
        </div>

        {/* Superviseurs adjoints */}
        <div className="fiche-dialog-section">
          <h4>Superviseurs adjoints</h4>
          {superviseurs.length === 0 ? (
            <p>Aucun superviseur ajouté</p>
          ) : (
            <ul className="fiche-dialog-list">
              {superviseurs.map((s) => (
                <li key={s.id}>
                  <strong>{s.nom}</strong> — {s.secteur_ou_recolteur}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Lignes de récolte */}
        <div className="fiche-dialog-section">
          <h4>Détails récolte</h4>
          {lignes.length === 0 ? (
            <p>Aucune ligne</p>
          ) : (
            <div className="fiche-dialog-lines">
              {lignes.map((line) => {
                const salaire = Number(line.salaire_calcule || line.prix_fcfa || 0);
                return (
                  <div key={line.id} className="fiche-line-card">
                    <div className="fiche-line-head">
                      <strong>{getRecolteurName(line)}</strong>
                      <span>{regimeLabel(line.regime_type)}</span>
                      <span>Salaire : {fmt(salaire)} FCFA</span>
                    </div>
                    <div className="fiche-line-details">
                      {(line.details || []).map((d) => (
                        <span key={d.id} className="fiche-chip">
                          {d.secteur_code || "-"} : {d.quantite}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Reçus de vente */}
        <div className="fiche-dialog-section">
          <h4>Reçus de vente</h4>
          {recus.length === 0 ? (
            <p>Aucun reçu</p>
          ) : (
            <div className="fiche-dialog-lines">
              {recus.map((r) => (
                <div key={r.id} className="fiche-line-card">
                  <div className="fiche-line-head">
                    <strong>{r.client || "-"}</strong>
                    <span>Date : {r.date || "-"}</span>
                    <span>Montant : {fmt(r.montant)} FCFA</span>
                  </div>
                  <div className="fiche-line-details">
                    <span className="fiche-chip">Pesée : {r.pesee_kg} kg</span>
                    <span className="fiche-chip">Non conformes : {r.non_conformes_pct}%</span>
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
