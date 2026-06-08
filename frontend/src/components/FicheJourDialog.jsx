import { useEffect, useRef } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const fmtInt = (n) => Number(n || 0).toLocaleString("fr-FR");

const REGIME_COLOR = { grands: "#2e7d32", moyens: "#1565c0", petits: "#f9a825" };
const REGIME_LABEL = { grands: "Grands", moyens: "Moyens", petits: "Petits" };

function StatBadge({ label, value, color }) {
  return (
    <div style={{
      textAlign: "center", padding: "8px 14px",
      background: "#f5f5f5", borderRadius: 8, minWidth: 80,
    }}>
      <div style={{ fontSize: 10, color: "#888", fontWeight: 700, textTransform: "uppercase", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{fmtInt(value)}</div>
      <div style={{ fontSize: 10, color: "#aaa" }}>rég.</div>
    </div>
  );
}

function buildPDF(date, fiches, dateLabel) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentW = pageW - margin * 2;
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
  doc.setFont("helvetica", "bold");
  doc.text("Fiche de Recolte", pageW / 2, 13, { align: "center" });

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(dateLabel, pageW / 2, 22, { align: "center" });

  y = 40;

  fiches.forEach((fiche, fi) => {
    // ── Séparateur si plusieurs fiches ──
    if (fi > 0) {
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, y - 4, pageW - margin, y - 4);
      y += 4;
    }

    // ── Numéro fiche (si plusieurs) ──
    if (fiches.length > 1) {
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(21, 101, 192);
      doc.text(`Fiche #${fiche.id}`, margin, y);
      y += 7;
    }

    // ── Ligne meta : superviseur + statut ──
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text("Superviseur :", margin, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(34, 34, 34);
    doc.text(fiche.superviseur_general || "—", margin + 28, y);

    const statutColorMap = {
      valide: [27, 94, 32],
      soumis: [13, 71, 161],
    };
    const sc = statutColorMap[fiche.statut] || [100, 100, 100];
    doc.setTextColor(...sc);
    doc.setFont("helvetica", "bold");
    doc.text((fiche.statut || "—").toUpperCase(), pageW - margin, y, { align: "right" });
    y += 10;

    // ── KPI boxes ──
    const kpis = [
      { label: "TOTAL",  value: fiche.total_regimes, color: [34, 34, 34] },
      { label: "GRANDS", value: fiche.grands,         color: [46, 125, 50] },
      { label: "MOYENS", value: fiche.moyens,          color: [21, 101, 192] },
      { label: "PETITS", value: fiche.petits,          color: [180, 120, 10] },
    ];
    const kpiW = (contentW - 6) / kpis.length;
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

      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...kpi.color);
      doc.text(fmtInt(kpi.value), cx, y + 13, { align: "center" });
    });
    y += boxH + 8;

    // ── Tableau récolteurs ──
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Recolteur", "Type de regime", "Secteurs", "Quantite"]],
      body: fiche.lignes.map((l) => [
        l.recolteur_nom || "—",
        REGIME_LABEL[l.regime_type] || l.regime_type,
        l.details.map((d) => d.secteur_code).join(", ") || "—",
        fmtInt(l.total),
      ]),
      foot: [["", "", "Total regimes", fmtInt(fiche.total_regimes)]],
      headStyles: {
        fillColor: [31, 78, 121],
        textColor: 255,
        fontStyle: "bold",
        fontSize: 9,
        halign: "left",
      },
      footStyles: {
        fillColor: [235, 240, 248],
        textColor: [31, 78, 121],
        fontStyle: "bold",
        fontSize: 9,
      },
      alternateRowStyles: { fillColor: [250, 252, 255] },
      columnStyles: {
        0: { fontStyle: "bold" },
        3: { halign: "right", fontStyle: "bold" },
      },
      styles: { fontSize: 9, cellPadding: { top: 4, bottom: 4, left: 4, right: 4 } },
      showFoot: "lastPage",
    });

    y = doc.lastAutoTable.finalY + 14;
  });

  // ── Pied de page sur chaque page ──
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(180, 180, 180);
    doc.setFont("helvetica", "normal");
    const generated = `Genere le ${new Date().toLocaleDateString("fr-FR")}  —  Page ${p} / ${totalPages}`;
    doc.text(generated, pageW / 2, pageH - 8, { align: "center" });
    doc.setDrawColor(220, 220, 220);
    doc.line(margin, pageH - 12, pageW - margin, pageH - 12);
  }

  doc.save(`fiche_recolte_${date}.pdf`);
}

export default function FicheJourDialog({ open, date, fiches, loading, onClose }) {
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const dateLabel = date
    ? new Date(date + "T00:00:00").toLocaleDateString("fr-FR", {
        weekday: "long", day: "numeric", month: "long", year: "numeric",
      })
    : "";

  const canDownload = !loading && fiches && fiches.length > 0;

  return (
    <div
      ref={overlayRef}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,.45)",
        zIndex: 3000,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div style={{
        background: "#fff", borderRadius: 12,
        width: "100%", maxWidth: 720,
        maxHeight: "88vh",
        display: "flex", flexDirection: "column",
        boxShadow: "0 8px 40px rgba(0,0,0,.28)",
      }}>
        {/* ── En-tête ── */}
        <div style={{
          padding: "16px 20px",
          borderBottom: "1px solid #eee",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 10, color: "#999", textTransform: "uppercase", fontWeight: 700, letterSpacing: ".5px" }}>
              Détails de la récolte
            </div>
            <h3 style={{ margin: "3px 0 0", fontSize: 17, fontWeight: 800, textTransform: "capitalize" }}>
              {dateLabel}
            </h3>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {canDownload && (
              <button
                onClick={() => buildPDF(date, fiches, dateLabel)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: "#1f4e79", color: "#fff",
                  border: "none", borderRadius: 8,
                  padding: "7px 14px", fontSize: 13,
                  fontWeight: 600, cursor: "pointer",
                }}
                title="Télécharger la fiche en PDF"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                PDF
              </button>
            )}
            <button
              onClick={onClose}
              style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#666", lineHeight: 1, padding: "4px 8px" }}
            >
              ×
            </button>
          </div>
        </div>

        {/* ── Corps ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px" }}>
          {loading && (
            <div style={{ textAlign: "center", padding: 48, color: "#888", fontSize: 14 }}>
              Chargement…
            </div>
          )}

          {!loading && (!fiches || fiches.length === 0) && (
            <div style={{ textAlign: "center", padding: 48, color: "#aaa", fontSize: 14 }}>
              Aucune fiche trouvée pour cette date.
            </div>
          )}

          {!loading && fiches?.map((fiche, fi) => (
            <div key={fiche.id}>
              {fiches.length > 1 && (
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1565c0", marginBottom: 10 }}>
                  Fiche #{fiche.id}
                </div>
              )}

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12, fontSize: 12, color: "#666" }}>
                <span>Superviseur : <strong>{fiche.superviseur_general}</strong></span>
                <span style={{
                  padding: "2px 10px", borderRadius: 12, fontWeight: 700, fontSize: 11,
                  background: fiche.statut === "valide" ? "#c8e6c9" : fiche.statut === "soumis" ? "#bbdefb" : "#fff9c4",
                  color: fiche.statut === "valide" ? "#1b5e20" : fiche.statut === "soumis" ? "#0d47a1" : "#f57f17",
                }}>
                  {fiche.statut}
                </span>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
                <StatBadge label="Total" value={fiche.total_regimes} color="#222" />
                <StatBadge label="Grands" value={fiche.grands} color={REGIME_COLOR.grands} />
                <StatBadge label="Moyens" value={fiche.moyens} color={REGIME_COLOR.moyens} />
                <StatBadge label="Petits" value={fiche.petits} color={REGIME_COLOR.petits} />
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#1f4e79", color: "#fff" }}>
                      {["Récolteur", "Type", "Secteurs concernés", "Quantité"].map((h) => (
                        <th key={h} style={{ padding: "7px 10px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fiche.lignes.map((ligne, li) => (
                      <tr key={li} style={{ background: li % 2 === 0 ? "#fafafa" : "#fff", borderBottom: "1px solid #f0f0f0" }}>
                        <td style={{ padding: "6px 10px", fontWeight: 600 }}>{ligne.recolteur_nom}</td>
                        <td style={{ padding: "6px 10px" }}>
                          <span style={{
                            padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 700,
                            background: `${REGIME_COLOR[ligne.regime_type] || "#888"}22`,
                            color: REGIME_COLOR[ligne.regime_type] || "#555",
                          }}>
                            {REGIME_LABEL[ligne.regime_type] || ligne.regime_type}
                          </span>
                        </td>
                        <td style={{ padding: "6px 10px", color: "#555" }}>
                          {ligne.details.map((d) => d.secteur_code).join(", ")}
                        </td>
                        <td style={{ padding: "6px 10px", fontWeight: 700, textAlign: "right" }}>
                          {fmtInt(ligne.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "#f5f5f5", fontWeight: 700 }}>
                      <td colSpan={3} style={{ padding: "6px 10px", textAlign: "right", color: "#555" }}>Total</td>
                      <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmtInt(fiche.total_regimes)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {fi < fiches.length - 1 && (
                <hr style={{ margin: "20px 0", borderColor: "#eee", borderWidth: "1px 0 0" }} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
