/**
 * FicheDialog.jsx — Dialog de detail d'une fiche de recolte.
 *
 * Affiche le recapitulatif complet d'une fiche (secteur, regime, quantites,
 * prix, bareme, recus de vente) et permet :
 *   - L'impression PDF via jsPDF + jspdf-autotable
 *   - La modification du bareme (admin)
 *   - La validation / le rejet (admin)
 *
 * Props :
 *   fiche       — Objet fiche recolte complet
 *   onClose     — Callback de fermeture
 *   onValider   — Callback apres validation (rafraichit la liste parente)
 *   onRejeter   — Callback apres rejet
 *   readOnly    — Si true, masque les boutons d'action admin
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { CheckCircle2, Download, Phone } from "lucide-react";
import useBodyScrollLock from "../utils/useBodyScrollLock.js";

const fmt = (n) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(n || 0));

const fmtDateTime = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
    + " à " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
};

const REGIME_LABEL = { grands: "Grands", moyens: "Moyens", petits: "Petits" };

// ── Génération PDF ────────────────────────────────────────────────────────────
function buildPDF(fiche, totals) {
  const { totalRegimes, totalPrix, depNourriture, depTransport, depSalaire, depTotal } = totals;
  const lignes      = fiche.lignes || [];
  const superviseurs = fiche.superviseurs_adjoints || [];
  const recus       = fiche.recus || [];

  const doc  = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  let y = 0;

  // ── Bandeau header ──
  doc.setFillColor(31, 78, 121);
  doc.rect(0, 0, pageW, 30, "F");
  doc.setTextColor(200, 220, 255);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("GESTION PALMERAIE", margin, 10);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(17);
  doc.text("Fiche de Récolte", pageW / 2, 13, { align: "center" });
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(fiche.date || "", pageW / 2, 22, { align: "center" });
  y = 38;

  // ── Statut badge ──
  const statutColors = { valide: [27, 94, 32], soumis: [13, 71, 161] };
  const sc = statutColors[fiche.statut] || [100, 100, 100];
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...sc);
  doc.text((fiche.statut || "").toUpperCase(), pageW - margin, y, { align: "right" });

  // ── Superviseur général ──
  doc.setTextColor(100, 100, 100);
  doc.setFont("helvetica", "normal");
  doc.text("Superviseur :", margin, y);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(34, 34, 34);
  const supNomRecolte = fiche.superviseur_general || "—";
  const supTelRecolte = fiche.superviseur_general_telephone ? `  •  ${fiche.superviseur_general_telephone}` : "";
  doc.text(supNomRecolte + supTelRecolte, margin + 28, y);
  y += 7;

  // ── Adjoints ──
  if (superviseurs.length > 0) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text("Adjoint(s) :", margin, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(34, 34, 34);
    doc.text(superviseurs.map((s) => s.nom).join(", "), margin + 24, y);
    y += 7;
  }

  // ── Validation ──
  if (fiche.statut === "valide" && (fiche.validated_by_display || fiche.validated_at)) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(46, 125, 50);
    const valTxt = `Validée${fiche.validated_by_display ? ` par ${fiche.validated_by_display}` : ""}${fiche.validated_at ? ` le ${new Date(fiche.validated_at).toLocaleDateString("fr-FR")}` : ""}`;
    doc.text(valTxt, margin, y);
    y += 7;
  }
  y += 2;

  // ── KPI boxes ──
  const kpis = [
    { label: "TOTAL RÉGIMES", value: fmt(totalRegimes), color: [34, 34, 34] },
    { label: "PRIX RÉCOLTE",  value: `${fmt(totalPrix)} F`, color: [21, 101, 192] },
    { label: "DÉPENSES",      value: `${fmt(depTotal)} F`,  color: [183, 28, 28] },
  ];
  const kpiW = (pageW - margin * 2 - 4) / kpis.length;
  const boxH = 18;
  kpis.forEach((kpi, i) => {
    const bx = margin + i * (kpiW + 2);
    const cx = bx + kpiW / 2;
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(bx, y, kpiW, boxH, 2, 2, "F");
    doc.setDrawColor(220, 225, 235);
    doc.roundedRect(bx, y, kpiW, boxH, 2, 2, "S");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(150, 150, 150);
    doc.text(kpi.label, cx, y + 5, { align: "center" });
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...kpi.color);
    doc.text(kpi.value, cx, y + 13, { align: "center" });
  });
  y += boxH + 8;

  // ── Barème ──
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(80, 80, 80);
  doc.text("Barème :", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(34, 34, 34);
  doc.text(
    `Grands : ${fiche.bareme_grands || 0} F/rég.   Moyens : ${fiche.bareme_moyens || 0} F/rég.   Petits : ${fiche.bareme_petits || 0} F/rég.`,
    margin + 18, y
  );
  y += 10;

  // ── Tableau lignes récolte ──
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Récolteur", "Type de régime", "Secteurs", "Quantité", "Salaire (FCFA)"]],
    body: lignes.map((l) => [
      l.recolteur_nom_display || l.recolteur_nom || "—",
      REGIME_LABEL[l.regime_type] || l.regime_type,
      (l.details || []).map((d) => d.secteur_code).join(", ") || "—",
      fmt((l.details || []).reduce((s, d) => s + Number(d.quantite || 0), 0)),
      fmt(l.salaire_calcule || l.prix_fcfa || 0),
    ]),
    foot: [["", "", "", "Total régimes", fmt(totalRegimes)]],
    headStyles: { fillColor: [31, 78, 121], textColor: 255, fontStyle: "bold", fontSize: 9 },
    footStyles: { fillColor: [235, 240, 248], textColor: [31, 78, 121], fontStyle: "bold", fontSize: 9 },
    alternateRowStyles: { fillColor: [250, 252, 255] },
    columnStyles: { 3: { halign: "right" }, 4: { halign: "right", fontStyle: "bold" } },
    styles: { fontSize: 9, cellPadding: { top: 3, bottom: 3, left: 4, right: 4 } },
    showFoot: "lastPage",
  });
  y = doc.lastAutoTable.finalY + 10;

  // ── Dépenses ──
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Poste de dépense", "Montant (FCFA)"]],
    body: [
      ["Nourriture",         fmt(depNourriture)],
      ["Transport",          fmt(depTransport)],
      ["Salaires récolteurs",fmt(depSalaire)],
    ],
    foot: [["TOTAL DÉPENSES", fmt(depTotal)]],
    headStyles: { fillColor: [183, 28, 28], textColor: 255, fontStyle: "bold", fontSize: 9 },
    footStyles: { fillColor: [251, 233, 231], textColor: [183, 28, 28], fontStyle: "bold", fontSize: 9 },
    columnStyles: { 1: { halign: "right" } },
    styles: { fontSize: 9, cellPadding: { top: 3, bottom: 3, left: 4, right: 4 } },
    showFoot: "lastPage",
  });
  y = doc.lastAutoTable.finalY + 10;

  // ── Reçus de vente ──
  if (recus.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Client", "Date", "Pesée (kg)", "Non conf. (%)", "Montant (FCFA)"]],
      body: recus.map((r) => [
        r.client || "—",
        r.date || "—",
        fmt(r.pesee_kg),
        r.non_conformes_pct || 0,
        fmt(r.montant),
      ]),
      headStyles: { fillColor: [21, 101, 192], textColor: 255, fontStyle: "bold", fontSize: 9 },
      alternateRowStyles: { fillColor: [250, 252, 255] },
      columnStyles: { 4: { halign: "right", fontStyle: "bold" } },
      styles: { fontSize: 9, cellPadding: { top: 3, bottom: 3, left: 4, right: 4 } },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  // ── Observations ──
  if (fiche.observations) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(80, 80, 80);
    doc.text("Observations :", margin, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(34, 34, 34);
    const lines = doc.splitTextToSize(fiche.observations, pageW - margin * 2);
    doc.text(lines, margin, y + 6);
  }

  // ── Pied de page ──
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(180, 180, 180);
    doc.setFont("helvetica", "normal");
    doc.text(
      `Généré le ${new Date().toLocaleDateString("fr-FR")}  —  Page ${p} / ${totalPages}`,
      pageW / 2, pageH - 8, { align: "center" }
    );
    doc.setDrawColor(220, 220, 220);
    doc.line(margin, pageH - 12, pageW - margin, pageH - 12);
  }

  doc.save(`fiche_recolte_${fiche.date || fiche.id}.pdf`);
}

// ── Composant ─────────────────────────────────────────────────────────────────
export default function FicheDialog({ open, onClose, fiche }) {
  useBodyScrollLock(!!open);
  if (!open || !fiche) return null;

  const lignes      = fiche.lignes || [];
  const superviseurs = fiche.superviseurs_adjoints || [];
  const recus       = fiche.recus || [];

  const getRecolteurName = (line) =>
    line.recolteur_nom_display || line.recolteur_nom || "Sans nom";

  const regimeLabel = (r) => REGIME_LABEL[r] || r;

  const totalRegimes = lignes.reduce(
    (sum, line) =>
      sum + (line.details || []).reduce((s, d) => s + (Number(d.quantite) || 0), 0),
    0
  );
  const totalPrix    = lignes.reduce((sum, line) => sum + (Number(line.prix_fcfa) || 0), 0);
  const depNourriture = Number(fiche.depense_nourriture || 0);
  const depTransport  = Number(fiche.depense_transport  || 0);
  const depSalaire    = Number(fiche.depense_salaire    || 0);
  const depTotal      = Number(fiche.depense_total      || 0) || depNourriture + depTransport + depSalaire;

  const totals = { totalRegimes, totalPrix, depNourriture, depTransport, depSalaire, depTotal };

  const totalRowStyle = {
    borderTop: "2px solid #e0e0e0", paddingTop: 6, marginTop: 4,
    fontWeight: 700, color: "#b71c1c",
  };

  return (
    <div className="dialog-backdrop">
      <div className="dialog fiche-dialog" onClick={(e) => e.stopPropagation()}>

        {/* ── En-tête avec bouton PDF ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h3 style={{ margin: 0 }}>Détails de la fiche</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => buildPDF(fiche, totals)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: "#1f4e79", color: "#fff",
                border: "none", borderRadius: 8,
                padding: "7px 14px", fontSize: 13,
                fontWeight: 600, cursor: "pointer",
              }}
            >
              <Download size={14} strokeWidth={2.2} />
              PDF
            </button>
            <button className="dialog-close" style={{ position: "static" }} onClick={onClose}>Fermer</button>
          </div>
        </div>

        {/* Bandeau validation */}
        {fiche.statut === "valide" && (fiche.validated_by_display || fiche.validated_at) && (
          <div style={{
            background: "#e8f5e9", border: "1px solid #a5d6a7",
            borderRadius: 8, padding: "8px 14px", marginBottom: 14,
            fontSize: 13, color: "#2e7d32", display: "flex", alignItems: "center", gap: 8,
          }}>
            <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
            <span>
              Validée{fiche.validated_by_display ? <> par <strong>{fiche.validated_by_display}</strong></> : ""}
              {fiche.validated_at ? <> le <strong>{fmtDateTime(fiche.validated_at)}</strong></> : ""}
            </span>
          </div>
        )}

        {/* En-tete */}
        <div className="fiche-dialog-grid">
          <div><strong>Date :</strong> {fiche.date}</div>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
            <strong>Superviseur :</strong> {fiche.superviseur_general || "-"}
            {fiche.superviseur_general_telephone && (
              <span style={{ marginLeft: 4, fontSize: 12, fontWeight: 700, background: "#e3f2fd", color: "#1565c0", padding: "2px 8px", borderRadius: 10, border: "1px solid #90caf9", display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Phone size={11} /> {fiche.superviseur_general_telephone}
              </span>
            )}
          </div>
          <div><strong>Statut :</strong> {fiche.statut_display || fiche.statut || "-"}</div>
          <div><strong>Total régimes :</strong> {fmt(totalRegimes)}</div>
          <div><strong>Prix récolte :</strong> {fmt(totalPrix)} FCFA</div>
          {fiche.heure_debut && <div><strong>Heure début :</strong> {fiche.heure_debut}</div>}
          {fiche.heure_fin  && <div><strong>Heure fin :</strong>   {fiche.heure_fin}</div>}
          {fiche.conditions_meteo && <div><strong>Météo :</strong> {fiche.conditions_meteo}</div>}
          {fiche.nb_palmiers_recoltes != null && <div><strong>Palmiers récoltés :</strong> {fmt(fiche.nb_palmiers_recoltes)}</div>}
          {fiche.surface_recoltee_ha != null  && <div><strong>Surface récoltée :</strong> {fiche.surface_recoltee_ha} ha</div>}
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

        {/* Dépenses */}
        <div className="fiche-dialog-section">
          <h4>Dépenses</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Nourriture</span><span>{fmt(depNourriture)} FCFA</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Transport</span><span>{fmt(depTransport)} FCFA</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Salaire récolteurs</span><span>{fmt(depSalaire)} FCFA</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", ...totalRowStyle }}>
              <span>TOTAL DÉPENSES</span><span>{fmt(depTotal)} FCFA</span>
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
                  <strong>{s.nom}</strong>
                  {s.matricule && <span className="fiche-chip">{s.matricule}</span>}
                  {s.telephone && <span style={{ color: "#666", fontSize: 13 }}> — {s.telephone}</span>}
                  {s.secteur_ou_recolteur && <span> — {s.secteur_ou_recolteur}</span>}
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
