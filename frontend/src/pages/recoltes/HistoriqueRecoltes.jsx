/**
 * HistoriqueRecoltes.jsx — Page centrale de gestion des recoltes.
 *
 * La page est organisee en 4 onglets (?tab=) :
 *   saisie     — Formulaire de creation/edition d'une fiche recolte (superviseur)
 *   analyses   — Graphiques et KPIs agreges par annee/secteur/regime
 *   historique — Tableau paginable + filtres ; actions validation/rejet (admin)
 *   ventes     — Recus de vente associes aux fiches validees
 *
 * Acces :
 *   - superviseur : voit ses propres fiches, peut saisir et soumettre
 *   - admin : voit toutes les fiches, peut valider/rejeter
 *   L'API filtre automatiquement selon le role du token.
 *
 * Etat global partage entre onglets via RecoltesContext (pendingCount).
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ficheRecolteInitial,
  regimeTypes,
  secteurCodes,
} from "../../data/ficheRecolteData.js";
import { useToast } from "../../context/ToastContext.jsx";
import { listSecteurs } from "../../services/secteurService.js";
import { createFiche, deleteFiche, getRecoltesAnalytics, listFiches, patchFiche, updateFiche } from "../../services/recolteService.js";
import { createRecuVente, deleteRecuVente, getParametreBonus, listRecusVente, rejeterRecu, updateRecuVente, validerRecu } from "../../services/recuVenteService.js";
import { useRecoltes } from "../../context/RecoltesContext.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { listRecolteurs } from "../../services/recolteurService.js";
import { listAgents } from "../../services/agentService.js";
import { apiGet } from "../../api/axios.js";
import { endpoints } from "../../api/endpoints.js";
import DataTable from "../../components/DataTable.jsx";
import LogoLoader from "../../components/LogoLoader.jsx";
import FicheDialog from "../../components/FicheDialog.jsx";
import ChartCard from "../../components/ChartCard.jsx";
import ChartDialog from "../../components/ChartDialog.jsx";
import SuccessDialog from "../../components/SuccessDialog.jsx";
import SearchableSelect from "../../components/SearchableSelect.jsx";
import ClientSelect from "../../components/ClientSelect.jsx";
import { listClients } from "../../services/clientService.js";
import { getToken } from "../../services/authService.js";
import { saveRecolteOffline } from "../../utils/offline.js";
import useBodyScrollLock from "../../utils/useBodyScrollLock.js";
import { sanitizeDecimal } from "../../utils/number.js";

const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";

// ── Dialog création / modification d'un recu de vente ────────────────────────
const VENTE_EMPTY = {
  fiche: "", date: "", client_obj: "", client: "",
  pesee_kg: "", non_conformes_pct: "", montant: "", prix_officiel: "",
  reference_facture: "", mode_paiement: "", vehicule_transport: "",
};

function VenteDialog({ open, row, isAdmin, prixOfficielGlobal, historyRows, clientsList, saving, onClose, onSubmit }) {
  const [form, setForm] = useState(VENTE_EMPTY);
  const [errors, setErrors] = useState({});
  useBodyScrollLock(!!open);

  useEffect(() => {
    if (!open) return;
    if (row) {
      setForm({
        fiche: row.fiche ?? "",
        date: row.date ?? "",
        client_obj: row.client_obj ?? "",
        client: row.client ?? "",
        pesee_kg: row.pesee_kg ?? "",
        non_conformes_pct: row.non_conformes_pct ?? "",
        montant: row.montant ?? "",
        prix_officiel: row.prix_officiel ?? "",
        reference_facture: row.reference_facture ?? "",
        mode_paiement: row.mode_paiement ?? "",
        vehicule_transport: row.vehicule_transport ?? "",
      });
    } else {
      setForm({ ...VENTE_EMPTY, prix_officiel: prixOfficielGlobal != null ? String(prixOfficielGlobal) : "" });
    }
    setErrors({});
  }, [open, row]);

  if (!open) return null;

  const set = (field, value) => {
    setForm((p) => {
      const updated = { ...p, [field]: value };
      // Auto-calculer le montant quand pesee_kg ou prix_officiel change
      if (field === "pesee_kg" || field === "prix_officiel") {
        const kg   = Number(field === "pesee_kg"    ? value : p.pesee_kg);
        const prix = Number(field === "prix_officiel" ? value : p.prix_officiel);
        if (kg > 0 && prix > 0) {
          updated.montant = String(Math.round(kg * prix));
        }
      }
      return updated;
    });
    setErrors((p) => ({ ...p, [field]: null }));
  };

  const prixCalcule = form.pesee_kg && form.montant && Number(form.pesee_kg) > 0
    ? (Number(form.montant) / Number(form.pesee_kg)).toFixed(2)
    : null;

  const rapport = prixCalcule && form.prix_officiel && Number(form.prix_officiel) > 0
    ? (Number(prixCalcule) / Number(form.prix_officiel)).toFixed(4)
    : null;

  const submit = () => {
    const errs = {};
    const today = new Date().toISOString().split("T")[0];

    if (!form.fiche) errs.fiche = "Fiche de recolte requise";

    if (!form.date) {
      errs.date = "Date requise";
    } else if (form.date > today) {
      errs.date = "La date ne peut pas être dans le futur";
    } else {
      const ficheSelected = ficheOptions.find((f) => String(f.id) === String(form.fiche));
      if (ficheSelected?.date && form.date < ficheSelected.date) {
        errs.date = `Doit être ≥ date de la fiche (${ficheSelected.date})`;
      }
    }

    if (form.pesee_kg !== "" && Number(form.pesee_kg) < 0) {
      errs.pesee_kg = "La pesée ne peut pas être négative";
    }

    if (form.non_conformes_pct !== "") {
      const pct = Number(form.non_conformes_pct);
      if (pct < 0 || pct > 100) errs.non_conformes_pct = "Valeur entre 0 et 100 %";
    }

    if (!form.montant || Number(form.montant) <= 0) errs.montant = "Montant requis";
    if (Object.keys(errs).length) { setErrors(errs); return; }

    const payload = {
      fiche: Number(form.fiche),
      date: form.date,
      client: form.client || "",
      client_obj: form.client_obj ? Number(form.client_obj) : null,
      pesee_kg: form.pesee_kg !== "" ? Number(form.pesee_kg) : 0,
      non_conformes_pct: form.non_conformes_pct !== "" ? Number(form.non_conformes_pct) : 0,
      montant: Math.round(Number(form.montant)),
      prix_officiel: isAdmin && form.prix_officiel !== "" ? Number(form.prix_officiel) : undefined,
      reference_facture: form.reference_facture || "",
      mode_paiement: form.mode_paiement || null,
      vehicule_transport: form.vehicule_transport || "",
    };
    if (!isAdmin) delete payload.prix_officiel;
    onSubmit(payload);
  };

  const ficheOptions = (historyRows || []).filter((f) => f.statut === "valide");

  const handlePrint = () => {
    const fmtNum = (n) => n != null ? Number(n).toLocaleString("fr-FR", { maximumFractionDigits: 0 }) : "—";
    const modeLabel = { espece: "Espèces", virement: "Virement" };
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Recu de vente #${row?.id}</title>
<style>
  body{font-family:Arial,sans-serif;padding:24px;max-width:580px;margin:0 auto;color:#222}
  h2{text-align:center;color:#1f4e79;border-bottom:3px solid #2e7d32;padding-bottom:8px;margin-bottom:4px}
  .sub{text-align:center;font-size:12px;color:#888;margin-bottom:20px}
  .badge{display:inline-block;background:#e8f5e9;color:#2e7d32;padding:2px 12px;border-radius:12px;font-size:12px;font-weight:700;border:1px solid #a5d6a7}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 20px;margin:18px 0}
  .item .lbl{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.5px}
  .item .val{font-size:14px;font-weight:600;margin-top:2px}
  .total{background:#1f4e79;color:#fff;padding:14px 20px;border-radius:8px;text-align:center;margin:18px 0}
  .total .lbl{font-size:11px;opacity:.8;text-transform:uppercase}
  .total .val{font-size:26px;font-weight:700;margin-top:4px}
  .footer{text-align:center;font-size:10px;color:#bbb;margin-top:28px;border-top:1px solid #eee;padding-top:8px}
  @media print{@page{margin:1.2cm}body{padding:0}}
</style></head><body>
  <h2>RECU DE VENTE</h2>
  <p class="sub">Ref #${row?.id} &nbsp;|&nbsp; <span class="badge">Valide</span></p>
  <div class="grid">
    <div class="item"><div class="lbl">Date de vente</div><div class="val">${row?.date || "—"}</div></div>
    <div class="item"><div class="lbl">Fiche de recolte</div><div class="val">${row?.fiche_date || "—"}</div></div>
    <div class="item"><div class="lbl">Superviseur</div><div class="val">${row?.fiche_superviseur || "—"}${row?.fiche_superviseur_telephone ? ` &nbsp;•&nbsp; ${row.fiche_superviseur_telephone}` : ""}</div></div>
    <div class="item"><div class="lbl">Client</div><div class="val">${row?.client_nom || row?.client || "—"}</div></div>
    <div class="item"><div class="lbl">Pesee</div><div class="val">${row?.pesee_kg != null ? `${Number(row.pesee_kg).toLocaleString("fr-FR")} kg` : "—"}</div></div>
    <div class="item"><div class="lbl">Non conformes</div><div class="val">${row?.non_conformes_pct != null ? `${row.non_conformes_pct} %` : "—"}</div></div>
    <div class="item"><div class="lbl">Prix calcule</div><div class="val">${row?.prix_calcule != null ? `${Number(row.prix_calcule).toLocaleString("fr-FR")} FCFA/kg` : "—"}</div></div>
    <div class="item"><div class="lbl">Mode de paiement</div><div class="val">${modeLabel[row?.mode_paiement] || row?.mode_paiement || "—"}</div></div>
    <div class="item"><div class="lbl">Reference facture</div><div class="val">${row?.reference_facture || "—"}</div></div>
    ${row?.vehicule_transport ? `<div class="item" style="grid-column:1/-1"><div class="lbl">Vehicule de transport</div><div class="val">${row.vehicule_transport}</div></div>` : ""}
  </div>
  <div class="total"><div class="lbl">Montant total</div><div class="val">${fmtNum(row?.montant)} FCFA</div></div>
  <div class="footer">Document genere le ${new Date().toLocaleDateString("fr-FR")} — Gestion Palmeraie</div>
</body></html>`;
    const win = window.open("", "_blank", "width=640,height=820");
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" style={{ padding: 0, overflow: "hidden", maxWidth: 540, width: "95%", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}>

        <div style={{ background: "linear-gradient(135deg, #1f4e79 0%, #2e7d32 100%)", padding: "18px 20px 14px", color: "#fff", position: "relative", flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            {row ? (isAdmin ? "Recu de vente (lecture seule)" : "Modifier le recu de vente") : "Nouveau recu de vente"}
          </div>
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2, display: "flex", alignItems: "center", gap: 8 }}>
            {row ? (
              <>
                Recu #{row.id}
                <span style={{
                  background: row.statut === "valide" ? "rgba(46,125,50,0.45)" : "rgba(245,127,23,0.45)",
                  color: "#fff", padding: "1px 9px", borderRadius: 10, fontWeight: 700, fontSize: 11,
                }}>
                  {row.statut === "valide" ? "Validé" : "Brouillon"}
                </span>
              </>
            ) : "Rattacher a une fiche de recolte"}
          </div>
          <button onClick={onClose} style={{ position: "absolute", top: 12, right: 12, background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 6, color: "#fff", padding: "4px 10px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>✕</button>
        </div>

        {isAdmin && row && (
          <div style={{ background: "#fff3e0", borderBottom: "1px solid #ffe0b2", padding: "8px 20px", fontSize: 12, color: "#e65100", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            {row.statut === "valide"
              ? <><strong>Reçu validé</strong> — lecture seule. Pour corriger, supprimez ce reçu et recréez-en un.</>
              : <>Lecture seule — la modification des reçus est réservée aux superviseurs.</>
            }
          </div>
        )}

        <div style={{ padding: "18px 20px", overflowY: "auto", flex: "1 1 0", minHeight: 0 }}>
          {(() => {
            const ro = isAdmin && !!row;
            const roStyle = { background: "#f5f5f5", color: "#444", cursor: "default" };
            return (
              <>
                {/* Fiche */}
                <div className="mfield" style={{ marginBottom: 12 }}>
                  <label className="mfield-label">Fiche de recolte <span style={{ color: "#d32f2f" }}>*</span></label>
                  <select className={`mfield-input${errors.fiche ? " mfield-input--error" : ""}`}
                    value={form.fiche} onChange={(e) => set("fiche", e.target.value)}
                    disabled={ro} style={ro ? roStyle : undefined}>
                    <option value="">-- Choisir une fiche --</option>
                    {ficheOptions.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.date} — {f.superviseur_general || f.created_by_username || `#${f.id}`}
                        {f.total_regimes ? ` · ${Number(f.total_regimes).toLocaleString("fr-FR")} régimes` : ""}
                        {f.nb_recolteurs ? ` · ${f.nb_recolteurs} récolteur${f.nb_recolteurs > 1 ? "s" : ""}` : ""}
                      </option>
                    ))}
                  </select>
                  {errors.fiche && <span className="mfield-error">{errors.fiche}</span>}
                </div>

                {/* Superviseur (lecture seule, avec téléphone en surbrillance) */}
                {row?.fiche_superviseur && (
                  <div style={{ background: "#e3f2fd", border: "1px solid #90caf9", borderRadius: 6, padding: "8px 12px", marginBottom: 12, fontSize: 13, color: "#1565c0", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <strong>Superviseur :</strong> {row.fiche_superviseur}
                    {row.fiche_superviseur_telephone && (
                      <span style={{ fontSize: 12, fontWeight: 700, background: "#e3f2fd", color: "#1565c0", padding: "2px 8px", borderRadius: 10, border: "1px solid #90caf9" }}>
                        📞 {row.fiche_superviseur_telephone}
                      </span>
                    )}
                  </div>
                )}

                {/* Date vente */}
                <div className="mfield" style={{ marginBottom: 12 }}>
                  <label className="mfield-label">Date de vente <span style={{ color: "#d32f2f" }}>*</span></label>
                  <input type="date" className={`mfield-input${errors.date ? " mfield-input--error" : ""}`}
                    value={form.date} onChange={(e) => set("date", e.target.value)}
                    max={new Date().toISOString().split("T")[0]}
                    readOnly={ro} style={ro ? roStyle : undefined} />
                  {errors.date && <span className="mfield-error">{errors.date}</span>}
                </div>

                {/* Client */}
                <div className="mfield" style={{ marginBottom: 12 }}>
                  <label className="mfield-label">Client</label>
                  <select className="mfield-input" value={form.client_obj}
                    onChange={(e) => {
                      const id = e.target.value;
                      const found = (clientsList || []).find((c) => String(c.id) === String(id));
                      set("client_obj", id);
                      set("client", found ? found.nom : "");
                    }}
                    disabled={ro} style={ro ? roStyle : undefined}>
                    <option value="">-- Choisir un client --</option>
                    {(clientsList || []).map((c) => (
                      <option key={c.id} value={c.id}>{c.nom}</option>
                    ))}
                  </select>
                </div>

                {/* Pesée + Non conformes */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div className="mfield">
                    <label className="mfield-label">Pesee (kg)</label>
                    <input type="number" min="0" step="0.01"
                      className={`mfield-input${errors.pesee_kg ? " mfield-input--error" : ""}`}
                      value={form.pesee_kg} onChange={(e) => set("pesee_kg", e.target.value)}
                      readOnly={ro} style={ro ? roStyle : undefined} />
                    {errors.pesee_kg && <span className="mfield-error">{errors.pesee_kg}</span>}
                  </div>
                  <div className="mfield">
                    <label className="mfield-label">Non conformes (%)</label>
                    <input type="number" min="0" max="100" step="0.01"
                      className={`mfield-input${errors.non_conformes_pct ? " mfield-input--error" : ""}`}
                      value={form.non_conformes_pct} onChange={(e) => set("non_conformes_pct", e.target.value)}
                      readOnly={ro} style={ro ? roStyle : undefined} />
                    {errors.non_conformes_pct && <span className="mfield-error">{errors.non_conformes_pct}</span>}
                  </div>
                </div>

                {/* Montant */}
                {(() => {
                  const montantVerrouille = ro || (!isAdmin && form.prix_officiel && Number(form.prix_officiel) > 0);
                  return (
                    <div className="mfield" style={{ marginBottom: 12 }}>
                      <label className="mfield-label">
                        Montant (FCFA) <span style={{ color: "#d32f2f" }}>*</span>
                        {!ro && montantVerrouille && <span style={{ fontSize: 11, color: "#888", marginLeft: 6 }}>(calcule automatiquement)</span>}
                      </label>
                      <input
                        type="number" min="0" step="1" inputMode="numeric"
                        className={`mfield-input${errors.montant ? " mfield-input--error" : ""}`}
                        value={form.montant}
                        onChange={(e) => set("montant", e.target.value)}
                        readOnly={montantVerrouille}
                        style={montantVerrouille ? roStyle : {}}
                      />
                      {errors.montant && <span className="mfield-error">{errors.montant}</span>}
                    </div>
                  );
                })()}

                {/* Prix calculé */}
                {prixCalcule && (
                  <div style={{ background: "#e8f5e9", border: "1px solid #a5d6a7", borderRadius: 6, padding: "8px 12px", marginBottom: 12, fontSize: 13 }}>
                    <strong>Prix calcule :</strong> {Number(prixCalcule).toLocaleString("fr-FR")} FCFA/kg
                    {rapport && isAdmin && (
                      <span style={{ marginLeft: 16 }}>
                        <strong>Rapport :</strong>{" "}
                        <span style={{ color: Number(rapport) >= 1 ? "#2e7d32" : "#c62828", fontWeight: 700 }}>{rapport}</span>
                      </span>
                    )}
                  </div>
                )}

                {/* Prix officiel */}
                {isAdmin ? (
                  <div className="mfield" style={{ marginBottom: 12 }}>
                    <label className="mfield-label">Prix officiel (FCFA/kg)</label>
                    <input type="number" min="0" step="1" className="mfield-input"
                      value={form.prix_officiel} onChange={(e) => set("prix_officiel", e.target.value)}
                      readOnly={ro} style={ro ? roStyle : undefined} />
                  </div>
                ) : form.prix_officiel ? (
                  <div style={{ background: "#e3f2fd", border: "1px solid #90caf9", borderRadius: 6, padding: "8px 12px", marginBottom: 12, fontSize: 13, color: "#1565c0" }}>
                    <strong>Prix officiel :</strong> {Number(form.prix_officiel).toLocaleString("fr-FR")} FCFA/kg
                    <span style={{ fontSize: 11, marginLeft: 8, opacity: 0.7 }}>(fixe par l'administrateur)</span>
                  </div>
                ) : null}

                {/* Référence + Mode paiement + Véhicule */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div className="mfield">
                    <label className="mfield-label">Reference facture</label>
                    <input className="mfield-input" value={form.reference_facture}
                      onChange={(e) => set("reference_facture", e.target.value)}
                      readOnly={ro} style={ro ? roStyle : undefined} />
                  </div>
                  <div className="mfield">
                    <label className="mfield-label">Mode de paiement</label>
                    <select className="mfield-input" value={form.mode_paiement || ""}
                      onChange={(e) => set("mode_paiement", e.target.value || null)}
                      disabled={ro} style={ro ? roStyle : undefined}>
                      <option value="">--</option>
                      <option value="espece">Espece</option>
                      <option value="virement">Virement</option>
                    </select>
                  </div>
                </div>
                <div className="mfield" style={{ marginBottom: 4 }}>
                  <label className="mfield-label">Vehicule de transport</label>
                  <input className="mfield-input" value={form.vehicule_transport}
                    onChange={(e) => set("vehicule_transport", e.target.value)}
                    readOnly={ro} style={ro ? roStyle : undefined} />
                </div>
              </>
            );
          })()}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 20px", borderTop: "1px solid #f0f0f0", background: "#fafafa", flexShrink: 0 }}>
          <button type="button" onClick={onClose} style={{ padding: "8px 18px", borderRadius: 6, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: 13, color: "#555" }}>
            {isAdmin && row ? "Fermer" : "Annuler"}
          </button>
          {row?.statut === "valide" && (
            <button type="button" onClick={handlePrint} style={{ padding: "8px 18px", borderRadius: 6, border: "1px solid #1565c0", background: "#e3f2fd", color: "#1565c0", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
              Imprimer
            </button>
          )}
          {!(isAdmin && row) && (
            <button type="button" onClick={submit} disabled={saving} style={{ padding: "8px 20px", borderRadius: 6, border: "none", background: "linear-gradient(135deg, #1f4e79, #2e7d32)", color: "#fff", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontSize: 13, opacity: saving ? 0.7 : 1 }}>
              {saving ? "Enregistrement..." : row ? "Mettre a jour" : "Enregistrer"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Page Fiche de recolte (format papier)
export default function HistoriqueRecoltes() {
  const { pushToast } = useToast();
  const { user, isAdmin, isSuperviseur, hasPermission } = useAuth();
  const { setPendingCount } = useRecoltes();

  const currentUserDisplayName = user
    ? (`${user.first_name || ""} ${user.last_name || ""}`.trim() || user.username)
    : "";

  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") || (isAdmin ? "historique" : "saisie");
  const setTab = (key) => setSearchParams({ tab: key }, { replace: true });

  // Etat global de la fiche
  const [fiche, setFiche] = useState(ficheRecolteInitial);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  // Secteurs visibles dans la fiche (depuis l'API)
  const [secteurList, setSecteurList] = useState(secteurCodes);
  const [activeSecteurCodes, setActiveSecteurCodes] = useState(
    secteurCodes.map((s) => s.code)
  );
  const [recolteursList, setRecolteursList] = useState([]);
  const [agentsList, setAgentsList] = useState([]);
  const [superviseursList, setSuperviseursList] = useState([]);
  const [clientsList, setClientsList] = useState([]);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [selectedFiche, setSelectedFiche] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [analyticsLoadedOnce, setAnalyticsLoadedOnce] = useState(false);
  const [analyticsYear, setAnalyticsYear] = useState(new Date().getFullYear());
  const [activeChart, setActiveChart] = useState(null);
  const [success, setSuccess] = useState({ open: false, message: "" });
  const [editingFicheId, setEditingFicheId] = useState(null);
  const [confirmValidate, setConfirmValidate] = useState({ open: false, ficheId: null });
  const [confirmRejet, setConfirmRejet] = useState({ open: false, ficheId: null, motif: "" });
  const [historyFilter, setHistoryFilter] = useState("all");

  // ── Ventes ───────────────────────────────────────────────────────────────
  const currentYear = new Date().getFullYear();
  const [baremeDefaut, setBaremeDefaut] = useState({ grands: 60, moyens: 50, petits: 25 });
  const [prixOfficielGlobal, setPrixOfficielGlobal] = useState(null);

  const [ventesRows, setVentesRows] = useState([]);
  const [loadingVentes, setLoadingVentes] = useState(false);
  const [ventesYear, setVentesYear] = useState(currentYear);
  const [venteDialog, setVenteDialog] = useState({ open: false, row: null });
  const [venteSaving, setVenteSaving] = useState(false);
  const [venteToDelete, setVenteToDelete] = useState(null);
  const [venteToValidate, setVenteToValidate] = useState(null);
  const [venteToReject, setVenteToReject] = useState({ open: false, row: null, motif: "" });
  const [ficheToDelete, setFicheToDelete] = useState(null);
  const [venteSearch, setVenteSearch] = useState("");
  const ventesYears = Array.from({ length: 5 }, (_, i) => currentYear - i);

  const loadVentes = async (year) => {
    setLoadingVentes(true);
    try {
      const data = await listRecusVente({ year });
      setVentesRows(Array.isArray(data) ? data : (data.results || []));
    } catch (err) {
      pushToast({ type: "error", title: "Ventes", message: err.message });
    } finally {
      setLoadingVentes(false);
    }
  };

  const handleVenteSave = async (payload) => {
    setVenteSaving(true);
    try {
      if (venteDialog.row) {
        const updated = await updateRecuVente(venteDialog.row.id, payload);
        setVentesRows((prev) => prev.map((r) => r.id === updated.id ? updated : r));
        pushToast({ type: "success", title: "Ventes", message: "Recu mis a jour." });
      } else {
        const created = await createRecuVente(payload);
        setVentesRows((prev) => [created, ...prev]);
        pushToast({ type: "success", title: "Ventes", message: "Recu enregistre." });
      }
      setVenteDialog({ open: false, row: null });
    } catch (err) {
      pushToast({ type: "error", title: "Ventes", message: err.message });
    } finally {
      setVenteSaving(false);
    }
  };

  const handleVenteDelete = async () => {
    try {
      await deleteRecuVente(venteToDelete.id);
      setVentesRows((prev) => prev.filter((r) => r.id !== venteToDelete.id));
      pushToast({ type: "success", title: "Ventes", message: "Recu supprime." });
    } catch (err) {
      pushToast({ type: "error", title: "Ventes", message: err.message });
    } finally {
      setVenteToDelete(null);
    }
  };

  const handleVenteValider = async () => {
    try {
      const updated = await validerRecu(venteToValidate.id);
      setVentesRows((prev) => prev.map((r) => r.id === updated.id ? updated : r));
      pushToast({ type: "success", title: "Ventes", message: "Recu valide." });
    } catch (err) {
      pushToast({ type: "error", title: "Ventes", message: err.message });
    } finally {
      setVenteToValidate(null);
    }
  };

  const handleDeleteFiche = async () => {
    try {
      await deleteFiche(ficheToDelete.id);
      setHistory((prev) => prev.filter((f) => f.id !== ficheToDelete.id));
      if (!isAdmin) setPendingCount((prev) => Math.max(0, prev - 1));
      pushToast({ type: "success", title: "Fiche", message: "Fiche supprimee." });
    } catch (err) {
      pushToast({ type: "error", title: "Fiche", message: err.message });
    } finally {
      setFicheToDelete(null);
    }
  };

  const handleVenteReject = async () => {
    try {
      const updated = await rejeterRecu(venteToReject.row.id, venteToReject.motif);
      setVentesRows((prev) => prev.map((r) => r.id === updated.id ? updated : r));
      pushToast({ type: "success", title: "Ventes", message: "Recu rejete." });
    } catch (err) {
      pushToast({ type: "error", title: "Ventes", message: err.message });
    } finally {
      setVenteToReject({ open: false, row: null, motif: "" });
    }
  };

  // Reconstruit l'état du formulaire depuis une fiche API (pour l'édition)
  const ficheToFormState = (apiFiche, sectorList) => {
    const codes = sectorList.map((s) => s.code);
    let ctr = 0;
    const uid = () => `${Date.now()}-${++ctr}`;
    const emptySec = () => Object.fromEntries(codes.map((c) => [c, ""]));

    const recMap = new Map();
    for (const ligne of apiFiche.lignes || []) {
      const nom = ligne.recolteur_nom_display || ligne.recolteur_nom || "";
      if (!recMap.has(nom)) {
        recMap.set(nom, {
          id: `REC-${uid()}`,
          nom,
          regimes: { grands: emptySec(), moyens: emptySec(), petits: emptySec() },
        });
      }
      const rec = recMap.get(nom);
      const rk = ligne.regime_type;
      for (const det of ligne.details || []) {
        if (det.secteur_code && rec.regimes[rk] !== undefined) {
          rec.regimes[rk][det.secteur_code] = det.quantite ?? "";
        }
      }
    }

    return {
      date: apiFiche.date || "",
      superviseurGeneral: apiFiche.superviseur_general || "",
      superviseurGeneralId: apiFiche.superviseur_general_obj || null,
      bareme: {
        grands: apiFiche.bareme_grands ?? 60,
        moyens: apiFiche.bareme_moyens ?? 50,
        petits: apiFiche.bareme_petits ?? 25,
      },
      depenses: {
        nourriture: apiFiche.depense_nourriture ?? 0,
        transport: apiFiche.depense_transport ?? 0,
        salaire: apiFiche.depense_salaire ?? 0,
      },
      observations: apiFiche.observations || "",
      superviseursAdjoints: (apiFiche.superviseurs_adjoints || []).map((s) => ({
        id: `SA-${uid()}`,
        nom: s.nom || "",
        secteur: s.secteur_ou_recolteur || "",
        agentId: s.agent || null,
      })),
      recolteurs: Array.from(recMap.values()),
    };
  };

  const handleEditFiche = (row) => {
    const formState = ficheToFormState(row, secteurList);
    setFiche(formState);
    setEditingFicheId(row.id);
    setFieldErrors({});
    setTab("saisie");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const scrollToFirstError = () => {
    requestAnimationFrame(() => {
      const root = document.querySelector(".page.fiche");
      if (!root) return;
      const el =
        root.querySelector(".input-error") || root.querySelector(".section-error");
      if (el && typeof el.scrollIntoView === "function") {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  };

  const clearSimpleError = (key) => {
    setFieldErrors((prev) => {
      if (!prev || !prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const clearIdError = (groupKey, id) => {
    setFieldErrors((prev) => {
      const group = prev?.[groupKey];
      if (!group || !group[id]) return prev;
      const nextGroup = { ...group };
      delete nextGroup[id];
      const next = { ...prev, [groupKey]: nextGroup };
      if (Object.keys(nextGroup).length === 0) delete next[groupKey];
      return next;
    });
  };

  const clearNestedError = (groupKey, id, field) => {
    setFieldErrors((prev) => {
      const group = prev?.[groupKey];
      const row = group?.[id];
      if (!row || !row[field]) return prev;
      const nextRow = { ...row };
      delete nextRow[field];
      const nextGroup = { ...group, [id]: nextRow };
      if (Object.keys(nextRow).length === 0) delete nextGroup[id];
      const next = { ...prev, [groupKey]: nextGroup };
      if (Object.keys(nextGroup).length === 0) delete next[groupKey];
      return next;
    });
  };

  // Helper: cree un recolteur vide avec les colonnes secteurs
  const createEmptyRecolteur = (list = secteurList) => {
    const emptyBySecteur = () =>
      Object.fromEntries(list.map((s) => [s.code, ""]));
    return {
      id: `REC-${Date.now()}`,
      nom: "",
      regimes: {
        grands: emptyBySecteur(),
        moyens: emptyBySecteur(),
        petits: emptyBySecteur(),
      },
    };
  };

  const visibleSecteurs = useMemo(() => {
    const selected = new Set(activeSecteurCodes);
    return secteurList.filter((s) => selected.has(s.code));
  }, [secteurList, activeSecteurCodes]);

  const secteursOrRecolteursOptions = useMemo(() => {
    const secs = (secteurList || []).map((sec) => ({
      value: sec.code,
      label: `${sec.code} - ${sec.nom}`,
      group: "Secteurs",
    }));
    const recs = (recolteursList || []).map((r) => ({
      value: r.nom,
      label: `${r.numero_telephone ? `${r.numero_telephone} - ` : ""}${r.nom}`,
      group: "Recolteurs",
    }));
    return [...secs, ...recs];
  }, [secteurList, recolteursList]);

  const secteurChoiceValue = useMemo(() => {
    const all = secteurList.map((s) => s.code);
    const selected = new Set(activeSecteurCodes);

    if (all.length && all.every((c) => selected.has(c)) && selected.size === all.length) {
      return "__all__";
    }
    if (activeSecteurCodes.length === 1) return activeSecteurCodes[0];
    return "__all__";
  }, [secteurList, activeSecteurCodes]);

  // Total regimes pour une ligne (somme sur tous les secteurs de la fiche)
  const calcTotal = (regimesBySecteur) =>
    secteurList.reduce(
      (sum, s) => sum + (Number(regimesBySecteur[s.code]) || 0),
      0
    );

  // Salaire total auto-calculé = somme(régimes × barème) pour chaque récolteur
  const salaireTotalCalcule = useMemo(() => {
    const bg = Number(fiche.bareme.grands) || 0;
    const bm = Number(fiche.bareme.moyens) || 0;
    const bp = Number(fiche.bareme.petits) || 0;
    return (fiche.recolteurs || []).reduce((total, rec) => {
      const g = calcTotal(rec.regimes?.grands || {});
      const m = calcTotal(rec.regimes?.moyens || {});
      const p = calcTotal(rec.regimes?.petits || {});
      return total + g * bg + m * bm + p * bp;
    }, 0);
  }, [fiche.recolteurs, fiche.bareme, secteurList]);

  // Total dépenses = nourriture + transport + salaire (auto)
  const totalDepenses = useMemo(() => {
    const n = Number(fiche.depenses.nourriture) || 0;
    const t = Number(fiche.depenses.transport) || 0;
    return n + t + salaireTotalCalcule;
  }, [fiche.depenses.nourriture, fiche.depenses.transport, salaireTotalCalcule]);

  const analyticsYears = useMemo(() => {
    const y = new Date().getFullYear();
    return Array.from({ length: 10 }, (_, i) => y - i);
  }, []);

  // Chargement des secteurs depuis l'API
  const loadSecteurs = async () => {
    try {
      const data = await listSecteurs();
      // On mappe vers le format attendu dans la fiche
      const mapped = data.map((s) => ({
        id: s.id,
        code: s.code,
        label: s.code,
        nom: s.nom,
      }));
      setSecteurList(mapped.length ? mapped : secteurCodes);
      setActiveSecteurCodes((mapped.length ? mapped : secteurCodes).map((s) => s.code));
    } catch (err) {
      pushToast({ type: "error", title: "Recoltes", message: err.message });
    }
  };

  const loadRecolteurs = async () => {
    try {
      const data = await listRecolteurs();
      setRecolteursList(data || []);
    } catch (err) {
      pushToast({ type: "error", title: "Recoltes", message: err.message });
    }
  };

  const loadAgents = async () => {
    try {
      const data = await listAgents();
      setAgentsList(data || []);
    } catch {
      // silencieux
    }
  };

  const loadSuperviseurs = async () => {
    try {
      const data = await apiGet(endpoints.superviseurs);
      setSuperviseursList(data || []);
    } catch {
      // silencieux — le champ reste utilisable comme texte libre
    }
  };

  const loadClients = async () => {
    try {
      const data = await listClients();
      setClientsList(data || []);
    } catch (err) {
      // Silencieux — la liste déroulante reste vide mais la saisie libre fonctionne
    }
  };

  const loadAnalytics = async (year = analyticsYear) => {
    try {
      setLoadingAnalytics(true);
      const data = await getRecoltesAnalytics(year);
      setAnalytics(data);
      setAnalyticsLoadedOnce(true);
    } catch (err) {
      pushToast({ type: "error", title: "Recoltes", message: err.message });
    } finally {
      setLoadingAnalytics(false);
    }
  };

  useEffect(() => {
    loadSecteurs();
    loadRecolteurs();
    loadAgents();
    loadClients();
    loadSuperviseurs();
    if (!isAdmin && currentUserDisplayName) {
      setFiche((prev) => ({ ...prev, superviseurGeneral: currentUserDisplayName }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // Charger le barème et le prix officiel depuis les paramètres admin
    getParametreBonus().then((data) => {
      const rows = Array.isArray(data) ? data : (data.results || [data]);
      const obj = rows[0] || {};
      const defaut = {
        grands: obj.bareme_grands_defaut ?? 60,
        moyens: obj.bareme_moyens_defaut ?? 50,
        petits: obj.bareme_petits_defaut ?? 25,
      };
      setBaremeDefaut(defaut);
      setFiche((prev) => ({ ...prev, bareme: defaut }));
      if (obj.prix_kg_officiel != null) {
        setPrixOfficielGlobal(Number(obj.prix_kg_officiel));
      }
    }).catch(() => {/* silencieux */});
  }, []);

  // Pre-fill superviseurGeneralId pour que le FK soit envoyé à l'API (et le téléphone récupérable)
  useEffect(() => {
    if (isAdmin || !user || superviseursList.length === 0) return;
    const userLast = (user.last_name || "").toLowerCase().trim();
    const userFirst = (user.first_name || "").toLowerCase().trim();
    const found = superviseursList.find((s) => {
      const supNom = (s.nom || "").toLowerCase().trim();
      const supPrenom = (s.prenom || "").toLowerCase().trim();
      return supNom === userLast && (!userFirst || !supPrenom || supPrenom === userFirst);
    });
    if (found) {
      setFiche((prev) => ({ ...prev, superviseurGeneralId: found.id }));
    }
  }, [superviseursList, user, isAdmin]);

  useEffect(() => {
    if (tab !== "analyses") return;
    loadAnalytics(analyticsYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, analyticsYear]);

  useEffect(() => {
    if (tab !== "historique") return;
    if (historyLoaded) return;
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, historyLoaded]);

  useEffect(() => {
    if (tab !== "ventes") return;
    loadVentes(ventesYear);
    if (!historyLoaded) loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, ventesYear]);

  // Lorsqu'on change d'onglet, on ferme les popups ouvertes (evite les superpositions bizarres)
  useEffect(() => {
    setSelectedFiche(null);
    setActiveChart(null);
  }, [tab]);

  // Synchronise les colonnes des regimes si la liste des secteurs change
  useEffect(() => {
    setFiche((prev) => {
      const codes = secteurList.map((s) => s.code);
      const sync = (regimes) =>
        Object.fromEntries(codes.map((c) => [c, regimes[c] ?? ""]));

      return {
        ...prev,
        recolteurs: prev.recolteurs.map((r) => ({
          ...r,
          regimes: {
            grands: sync(r.regimes.grands),
            moyens: sync(r.regimes.moyens),
            petits: sync(r.regimes.petits),
          },
        })),
      };
    });
  }, [secteurList]);

  // Mise a jour des champs simples (date, superviseur)
  const handleHeaderChange = (e) => {
    const { name, value } = e.target;
    setFiche((prev) => ({ ...prev, [name]: value }));
    if (name === "date") clearSimpleError("date");
    if (name === "superviseurGeneral") clearSimpleError("superviseurGeneral");
  };

  // Bareme (Grds/Moy/Ptits)
  const handleBaremeChange = (key, value) => {
    setFiche((prev) => ({
      ...prev,
      bareme: { ...prev.bareme, [key]: value },
    }));
  };

  // Superviseurs adjoints — sélection depuis la liste déroulante des agents
  const handleAdjointAgentChange = (adjointId, agentId) => {
    const agent = agentsList.find((a) => String(a.id) === String(agentId));
    setFiche((prev) => ({
      ...prev,
      superviseursAdjoints: prev.superviseursAdjoints.map((s) =>
        s.id === adjointId
          ? { ...s, nom: agent ? (agent.nom_complet || `${agent.nom} ${agent.prenom || ""}`.trim()) : "", agentId: agent?.id || null }
          : s
      ),
    }));
    clearNestedError("adjoints", adjointId, "nom");
  };

  const handleAdjointChange = (id, field, value) => {
    setFiche((prev) => ({
      ...prev,
      superviseursAdjoints: prev.superviseursAdjoints.map((s) =>
        s.id === id ? { ...s, [field]: value } : s
      ),
    }));
    clearNestedError("adjoints", id, field);
  };

  const addAdjoint = () => {
    setFiche((prev) => ({
      ...prev,
      superviseursAdjoints: [
        ...prev.superviseursAdjoints,
        { id: `SA-${Date.now()}`, nom: "", secteur: "", agentId: null },
      ],
    }));
  };

  const removeAdjoint = (id) => {
    setFiche((prev) => ({
      ...prev,
      superviseursAdjoints: prev.superviseursAdjoints.filter((s) => s.id !== id),
    }));
    clearIdError("adjoints", id);
  };

  // Recolteurs (nom)
  const handleRecolteurName = (id, value) => {
    setFiche((prev) => ({
      ...prev,
      recolteurs: prev.recolteurs.map((r) =>
        r.id === id ? { ...r, nom: value } : r
      ),
    }));
    clearIdError("recolteurs", id);
  };

  const addRecolteur = () => {
    setFiche((prev) => ({
      ...prev,
      recolteurs: [...prev.recolteurs, createEmptyRecolteur()],
    }));
  };

  const removeRecolteur = (id) => {
    setFiche((prev) => ({
      ...prev,
      recolteurs: prev.recolteurs.filter((r) => r.id !== id),
    }));
    clearIdError("recolteurs", id);
  };

  // Mise a jour des regimes (cellules du grand tableau)
  const handleRegimeChange = (recolteurId, regimeKey, secteurKey, value) => {
    setFiche((prev) => ({
      ...prev,
      recolteurs: prev.recolteurs.map((r) => {
        if (r.id !== recolteurId) return r;
        return {
          ...r,
          regimes: {
            ...r.regimes,
            [regimeKey]: {
              ...r.regimes[regimeKey],
              [secteurKey]: value,
            },
          },
        };
      }),
    }));
    clearSimpleError("denombrement");
  };

  // Depenses (sanitize: chiffres et point decimal uniquement, pas de negatif)
  const handleDepenseChange = (field, value) => {
    setFiche((prev) => ({
      ...prev,
      depenses: { ...prev.depenses, [field]: sanitizeDecimal(value) },
    }));
  };

  // Valide + construit le payload conforme a l'API (retourne aussi les erreurs par champ)
  const buildPayload = () => {
    const errors = {};

    const today = new Date().toISOString().split("T")[0];
    if (!fiche.date) {
      errors.date = "Date requise";
    } else if (fiche.date > today) {
      errors.date = "La date ne peut pas être dans le futur";
    }
    if (!String(fiche.superviseurGeneral || "").trim()) {
      errors.superviseurGeneral = "Superviseur general requis";
    }

    const secteurByCode = new Map(secteurList.map((s) => [s.code, s]));
    const recolteurByName = new Map(
      recolteursList
        .filter((r) => r?.nom)
        .map((r) => [r.nom.trim().toLowerCase(), r])
    );

    // Superviseurs adjoints (ignore lignes vides; si partiel => erreurs par cellule)
    const superviseurs_adjoints = [];
    const adjointsErrors = {};
    for (const s of fiche.superviseursAdjoints || []) {
      const nom = String(s.nom || "").trim();
      const secteur = String(s.secteur || "").trim();
      if (!nom && !secteur) continue;

      if (!nom) {
        adjointsErrors[s.id] = { ...(adjointsErrors[s.id] || {}), nom: "Nom requis" };
      }
      if (!secteur) {
        adjointsErrors[s.id] = {
          ...(adjointsErrors[s.id] || {}),
          secteur: "Secteur requis",
        };
      }

      if (nom && secteur) {
        superviseurs_adjoints.push({
          nom,
          secteur_ou_recolteur: secteur,
          agent: s.agentId || null,
        });
      }
    }
    if (Object.keys(adjointsErrors).length > 0) errors.adjoints = adjointsErrors;

    // Lignes par recolteur et par type de regime (quantite > 0)
    const lignes = [];
    const recolteursErrors = {};
    let hasAnyQtyOverall = false;

    for (const r of fiche.recolteurs || []) {
      const nom = String(r.nom || "").trim();

      let rowHasQty = false;
      for (const reg of regimeTypes) {
        for (const s of secteurList) {
          const q = Number(r.regimes?.[reg.key]?.[s.code]) || 0;
          if (q > 0) {
            rowHasQty = true;
            hasAnyQtyOverall = true;
            break;
          }
        }
        if (rowHasQty) break;
      }

      // Ligne totalement vide => ignoree
      if (!nom && !rowHasQty) continue;

      if (!nom && rowHasQty) {
        recolteursErrors[r.id] = "Nom requis";
        continue;
      }

      const recolteurId = recolteurByName.get(nom.toLowerCase())?.id || null;

      for (const reg of regimeTypes) {
        const details = [];
        for (const s of secteurList) {
          const q = Number(r.regimes?.[reg.key]?.[s.code]) || 0;
          if (q > 0) {
            details.push({
              secteur: secteurByCode.get(s.code)?.id || null,
              secteur_code: s.code,
              quantite: q,
            });
          }
        }
        if (details.length === 0) continue;
        lignes.push({
          recolteur: recolteurId,
          recolteur_nom: nom,
          regime_type: reg.key,
          details,
        });
      }
    }

    if (!hasAnyQtyOverall) {
      errors.denombrement = "Saisis au moins une quantite > 0";
    }
    if (Object.keys(recolteursErrors).length > 0) errors.recolteurs = recolteursErrors;

    const payload = {
      date: fiche.date,
      superviseur_general: String(fiche.superviseurGeneral || "").trim(),
      superviseur_general_obj: fiche.superviseurGeneralId || null,
      bareme_grands: Number(fiche.bareme.grands) || 0,
      bareme_moyens: Number(fiche.bareme.moyens) || 0,
      bareme_petits: Number(fiche.bareme.petits) || 0,
      depense_nourriture: Number(fiche.depenses.nourriture) || 0,
      depense_transport: Number(fiche.depenses.transport) || 0,
      depense_salaire: salaireTotalCalcule,
      observations: fiche.observations || "",
      superviseurs_adjoints,
      lignes,
    };

    return { payload, errors };
  };

  // Enregistre la fiche (POST ou PUT)
  const handleSave = async () => {
    const { payload, errors } = buildPayload();
    const hasErrors = Object.keys(errors || {}).length > 0;
    if (hasErrors) {
      setFieldErrors(errors);
      pushToast({
        type: "warning",
        title: "Champs obligatoires",
        message: "Corrige les champs en rouge avant d'enregistrer",
      });
      scrollToFirstError();
      return;
    }

    setFieldErrors({});

    try {
      setSaving(true);

      if (!navigator.onLine) {
        await saveRecolteOffline(payload, getToken());
        setSuccess({ open: true, message: "Fiche sauvegardee hors ligne — sera synchronisee a la reconnexion." });
        return;
      }

      if (editingFicheId) {
        await updateFiche(editingFicheId, payload);
        setSuccess({ open: true, message: "Fiche mise a jour avec succes" });
      } else {
        await createFiche(payload);
        setSuccess({ open: true, message: "Recolte ajoutee avec succes" });
      }
      if (historyLoaded) loadHistory();
      if (analyticsLoadedOnce && tab === "analyses") loadAnalytics(analyticsYear);
    } catch (err) {
      pushToast({ type: "error", title: "Recoltes", message: err.message });
    } finally {
      setSaving(false);
    }
  };

  // Nouvelle fiche (reset)
  const handleReset = () => {
    setFiche({
      ...ficheRecolteInitial,
      bareme: { ...baremeDefaut },
      superviseurGeneral: !isAdmin && currentUserDisplayName ? currentUserDisplayName : ficheRecolteInitial.superviseurGeneral,
    });
    setFieldErrors({});
    setEditingFicheId(null);
  };

  // Chargement de l'historique des fiches
  const loadHistory = async () => {
    try {
      setLoadingHistory(true);
      const data = await listFiches();
      setHistory(data || []);
      setHistoryLoaded(true);
      if (!isAdmin) {
        setPendingCount((data || []).filter((f) => f.statut !== "valide").length);
      }
    } catch (err) {
      pushToast({ type: "error", title: "Recoltes", message: err.message });
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleStatutChange = async (ficheId, newStatut, motif = "") => {
    try {
      const payload = { statut: newStatut };
      if (motif && motif.trim()) payload.motif = motif.trim();
      await patchFiche(ficheId, payload);
      const now = new Date().toISOString();
      setHistory((prev) => {
        const next = prev.map((f) =>
          f.id === ficheId
            ? {
                ...f,
                statut: newStatut,
                ...(newStatut === "valide" && {
                  validated_by_display: currentUserDisplayName || f.validated_by_display,
                  validated_at: now,
                }),
                ...(newStatut === "brouillon" && {
                  validated_by_display: null,
                  validated_at: null,
                }),
              }
            : f
        );
        if (!isAdmin) {
          setPendingCount(next.filter((f) => f.statut !== "valide").length);
        }
        return next;
      });
      const labels = { valide: "validee", brouillon: "rejetee" };
      pushToast({ type: "success", title: "Fiche", message: `Fiche ${labels[newStatut] || newStatut}` });
    } catch (err) {
      pushToast({ type: "error", title: "Statut", message: err.message });
    }
  };

  const handleConfirmValider = (ficheId) => {
    setConfirmValidate({ open: true, ficheId });
  };

  const handleConfirmOk = () => {
    const { ficheId } = confirmValidate;
    setConfirmValidate({ open: false, ficheId: null });
    handleStatutChange(ficheId, "valide");
  };

  const handleConfirmRejet = (ficheId) => {
    setConfirmRejet({ open: true, ficheId, motif: "" });
  };

  const handleConfirmRejetOk = () => {
    const { ficheId, motif } = confirmRejet;
    setConfirmRejet({ open: false, ficheId: null, motif: "" });
    handleStatutChange(ficheId, "brouillon", motif);
  };

  const handleExport = async () => {
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/recoltes/export/`, {
        headers: token ? { Authorization: `Token ${token}` } : {},
      });
      if (!res.ok) throw new Error("Export impossible");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `recoltes_export_${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      pushToast({ type: "error", title: "Erreur export", message: err.message });
    }
  };

  // Construction des lignes pour le tableau historique
  const historyRows = useMemo(() => {
    return (history || []).map((ficheItem) => {
      const lignes = ficheItem.lignes || [];
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
      const recolteursSet = new Set(
        lignes.map(
          (l) => l.recolteur_nom_display || l.recolteur_nom || "Sans nom"
        )
      );

      return {
        ...ficheItem,
        total_regimes: totalRegimes,
        total_prix: totalPrix,
        nb_recolteurs: recolteursSet.size,
        nb_recus: (ficheItem.recus || []).length,
      };
    });
  }, [history]);

  const fmtDateTime = (iso) => {
    if (!iso) return "-";
    const d = new Date(iso);
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })
      + " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  };

  // Colonnes admin : fiches soumises et validées, avec traçabilité validation
  const adminColumns = [
    { key: "date", label: "Date récolte" },
    { key: "superviseur_general", label: "Superviseur", render: (row) => row.superviseur_general || "-" },
    { key: "total_regimes", label: "Total régimes" },
    { key: "nb_recolteurs", label: "Récolteurs" },
    {
      key: "statut",
      label: "Statut",
      render: (row) => {
        const cfg = row.statut === "valide"
          ? { bg: "#c8e6c9", color: "#1b5e20", label: "Validée" }
          : row.statut === "soumis"
          ? { bg: "#fff9c4", color: "#f57f17", label: "Soumise" }
          : { bg: "#f5f5f5", color: "#757575", label: "Brouillon" };
        return (
          <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 12, fontSize: 12, fontWeight: 700, background: cfg.bg, color: cfg.color }}>
            {cfg.label}
          </span>
        );
      },
    },
    {
      key: "validated_by_display",
      label: "Validée par",
      render: (row) => row.validated_by_display || "-",
    },
    {
      key: "validated_at",
      label: "Date validation",
      render: (row) => fmtDateTime(row.validated_at),
    },
    {
      key: "actions",
      label: "Actions",
      render: (row) => (
        <div className="row-actions">
          <button onClick={() => setSelectedFiche(row)}>Voir</button>
          {row.statut === "soumis" && (
            <button
              className="btn-primary btn-sm"
              onClick={() => handleConfirmValider(row.id)}
            >
              Valider
            </button>
          )}
          {(row.statut === "soumis" || row.statut === "valide") && (
            <button
              className="btn-danger btn-sm"
              onClick={() => handleConfirmRejet(row.id)}
            >
              Rejeter
            </button>
          )}
        </div>
      ),
    },
  ];

  // Colonnes superviseur : toutes ses fiches, statut clair, boutons Modifier + Valider
  const superviseurColumns = [
    { key: "date", label: "Date recolte" },
    { key: "total_regimes", label: "Total regimes" },
    { key: "nb_recolteurs", label: "Recolteurs" },
    {
      key: "statut",
      label: "Statut",
      render: (row) => {
        const valide = row.statut === "valide";
        return (
          <span style={{
            display: "inline-block",
            padding: "2px 10px",
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 700,
            background: valide ? "#c8e6c9" : "#fff9c4",
            color: valide ? "#1b5e20" : "#f57f17",
          }}>
            {valide ? "Validee" : "En attente"}
          </span>
        );
      },
    },
    {
      key: "actions",
      label: "Actions",
      render: (row) => {
        const nonValide = row.statut !== "valide";
        return (
          <div className="row-actions">
            <button onClick={() => setSelectedFiche(row)}>Voir</button>
            {nonValide && (
              <button
                className="btn-ghost btn-sm"
                onClick={() => handleEditFiche(row)}
              >
                Modifier
              </button>
            )}
            {nonValide && (
              <button
                className="btn-primary btn-sm"
                onClick={() => handleConfirmValider(row.id)}
              >
                Valider
              </button>
            )}
            {nonValide && (
              <button
                className="btn-danger btn-sm"
                onClick={() => setFicheToDelete(row)}
              >
                Supprimer
              </button>
            )}
          </div>
        );
      },
    },
  ];

  const historyColumns = isAdmin ? adminColumns : superviseurColumns;
  const displayRows = historyRows;

  // Filtres pour le superviseur
  const pendingRows = displayRows.filter((r) => r.statut !== "valide");
  const validatedRows = displayRows.filter((r) => r.statut === "valide");
  const filteredRows = isSuperviseur
    ? historyFilter === "pending"
      ? pendingRows
      : historyFilter === "valide"
      ? validatedRows
      : displayRows
    : displayRows;

  const localPendingCount = isSuperviseur ? pendingRows.length : 0;

  return (
    <div className="page fiche">
      <div className="page-header-row">
        <div>
          <h2>Recoltes</h2>
          <p className="dashboard-subtitle">Saisie, analyses et historique</p>
        </div>

        {tab === "saisie" && !isAdmin && (
          <div className="row-actions">
            <button className="btn-ghost" onClick={handleReset}>
              {editingFicheId ? "Annuler" : "Nouvelle fiche"}
            </button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? "Enregistrement..." : editingFicheId ? "Mettre a jour" : "Enregistrer"}
            </button>
          </div>
        )}

        {tab === "analyses" && (
          <div className="row-actions">
            <label>
              Annee
              <select
                value={analyticsYear}
                onChange={(e) => setAnalyticsYear(Number(e.target.value))}
              >
                {analyticsYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="btn-ghost"
              onClick={() => loadAnalytics(analyticsYear)}
              disabled={loadingAnalytics}
            >
              {loadingAnalytics ? "Chargement..." : "Rafraichir"}
            </button>
            {hasPermission("exporter_donnees") && (
              <button className="btn-ghost" onClick={handleExport}>
                Exporter Excel
              </button>
            )}
          </div>
        )}

        {tab === "historique" && (
          <div className="row-actions">
            {hasPermission("exporter_donnees") && (
              <button className="btn-ghost" onClick={handleExport}>
                Exporter Excel
              </button>
            )}
            <button className="btn-ghost" onClick={loadHistory} disabled={loadingHistory}>
              {loadingHistory ? "Chargement..." : "Rafraichir"}
            </button>
          </div>
        )}

        {tab === "ventes" && (
          <div className="row-actions" style={{ flexWrap: "wrap", gap: 10 }}>
            <label>
              Annee
              <select value={ventesYear} onChange={(e) => { setVentesYear(Number(e.target.value)); }}>
                {ventesYears.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
            <input
              type="search"
              placeholder="Rechercher (client, reference...)"
              value={venteSearch}
              onChange={(e) => setVenteSearch(e.target.value)}
              style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13, minWidth: 220, flex: "1 1 220px" }}
            />
            <button className="btn-ghost" onClick={() => loadVentes(ventesYear)} disabled={loadingVentes}>
              {loadingVentes ? "Chargement..." : "Rafraichir"}
            </button>
            <button
              className="btn-primary"
              style={(!isAdmin && !hasPermission("gerer_recus_vente")) ? { opacity: 0.45, cursor: "not-allowed" } : {}}
              onClick={() => {
                if (!isAdmin && !hasPermission("gerer_recus_vente")) {
                  pushToast({ type: "warning", title: "Accès refusé", message: "L'administrateur vous a retiré ce droit." });
                  return;
                }
                setVenteDialog({ open: true, row: null });
              }}
            >
              + Nouveau recu
            </button>
          </div>
        )}
      </div>

      {tab === "saisie" && isAdmin && (
        <div style={{ padding: "40px 0", textAlign: "center", color: "#888" }}>
          La saisie des fiches de recolte est reservee aux superviseurs.
        </div>
      )}

      {tab === "saisie" && !isAdmin && editingFicheId && (
        <div style={{
          background: "#e3f2fd", border: "1px solid #90caf9",
          borderRadius: 8, padding: "10px 16px", marginBottom: 12,
          fontSize: 13, display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 16 }}>✏️</span>
          <span>
            Modification de la fiche du <strong>{fiche.date || "..."}</strong> — les donnees sont pre-remplies.
          </span>
        </div>
      )}

      {tab === "saisie" && !isAdmin && (
        <>

      {/* En-tete de la fiche */}
      <section
        className={`fiche-section ${
          fieldErrors.date || fieldErrors.superviseurGeneral ? "section-error" : ""
        }`}
      >
        <h3>En-tete</h3>
        <div className="fiche-header-grid">
          <label>
            Date
            <input
              type="date"
              name="date"
              className={`fiche-input ${fieldErrors.date ? "input-error" : ""}`}
              value={fiche.date}
              max={new Date().toISOString().split("T")[0]}
              onChange={handleHeaderChange}
            />
            {fieldErrors.date && <span className="field-error">{fieldErrors.date}</span>}
          </label>
          <label>
            Superviseur general
            {isAdmin ? (
              <select
                className={`fiche-input ${fieldErrors.superviseurGeneral ? "input-error" : ""}`}
                value={fiche.superviseurGeneralId ?? ""}
                onChange={(e) => {
                  const selected = superviseursList.find((s) => String(s.id) === e.target.value);
                  setFiche((prev) => ({
                    ...prev,
                    superviseurGeneralId: selected ? selected.id : null,
                    superviseurGeneral: selected ? selected.nom_complet : "",
                  }));
                  clearSimpleError("superviseurGeneral");
                }}
              >
                <option value="">-- Choisir un superviseur --</option>
                {superviseursList.map((s) => (
                  <option key={s.id} value={s.id}>{s.nom_complet}</option>
                ))}
              </select>
            ) : (
              <input
                className="fiche-input"
                value={fiche.superviseurGeneral}
                readOnly
                style={{ background: "#f5f5f5", cursor: "default" }}
              />
            )}
            {fieldErrors.superviseurGeneral && (
              <span className="field-error">{fieldErrors.superviseurGeneral}</span>
            )}
          </label>
        </div>
      </section>

      {/* Superviseurs adjoints */}
      <section className={`fiche-section ${fieldErrors.adjoints ? "section-error" : ""}`}>
        <div className="section-row">
          <h3>Superviseurs adjoints</h3>
          <button className="btn-ghost" onClick={addAdjoint}>Ajouter</button>
        </div>
        {fieldErrors.adjoints && (
          <div className="field-error">
            Completez les superviseurs adjoints (Nom + Secteur).
          </div>
        )}
        <div className="fiche-table-wrapper">
          <table className="simple-table">
            <thead>
              <tr>
                <th>Nom et prenom</th>
                <th>Secteur</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {fiche.superviseursAdjoints.map((s) => (
                <tr key={s.id}>
                  <td>
                    <select
                      className={`fiche-input ${fieldErrors.adjoints?.[s.id]?.nom ? "input-error" : ""}`}
                      value={s.agentId || ""}
                      onChange={(e) => handleAdjointAgentChange(s.id, e.target.value)}
                    >
                      <option value="">-- Choisir un agent --</option>
                      {(agentsList || []).filter((a) => a.actif).map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.nom_complet || `${a.nom} ${a.prenom || ""}`.trim()}
                        </option>
                      ))}
                    </select>
                    {fieldErrors.adjoints?.[s.id]?.nom && (
                      <div className="field-error">{fieldErrors.adjoints[s.id].nom}</div>
                    )}
                  </td>
                  <td>
                    <select
                      className={`fiche-input ${fieldErrors.adjoints?.[s.id]?.secteur ? "input-error" : ""}`}
                      value={s.secteur || ""}
                      onChange={(e) => handleAdjointChange(s.id, "secteur", e.target.value)}
                    >
                      <option value="">-- Choisir un secteur --</option>
                      {(secteurList || []).map((sec) => (
                        <option key={sec.id || sec.code} value={sec.code}>
                          {sec.code}{sec.nom ? ` — ${sec.nom}` : ""}
                        </option>
                      ))}
                    </select>
                    {fieldErrors.adjoints?.[s.id]?.secteur && (
                      <div className="field-error">{fieldErrors.adjoints[s.id].secteur}</div>
                    )}
                  </td>
                  <td>
                    <button className="btn-danger btn-mini" onClick={() => removeAdjoint(s.id)}>
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
              {fiche.superviseursAdjoints.length === 0 && (
                <tr><td colSpan={3}>Aucun superviseur ajoute</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Bareme */}
      <section className="fiche-section">
        <h3>Bareme des regimes</h3>
        <div className="bareme-grid">
          {regimeTypes.map((r) => (
            <label key={r.key}>
              {r.label}
              <input
                type="number"
                min="0"
                className="fiche-input"
                value={fiche.bareme[r.key]}
                onChange={(e) => isAdmin && handleBaremeChange(r.key, Math.max(0, Number(e.target.value)))}
                readOnly={!isAdmin}
                style={!isAdmin ? { background: "#f5f5f5", color: "#888", cursor: "not-allowed" } : undefined}
              />
            </label>
          ))}
        </div>
        {!isAdmin && (
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "#999", fontStyle: "italic" }}>
            Seul l'administrateur peut modifier le bareme.
          </p>
        )}
      </section>

      {/* Dombrement des regimes */}
      <section
        className={`fiche-section ${
          fieldErrors.denombrement || fieldErrors.recolteurs ? "section-error" : ""
        }`}
      >
        <div className="section-row">
          <h3>Denombrement des regimes par secteur et par recolteur</h3>
          <button className="btn-ghost" onClick={addRecolteur}>Ajouter recolteur</button>
        </div>

        {fieldErrors.denombrement && (
          <div className="field-error">{fieldErrors.denombrement}</div>
        )}

        <div className="filters-bar">
          <label>
            Secteurs
            <select
              value={secteurChoiceValue}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__all__") {
                  setActiveSecteurCodes(secteurList.map((s) => s.code));
                } else {
                  setActiveSecteurCodes([v]);
                }
              }}
            >
              <option value="__all__">Tous les secteurs</option>
              {secteurList.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code} - {s.nom}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="fiche-table-wrapper">
          <table className="fiche-table">
            <thead>
              <tr>
                <th>Recolteur</th>
                <th>Regimes</th>
                {visibleSecteurs.map((s) => (
                  <th key={s.code}>{s.label}</th>
                ))}
                <th>TOTAL</th>
                <th>PRIX (FCFA)</th>
              </tr>
            </thead>
            <tbody>
              {fiche.recolteurs.map((r) =>
                regimeTypes.map((reg, idx) => (
                  <tr key={`${r.id}-${reg.key}`}>
                    {idx === 0 && (
                      <td rowSpan={regimeTypes.length} className="row-head">
                        <div className="row-head-content">
                          <select
                            className={`fiche-input ${fieldErrors.recolteurs?.[r.id] ? "input-error" : ""}`}
                            value={r.nom}
                            onChange={(e) => handleRecolteurName(r.id, e.target.value)}
                          >
                            <option value="">-- Choisir un recolteur --</option>
                            {(recolteursList || []).map((x) => (
                              <option key={x.id} value={x.nom}>
                                {x.numero_telephone ? `${x.numero_telephone} — ` : ""}{x.nom}
                              </option>
                            ))}
                          </select>
                          {fieldErrors.recolteurs?.[r.id] && (
                            <span className="field-error">{fieldErrors.recolteurs[r.id]}</span>
                          )}
                          <button className="btn-danger btn-mini" onClick={() => removeRecolteur(r.id)}>
                            Supprimer
                          </button>
                        </div>
                        <div className="row-head-summary">
                          <small>
                            Grds: {calcTotal(r.regimes.grands)} | Moy: {calcTotal(r.regimes.moyens)} | Ptits: {calcTotal(r.regimes.petits)} | Total:{" "}
                            {calcTotal(r.regimes.grands) + calcTotal(r.regimes.moyens) + calcTotal(r.regimes.petits)} | Prix:{" "}
                            {calcTotal(r.regimes.grands) * (Number(fiche.bareme.grands) || 0) +
                              calcTotal(r.regimes.moyens) * (Number(fiche.bareme.moyens) || 0) +
                              calcTotal(r.regimes.petits) * (Number(fiche.bareme.petits) || 0)}
                          </small>
                        </div>
                      </td>
                    )}
                    <td className="regime-label">
                      {reg.label} ({fiche.bareme[reg.key]})
                    </td>
                    {visibleSecteurs.map((s) => (
                      <td key={s.code}>
                        <input
                          type="number"
                          min="0"
                          className="fiche-input fiche-input-sm"
                          value={r.regimes[reg.key][s.code]}
                          onChange={(e) =>
                            handleRegimeChange(r.id, reg.key, s.code, Math.max(0, Number(e.target.value)) || "")
                          }
                        />
                      </td>
                    ))}
                    <td className="total-cell">
                      {calcTotal(r.regimes[reg.key])}
                    </td>
                    {/* PRIX calcule automatiquement: total regimes * bareme */}
                    <td className="total-cell">
                      {calcTotal(r.regimes[reg.key]) * (Number(fiche.bareme[reg.key]) || 0)}
                    </td>
                  </tr>
                ))
              )}
              {fiche.recolteurs.length === 0 && (
                <tr><td colSpan={visibleSecteurs.length + 4}>Aucun recolteur ajoute</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Depenses */}
      <section className="fiche-section">
        <h3>Depenses</h3>
        <div className="fiche-header-grid">
          <label>
            Nourriture
            <input
              type="number"
              min="0"
              className="fiche-input"
              value={fiche.depenses.nourriture}
              onChange={(e) => handleDepenseChange("nourriture", e.target.value)}
            />
          </label>
          <label>
            Transport
            <input
              type="number"
              min="0"
              className="fiche-input"
              value={fiche.depenses.transport}
              onChange={(e) => handleDepenseChange("transport", e.target.value)}
            />
          </label>
          <label>
            Salaire recolteurs
            <input
              className="fiche-input"
              value={salaireTotalCalcule.toLocaleString("fr-FR")}
              readOnly
              style={{ fontWeight: 700, background: "#f5f5f5", cursor: "default" }}
            />
          </label>
          <label>
            Total depenses
            <input
              className="fiche-input"
              value={totalDepenses.toLocaleString("fr-FR")}
              readOnly
              style={{ fontWeight: 700, background: "#f5f5f5" }}
            />
          </label>
        </div>
      </section>


      {/* Observations */}
      <section className="fiche-section">
        <h3>Observations</h3>
        <textarea
          className="fiche-input"
          rows={4}
          value={fiche.observations}
          onChange={(e) => setFiche((prev) => ({ ...prev, observations: e.target.value }))}
        />
      </section>
        </>
      )}

      {tab === "analyses" && !hasPermission("voir_analyses") && (
        <div style={{ padding: "40px 0", textAlign: "center", color: "#888" }}>
          Vous n'avez pas l'autorisation d'acceder aux analyses. Contactez l'administrateur.
        </div>
      )}

      {tab === "analyses" && hasPermission("voir_analyses") && (
        <section className="fiche-section fiche-analytics">
          <h3>Analyses et comparaisons</h3>

          {loadingAnalytics ? (
          <LogoLoader compact size={70} />
        ) : (
          <>
            {(() => {
              const fmtReg = (n) => new Intl.NumberFormat("fr-FR").format(Number(n || 0));
              const stackedBarPlugin = {
                id: "analyticsStackedLabels",
                afterDatasetsDraw(chart) {
                  if (chart.width < 300) return;
                  const { ctx } = chart;
                  chart.data.datasets.forEach((ds, di) => {
                    const meta = chart.getDatasetMeta(di);
                    if (meta.hidden) return;
                    meta.data.forEach((bar, i) => {
                      const value = Number(ds.data[i]) || 0;
                      if (!value) return;
                      const { x, y, base } = bar.getProps(["x", "y", "base"], true);
                      if (Math.abs(base - y) < 16) return;
                      ctx.save();
                      ctx.fillStyle = "#fff";
                      ctx.textAlign = "center";
                      ctx.textBaseline = "middle";
                      ctx.font = "bold 10px sans-serif";
                      ctx.shadowColor = "rgba(0,0,0,.35)";
                      ctx.shadowBlur = 2;
                      ctx.fillText(fmtReg(value), x, (y + base) / 2);
                      ctx.restore();
                    });
                  });
                  const nBars = chart.data.labels.length;
                  for (let i = 0; i < nBars; i++) {
                    let total = 0, topY = Infinity;
                    chart.data.datasets.forEach((ds, di) => {
                      const meta = chart.getDatasetMeta(di);
                      if (meta.hidden) return;
                      total += Number(ds.data[i]) || 0;
                      const { y } = meta.data[i].getProps(["y"], true);
                      if (y < topY) topY = y;
                    });
                    if (!total) continue;
                    const { x } = chart.getDatasetMeta(0).data[i].getProps(["x"], true);
                    ctx.save();
                    ctx.fillStyle = "#1f4e79";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "bottom";
                    ctx.font = "bold 11px sans-serif";
                    ctx.fillText(fmtReg(total), x, topY - 4);
                    ctx.restore();
                  }
                },
              };

              const stackedBarOpts = {
                responsive: true, maintainAspectRatio: false,
                layout: { padding: { top: 20 } },
                plugins: {
                  legend: { position: "bottom" },
                  tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label} : ${fmtReg(ctx.parsed.y)} régimes` } },
                },
                scales: {
                  x: { stacked: true, grid: { display: false } },
                  y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
                },
              };

              const buildMonthlyData = (src) => ({
                labels: src.labels,
                datasets: [
                  { label: "Grands", data: src.grands, backgroundColor: "#2e7d32cc", stack: "r" },
                  { label: "Moyens", data: src.moyens, backgroundColor: "#1565c0cc", stack: "r" },
                  { label: "Petits", data: src.petits, backgroundColor: "#f9a825cc", stack: "r" },
                ],
              });

              const buildYearlyData = (src) => ({
                labels: src.labels,
                datasets: [
                  { label: "Grands",  data: src.grands, backgroundColor: "#2e7d32cc", stack: "r" },
                  { label: "Moyens",  data: src.moyens, backgroundColor: "#1565c0cc", stack: "r" },
                  { label: "Petits",  data: src.petits, backgroundColor: "#f9a825cc", stack: "r" },
                ],
              });

              return (
                <div className="charts-grid">
                  {analytics?.monthly && (
                    <ChartCard
                      title={`Production mensuelle ${analyticsYear} par type de régime`}
                      type="bar"
                      data={buildMonthlyData(analytics.monthly.current)}
                      options={stackedBarOpts}
                      plugins={[stackedBarPlugin]}
                      onClick={() => setActiveChart({
                        title: `Production mensuelle ${analyticsYear} par type de régime`,
                        type: "bar",
                        data: buildMonthlyData(analytics.monthly.current),
                        options: stackedBarOpts,
                        plugins: [stackedBarPlugin],
                      })}
                    />
                  )}
                  {analytics?.yearly && (
                    <ChartCard
                      title="Production annuelle par type de régime (5 ans)"
                      type="bar"
                      data={buildYearlyData(analytics.yearly)}
                      options={stackedBarOpts}
                      plugins={[stackedBarPlugin]}
                      onClick={() => setActiveChart({
                        title: "Production annuelle (5 ans)",
                        type: "bar",
                        data: buildYearlyData(analytics.yearly),
                        options: stackedBarOpts,
                        plugins: [stackedBarPlugin],
                      })}
                    />
                  )}
                </div>
              );
            })()}

            <div className="tables-grid">
              <article className="table-card">
                <h3>Statistiques recolteurs</h3>
                <DataTable
                  columns={[
                    { key: "numero_telephone", label: "Telephone" },
                    { key: "nom", label: "Nom" },
                    { key: "lieu_residence", label: "Lieu" },
                    { key: "grands", label: "Grds" },
                    { key: "moyens", label: "Moy" },
                    { key: "petits", label: "Ptits" },
                    { key: "total_regimes", label: "Total regimes" },
                    { key: "fiches_count", label: "Fiches" },
                    { key: "last_recolte", label: "Derniere recolte" },
                  ]}
                  rows={analytics?.recolteurs || []}
                  pageSize={8}
                />
              </article>
            </div>
          </>
        )}
        </section>
      )}

      {tab === "historique" && (
        <section className="fiche-section fiche-history">
          {/* Banniere fiches en attente */}
          {isSuperviseur && historyLoaded && localPendingCount > 0 && (
            <div style={{
              background: "#fff8e1", border: "1px solid #f9a825",
              borderRadius: 8, padding: "10px 16px", marginBottom: 16,
              display: "flex", alignItems: "center", gap: 10, fontSize: 13,
            }}>
              <span style={{ fontSize: 18 }}>⏳</span>
              <span>
                <strong style={{ color: "#f57f17" }}>{localPendingCount} fiche{localPendingCount > 1 ? "s" : ""} en attente</strong>
                {" "}de validation — cliquez sur <strong>Valider</strong> pour les confirmer.
              </span>
            </div>
          )}

          <h3>{isAdmin ? "Fiches validees" : "Mes fiches de recolte"}</h3>

          {/* Filtres rapides — superviseur uniquement */}
          {isSuperviseur && historyLoaded && (
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              {[
                { key: "all",     label: "Toutes",      count: displayRows.length },
                { key: "pending", label: "En attente",  count: pendingRows.length },
                { key: "valide",  label: "Validees",    count: validatedRows.length },
              ].map(({ key, label, count }) => (
                <button
                  key={key}
                  onClick={() => setHistoryFilter(key)}
                  style={{
                    padding: "4px 14px",
                    borderRadius: 20,
                    border: historyFilter === key ? "2px solid #2e7d32" : "2px solid #e0e0e0",
                    background: historyFilter === key ? "#e8f5e9" : "transparent",
                    color: historyFilter === key ? "#2e7d32" : "#666",
                    fontWeight: historyFilter === key ? 700 : 400,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  {label} ({count})
                </button>
              ))}
            </div>
          )}

          {loadingHistory ? (
            <LogoLoader compact size={70} />
          ) : (
            <>
              {isAdmin && displayRows.length === 0 && (
                <p style={{ color: "#aaa", textAlign: "center", padding: 24 }}>
                  Aucune fiche validee pour le moment.
                </p>
              )}
              {(!isAdmin || displayRows.length > 0) && (
                <DataTable columns={historyColumns} rows={filteredRows} pageSize={5} />
              )}
            </>
          )}
        </section>
      )}

      {/* ── Onglet Ventes ───────────────────────────────────────────────── */}
      {tab === "ventes" && (
        <section className="fiche-section fiche-history">
          <h3>Recus de vente — {ventesYear}</h3>
          {loadingVentes ? (
            <LogoLoader compact size={70} />
          ) : (() => {
            const search = venteSearch.toLowerCase().trim();
            const filtered = ventesRows.filter((r) => {
              if (!search) return true;
              const client = (r.client_nom || r.client || "").toLowerCase();
              const ref = (r.reference_facture || "").toLowerCase();
              const ficheDate = (r.fiche_date || "").toLowerCase();
              const date = (r.date || "").toLowerCase();
              return client.includes(search) || ref.includes(search) || ficheDate.includes(search) || date.includes(search);
            });
            if (filtered.length === 0) return (
              <p style={{ color: "#aaa", textAlign: "center", padding: 24 }}>
                {venteSearch ? "Aucun résultat pour cette recherche." : `Aucun recu de vente pour ${ventesYear}.`}
              </p>
            );
            return (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#1f4e79", color: "#fff" }}>
                      {["Statut", "Date recolte", "Superviseur", "Date vente", "Client", "Pesee (kg)", "Non conformes (%)", "Montant (FCFA)", "Prix calcule (FCFA/kg)", isAdmin ? "Prix officiel (FCFA/kg)" : null, isAdmin ? "Rapport" : null, "Actions"].filter(Boolean).map((h) => (
                        <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row, idx) => {
                      const isValide = row.statut === "valide";
                      const canEdit = isAdmin || !isValide;
                      return (
                        <tr key={row.id} style={{ background: idx % 2 === 0 ? "#fafafa" : "#fff", borderBottom: "1px solid #f0f0f0" }}>
                          <td style={{ padding: "8px 12px" }}>
                            <span style={{
                              display: "inline-block", padding: "3px 9px", borderRadius: 10, fontSize: 11, fontWeight: 700,
                              background: isValide ? "#e8f5e9" : "#fff8e1",
                              color: isValide ? "#2e7d32" : "#f57f17",
                            }}>
                              {isValide ? "Validé" : "Brouillon"}
                            </span>
                          </td>
                          <td style={{ padding: "8px 12px" }}>{row.fiche_date || "—"}</td>
                          <td style={{ padding: "8px 12px" }}>{row.fiche_superviseur || "—"}</td>
                          <td style={{ padding: "8px 12px" }}>{row.date || "—"}</td>
                          <td style={{ padding: "8px 12px" }}>{row.client_nom || row.client || "—"}</td>
                          <td style={{ padding: "8px 12px" }}>{row.pesee_kg != null ? Number(row.pesee_kg).toLocaleString("fr-FR") : "—"}</td>
                          <td style={{ padding: "8px 12px" }}>{row.non_conformes_pct != null ? `${row.non_conformes_pct} %` : "—"}</td>
                          <td style={{ padding: "8px 12px", fontWeight: 600 }}>{row.montant != null ? Number(row.montant).toLocaleString("fr-FR", { maximumFractionDigits: 0 }) : "—"}</td>
                          <td style={{ padding: "8px 12px" }}>{row.prix_calcule != null ? Number(row.prix_calcule).toLocaleString("fr-FR") : "—"}</td>
                          {isAdmin && <td style={{ padding: "8px 12px", color: row.prix_officiel ? "#2e7d32" : "#aaa" }}>{row.prix_officiel ? Number(row.prix_officiel).toLocaleString("fr-FR") : "—"}</td>}
                          {isAdmin && (
                            <td style={{ padding: "8px 12px" }}>
                              {row.rapport_prix != null ? (
                                <span style={{ fontWeight: 700, color: row.rapport_prix >= 1 ? "#2e7d32" : "#c62828" }}>
                                  {Number(row.rapport_prix).toFixed(3)}
                                </span>
                              ) : "—"}
                            </td>
                          )}
                          <td style={{ padding: "8px 12px" }}>
                            <div style={{ display: "flex", gap: 6, flexWrap: "nowrap", alignItems: "center" }}>
                              {!isAdmin && !isValide && (
                                <button className="btn-success btn-sm" onClick={() => setVenteToValidate(row)}>
                                  Valider
                                </button>
                              )}
                              {canEdit && (
                                <button className="btn-secondary btn-sm" onClick={() => setVenteDialog({ open: true, row })}>
                                  {isAdmin ? "Voir" : "Modifier"}
                                </button>
                              )}
                              {isValide && isAdmin && (
                                <button className="btn-danger btn-sm" onClick={() => setVenteToReject({ open: true, row, motif: "" })}>
                                  Rejeter
                                </button>
                              )}
                              {!isValide && !isAdmin && (
                                <button className="btn-danger btn-sm" onClick={() => setVenteToDelete(row)}>
                                  Supprimer
                                </button>
                              )}
                              {isValide && !isAdmin && (
                                <span style={{ fontSize: 11, color: "#888", fontStyle: "italic" }}>Validé</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </section>
      )}

      {/* Dialog création/modification recu vente */}
      {venteDialog.open && (
        <VenteDialog
          open={venteDialog.open}
          row={venteDialog.row}
          isAdmin={isAdmin}
          prixOfficielGlobal={prixOfficielGlobal}
          historyRows={historyRows}
          clientsList={clientsList}
          saving={venteSaving}
          onClose={() => setVenteDialog({ open: false, row: null })}
          onSubmit={handleVenteSave}
        />
      )}

      {/* Confirmation validation recu */}
      {venteToValidate && (
        <div className="dialog-backdrop" onClick={() => setVenteToValidate(null)}>
          <div className="dialog dialog-sm" onClick={(e) => e.stopPropagation()}>
            <h3>Valider le recu</h3>
            <p style={{ fontSize: 14, color: "#555", margin: "12px 0 4px" }}>
              Confirmer la validation du recu du <strong>{venteToValidate.date}</strong> pour <strong>{venteToValidate.client_nom || venteToValidate.client || "client inconnu"}</strong> ?
            </p>
            <p style={{ fontSize: 12, color: "#f57f17", margin: "0 0 20px" }}>
              Une fois valide, seul l'administrateur pourra rejeter ce recu.
            </p>
            <div className="dialog-actions">
              <button className="btn-ghost" onClick={() => setVenteToValidate(null)}>Annuler</button>
              <button className="btn-success" onClick={handleVenteValider}>Valider</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation suppression recu */}
      {venteToDelete && (
        <div className="dialog-backdrop" onClick={() => setVenteToDelete(null)}>
          <div className="dialog dialog-sm" onClick={(e) => e.stopPropagation()}>
            <h3>Supprimer le recu</h3>
            <p style={{ fontSize: 14, color: "#555", margin: "12px 0 20px" }}>
              Confirmer la suppression du recu du <strong>{venteToDelete.date}</strong> ?
              Cette action est irreversible.
            </p>
            <div className="dialog-actions">
              <button className="btn-ghost" onClick={() => setVenteToDelete(null)}>Annuler</button>
              <button className="btn-danger" onClick={handleVenteDelete}>Supprimer</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation rejet recu */}
      {venteToReject.open && (
        <div className="dialog-backdrop" onClick={() => setVenteToReject({ open: false, row: null, motif: "" })}>
          <div className="dialog dialog-sm" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ color: "#b71c1c" }}>Rejeter le recu</h3>
            <p style={{ fontSize: 14, color: "#555", margin: "12px 0 4px" }}>
              Rejeter le recu du <strong>{venteToReject.row?.date}</strong> pour{" "}
              <strong>{venteToReject.row?.client_nom || venteToReject.row?.client || "client inconnu"}</strong> ?
            </p>
            <p style={{ fontSize: 12, color: "#f57f17", margin: "0 0 12px" }}>
              Le statut repassera a Brouillon et le superviseur sera notifie.
            </p>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>Motif du rejet</label>
            <textarea
              rows={3}
              style={{ width: "100%", marginTop: 6, marginBottom: 16, padding: "8px 10px", fontSize: 13, borderRadius: 6, border: "1px solid #ccc", resize: "vertical", boxSizing: "border-box" }}
              placeholder="Saisir le motif du rejet (optionnel)..."
              value={venteToReject.motif}
              onChange={(e) => setVenteToReject((prev) => ({ ...prev, motif: e.target.value }))}
            />
            <div className="dialog-actions">
              <button className="btn-ghost" onClick={() => setVenteToReject({ open: false, row: null, motif: "" })}>Annuler</button>
              <button className="btn-danger" onClick={handleVenteReject}>Oui, rejeter</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation suppression fiche recolte */}
      {ficheToDelete && (
        <div className="dialog-backdrop" onClick={() => setFicheToDelete(null)}>
          <div className="dialog dialog-sm" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ color: "#b71c1c" }}>Supprimer la fiche</h3>
            <p style={{ fontSize: 14, color: "#555", margin: "12px 0 20px" }}>
              Supprimer la fiche du <strong>{ficheToDelete.date}</strong> ?
              Cette action est irreversible.
            </p>
            <div className="dialog-actions">
              <button className="btn-ghost" onClick={() => setFicheToDelete(null)}>Annuler</button>
              <button className="btn-danger" onClick={handleDeleteFiche}>Supprimer</button>
            </div>
          </div>
        </div>
      )}

      <FicheDialog
        open={!!selectedFiche}
        fiche={selectedFiche}
        onClose={() => setSelectedFiche(null)}
      />

      <ChartDialog
        open={!!activeChart}
        chart={activeChart}
        onClose={() => setActiveChart(null)}
      />

      <SuccessDialog
        open={success.open}
        message={success.message}
        actions={!isAdmin ? [{
          label: "Aller valider",
          className: "btn-primary",
          onClick: () => {
            setSuccess({ open: false, message: "" });
            handleReset();
            setTab("historique");
          },
        }] : []}
        onClose={() => {
          setSuccess({ open: false, message: "" });
          handleReset();
        }}
      />

      {/* Dialog de confirmation de validation */}
      {confirmValidate.open && (
        <div className="dialog-backdrop" onClick={() => setConfirmValidate({ open: false, ficheId: null })}>
          <div className="dialog dialog-sm" onClick={(e) => e.stopPropagation()}>
            <h3>Confirmer la validation</h3>
            <p style={{ fontSize: 14, color: "#555", margin: "12px 0 20px" }}>
              Valider cette fiche signifie que les donnees ont ete verifiees et sont correctes.
              L'administrateur sera notifie. Cette action ne peut pas etre annulee sans intervention de l'administrateur.
            </p>
            <div className="dialog-actions">
              <button className="btn-ghost" onClick={() => setConfirmValidate({ open: false, ficheId: null })}>
                Annuler
              </button>
              <button className="btn-primary" onClick={handleConfirmOk}>
                Oui, valider
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog de confirmation de rejet */}
      {confirmRejet.open && (
        <div className="dialog-backdrop" onClick={() => setConfirmRejet({ open: false, ficheId: null, motif: "" })}>
          <div className="dialog dialog-sm" onClick={(e) => e.stopPropagation()}>
            <h3>Confirmer le rejet</h3>
            <p style={{ fontSize: 14, color: "#555", margin: "12px 0 12px" }}>
              Rejeter cette fiche la replacera en brouillon. Le superviseur concerne en sera notifie
              et pourra la corriger avant de la soumettre a nouveau.
            </p>
            <div className="mfield" style={{ marginBottom: 16 }}>
              <label className="mfield-label">Motif du rejet <span style={{ color: "#888", fontWeight: 400 }}>(optionnel)</span></label>
              <textarea
                className="mfield-input"
                rows={3}
                style={{ resize: "vertical", fontSize: 13 }}
                placeholder="Ex : données manquantes, quantités incorrectes..."
                value={confirmRejet.motif}
                onChange={(e) => setConfirmRejet((prev) => ({ ...prev, motif: e.target.value }))}
              />
            </div>
            <div className="dialog-actions">
              <button className="btn-ghost" onClick={() => setConfirmRejet({ open: false, ficheId: null, motif: "" })}>
                Annuler
              </button>
              <button className="btn-primary" onClick={handleConfirmRejetOk}>
                Oui, rejeter
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
