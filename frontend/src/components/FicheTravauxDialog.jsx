/**
 * FicheTravauxDialog.jsx — Dialog de detail d'une fiche de travaux.
 *
 * Affiche le recapitulatif d'une fiche travaux : nature, secteur, consommables,
 * repartition des taches par agent, et cout total calcule cote serveur.
 * Permet l'impression PDF via jsPDF + jspdf-autotable.
 *
 * Cout total = somme(consommables) + somme(salaires agents)
 *   — recalcule automatiquement par recalculer_cout() a chaque modification
 *     (voir backend/travaux/models.py).
 *
 * Props :
 *   fiche      — Objet FicheTravaux complet (avec consommables et repartitions)
 *   onClose    — Callback de fermeture
 *   readOnly   — Si true, masque les boutons d'action admin
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { CheckCircle2, Phone } from "lucide-react";
import useBodyScrollLock from "../utils/useBodyScrollLock.js";

const fmt = (n) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(n || 0));

const fmtDateTime = (iso) => {
  if (!iso) return "";
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
};

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

  const totalConsommables = consommables.reduce(
    (s, c) => s + (Number(c.quantite) || 0) * (Number(c.prix_unitaire) || 0), 0
  );
  const totalRepartitions = repartitions.reduce(
    (s, r) => s + (Number(r.quantite) || 0) * (Number(r.prix_unitaire) || 0), 0
  );
  const totalSalaire = Number(fiche.salaire_total) || 0;
  const coutTotalComplet = totalConsommables + totalRepartitions + totalSalaire;

  const handleDownloadPDF = () => {
    const fmtN = (n) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(n || 0));
    const avancementLabel = { planifie: "Planifié", en_cours: "En cours", termine: "Terminé" };

    const doc   = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 15;
    let y = 0;

    // ── Bandeau header ──────────────────────────────────────────────────────────
    doc.setFillColor(31, 78, 121);
    doc.rect(0, 0, pageW, 30, "F");
    doc.setTextColor(200, 220, 255);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("GESTION PALMERAIE", margin, 10);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(17);
    doc.text("Fiche de Travaux", pageW / 2, 13, { align: "center" });
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(fiche.periode_travaux || "", pageW / 2, 22, { align: "center" });
    y = 38;

    // ── Statut ──────────────────────────────────────────────────────────────────
    const sc = fiche.statut === "valide" ? [27, 94, 32] : [100, 100, 100];
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...sc);
    doc.text((fiche.statut || "brouillon").toUpperCase(), pageW - margin, y, { align: "right" });

    // ── Superviseur ─────────────────────────────────────────────────────────────
    doc.setTextColor(100, 100, 100);
    doc.setFont("helvetica", "normal");
    doc.text("Superviseur :", margin, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(34, 34, 34);
    const supNomTravaux = fiche.superviseur_travaux || "—";
    const supTelTravaux = fiche.superviseur_travaux_telephone ? `  •  ${fiche.superviseur_travaux_telephone}` : "";
    doc.text(supNomTravaux + supTelTravaux, margin + 30, y);
    y += 7;

    // ── Validation ──────────────────────────────────────────────────────────────
    if (fiche.statut === "valide" && (fiche.validated_by_display || fiche.validated_at)) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(46, 125, 50);
      const valTxt = `Validée${fiche.validated_by_display ? ` par ${fiche.validated_by_display}` : ""}${fiche.validated_at ? ` le ${new Date(fiche.validated_at).toLocaleDateString("fr-FR")}` : ""}`;
      doc.text(valTxt, margin, y);
      y += 7;
    }
    y += 2;

    // ── Infos générales ─────────────────────────────────────────────────────────
    const infos = [
      ["Nature des travaux", fiche.nature_travaux_display || fiche.nature_travaux || "—"],
      fiche.type_travaux ? ["Type", fiche.type_travaux_display || fiche.type_travaux] : null,
      ["Date début",         fiche.date_debut  || "—"],
      ["Date fin",           fiche.date_fin    || "—"],
      ["Superficie",         fiche.superficie_couverte_ha != null ? `${fiche.superficie_couverte_ha} ha` : "—"],
      ["Nb personnes",       fiche.nb_personnes != null ? String(fiche.nb_personnes) : "—"],
      fiche.salaire_total != null ? ["Salaire travailleurs", `${Number(fiche.salaire_total).toLocaleString("fr-FR")} FCFA`] : null,
      ["Avancement",         avancementLabel[fiche.statut_avancement] || fiche.statut_avancement || "—"],
      ["Secteurs couverts",  secteurs.length ? secteurs.join(", ") : "—"],
    ].filter(Boolean);

    const colW = (pageW - margin * 2) / 2;
    infos.forEach((row, i) => {
      const col = i % 2;
      const x   = margin + col * colW;
      if (col === 0 && i > 0) y += 8;
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(120, 120, 120);
      doc.text(row[0] + " :", x, y);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(34, 34, 34);
      doc.text(row[1], x + colW * 0.45, y);
    });
    if (infos.length % 2 !== 0) y += 8;
    y += 6;

    // ── Tableau consommables ────────────────────────────────────────────────────
    if (consommables.length > 0) {
      const totalCons = consommables.reduce((s, c) => s + (Number(c.quantite) || 0) * (Number(c.prix_unitaire) || 0), 0);
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [["Désignation", "Quantité", "Prix unit. (FCFA)", "Total (FCFA)", "Fournisseur"]],
        body: consommables.map((c) => [
          c.designation || "—",
          `${fmtN(c.quantite)} ${c.unite || ""}`.trim(),
          fmtN(c.prix_unitaire),
          fmtN((Number(c.quantite) || 0) * (Number(c.prix_unitaire) || 0)),
          c.fournisseur || "—",
        ]),
        foot: [["", "", "Total consommables", fmtN(totalCons), ""]],
        headStyles:  { fillColor: [31, 78, 121], textColor: 255, fontStyle: "bold", fontSize: 8 },
        footStyles:  { fillColor: [232, 245, 233], textColor: [27, 94, 32], fontStyle: "bold", fontSize: 8 },
        alternateRowStyles: { fillColor: [250, 252, 255] },
        columnStyles: { 2: { halign: "right" }, 3: { halign: "right", fontStyle: "bold" } },
        styles: { fontSize: 8, cellPadding: { top: 3, bottom: 3, left: 4, right: 4 } },
        showFoot: "lastPage",
        didDrawPage: (d) => { doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(80,80,80); doc.text("Consommables", margin, d.cursor.y - (d.table.body.length > 0 ? d.table.body[0].height : 0) - 4); },
      });
      y = doc.lastAutoTable.finalY + 10;
    }

    // ── Tableau répartition des tâches ──────────────────────────────────────────
    if (repartitions.length > 0) {
      const totalSal = repartitions.reduce((s, r) => s + (Number(r.quantite) || 0) * (Number(r.prix_unitaire) || 0), 0);
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [["Nom / Prénom", "Matricule", "Nature tâche", "Quantité", "Prix unit. (FCFA)", "Salaire (FCFA)"]],
        body: repartitions.map((r) => [
          r.nom_prenom || "—",
          r.matricule_ouvrier || "—",
          r.nature_taches || "—",
          fmtN(r.quantite),
          fmtN(r.prix_unitaire),
          fmtN((Number(r.quantite) || 0) * (Number(r.prix_unitaire) || 0)),
        ]),
        foot: [["", "", "", "", "Total salaires", fmtN(totalSal)]],
        headStyles:  { fillColor: [0, 105, 92], textColor: 255, fontStyle: "bold", fontSize: 8 },
        footStyles:  { fillColor: [232, 245, 233], textColor: [27, 94, 32], fontStyle: "bold", fontSize: 8 },
        alternateRowStyles: { fillColor: [240, 253, 250] },
        columnStyles: { 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right", fontStyle: "bold" } },
        styles: { fontSize: 8, cellPadding: { top: 3, bottom: 3, left: 4, right: 4 } },
        showFoot: "lastPage",
      });
      y = doc.lastAutoTable.finalY + 10;
    }

    // ── Bloc coût total ─────────────────────────────────────────────────────────
    const _totalCons = consommables.reduce((s, c) => s + (Number(c.quantite) || 0) * (Number(c.prix_unitaire) || 0), 0);
    const _totalRep  = repartitions.reduce((s, r) => s + (Number(r.quantite) || 0) * (Number(r.prix_unitaire) || 0), 0);
    const _totalSal  = Number(fiche.salaire_total) || 0;
    const coutTotal = fmtN(_totalCons + _totalRep + _totalSal);
    const boxW = 80;
    const boxX = pageW - margin - boxW;
    doc.setFillColor(31, 78, 121);
    doc.roundedRect(boxX, y, boxW, 16, 2, 2, "F");
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(200, 220, 255);
    doc.text("COÛT TOTAL", boxX + boxW / 2, y + 5, { align: "center" });
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text(`${coutTotal} FCFA`, boxX + boxW / 2, y + 13, { align: "center" });
    y += 22;

    // ── Observations ────────────────────────────────────────────────────────────
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

    // ── Pied de page ────────────────────────────────────────────────────────────
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

    const slug = (fiche.periode_travaux || `fiche-${fiche.id}`).replace(/\s/g, "_");
    doc.save(`travaux_${slug}.pdf`);
  };

  const avancement = fiche.statut_avancement || "";

  return (
    <div className="dialog-backdrop">
      <div className="dialog fiche-dialog" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 8 }}>
          <button
            onClick={handleDownloadPDF}
            style={{ padding: "5px 14px", borderRadius: 6, border: "1px solid #1565c0", background: "#e3f2fd", color: "#1565c0", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
          >
            Télécharger PDF
          </button>
          <button
            onClick={onClose}
            style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: 13 }}
          >
            Fermer
          </button>
        </div>

        <h3>Détails de la fiche travaux</h3>

        {/* ── Bandeau validation ── */}
        {fiche.statut === "valide" && (fiche.validated_by_display || fiche.validated_at) && (
          <div style={{
            background: "#e8f5e9", border: "1px solid #a5d6a7",
            borderRadius: 8, padding: "8px 14px", marginBottom: 14,
            display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#2e7d32",
          }}>
            <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
            <span>
              Validée{fiche.validated_by_display
                ? <> par <strong>{fiche.validated_by_display}</strong></>
                : ""}
              {fiche.validated_at
                ? <> le <strong>{fmtDateTime(fiche.validated_at)}</strong></>
                : ""}
            </span>
          </div>
        )}

        {/* ── En-tête ── */}
        <div className="fiche-dialog-grid">
          <div>
            <strong>Statut :</strong>{" "}
            <span style={{
              display: "inline-block", padding: "2px 10px", borderRadius: 12, fontWeight: 700, fontSize: 12,
              background: fiche.statut === "valide" ? "#e8f5e9" : "#fff8e1",
              color: fiche.statut === "valide" ? "#2e7d32" : "#f57f17",
            }}>
              {fiche.statut === "valide" ? "Validée" : fiche.statut || "Brouillon"}
            </span>
          </div>
          <div>
            <strong>Superviseur :</strong> {fiche.superviseur_travaux || "-"}
            {fiche.superviseur_travaux_telephone && (
              <span style={{
                marginLeft: 8, fontSize: 12, fontWeight: 700,
                background: "#e3f2fd", color: "#1565c0",
                padding: "2px 8px", borderRadius: 10,
                border: "1px solid #90caf9",
                display: "inline-flex", alignItems: "center", gap: 4,
              }}>
                <Phone size={11} /> {fiche.superviseur_travaux_telephone}
              </span>
            )}
          </div>
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
          {fiche.salaire_total != null && (
            <div>
              <strong>Salaire travailleurs :</strong>{" "}
              <span style={{ color: "#1b5e20", fontWeight: 700 }}>
                {Number(fiche.salaire_total).toLocaleString("fr-FR")} FCFA
              </span>
            </div>
          )}
          <div>
            <strong>Coût total :</strong>{" "}
            {fmt(coutTotalComplet)} FCFA
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
