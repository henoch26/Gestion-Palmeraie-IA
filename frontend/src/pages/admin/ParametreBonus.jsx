import { useEffect, useState } from "react";
import { useToast } from "../../context/ToastContext.jsx";
import { getParametreBonus, updateParametreBonus } from "../../services/recuVenteService.js";

const SectionCard = ({ title, subtitle, children, onSave, saving }) => (
  <div style={{
    background: "#fff", borderRadius: 10, border: "1px solid #e8e8e8",
    padding: "24px 28px", boxShadow: "0 2px 8px rgba(0,0,0,.06)", marginBottom: 24,
  }}>
    <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1f4e79", marginBottom: 4 }}>{title}</h3>
    {subtitle && <p style={{ fontSize: 13, color: "#666", marginBottom: 20, lineHeight: 1.6 }}>{subtitle}</p>}
    {children}
    <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid #f0f0f0" }}>
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        style={{
          padding: "9px 24px", borderRadius: 6, border: "none",
          background: "linear-gradient(135deg, #1f4e79, #2e7d32)",
          color: "#fff", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer",
          fontSize: 13, opacity: saving ? 0.7 : 1,
        }}
      >
        {saving ? "Enregistrement..." : "Enregistrer"}
      </button>
    </div>
  </div>
);

const NumField = ({ label, hint, value, onChange, min = 0, max, step = 1, unit }) => (
  <div className="mfield" style={{ marginBottom: 18 }}>
    <label className="mfield-label">{label}</label>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        className="mfield-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ flex: 1 }}
      />
      {unit && <span style={{ fontSize: 13, color: "#888", whiteSpace: "nowrap" }}>{unit}</span>}
    </div>
    {hint && <span style={{ fontSize: 11, color: "#888", marginTop: 4, display: "block" }}>{hint}</span>}
  </div>
);

export default function ParametreBonus() {
  const { pushToast } = useToast();
  const [loading, setLoading]   = useState(true);
  const [savingBar, setSavingBar] = useState(false);
  const [savingBonus, setSavingBonus] = useState(false);

  const [bareme, setBareme] = useState({ grands: "", moyens: "", petits: "" });
  const [bonus, setBonus]   = useState({ seuil_non_conformes: "", montant_bonus: "" });

  const load = async () => {
    try {
      setLoading(true);
      const data = await getParametreBonus();
      const rows = Array.isArray(data) ? data : (data.results || [data]);
      const obj = rows[0] || {};
      setBareme({
        grands: obj.bareme_grands_defaut ?? 60,
        moyens: obj.bareme_moyens_defaut ?? 50,
        petits: obj.bareme_petits_defaut ?? 25,
      });
      setBonus({
        seuil_non_conformes: obj.seuil_non_conformes ?? "",
        montant_bonus:       obj.montant_bonus ?? "",
      });
    } catch (err) {
      pushToast({ type: "error", title: "Parametres", message: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const saveBareme = async () => {
    const g = Number(bareme.grands);
    const m = Number(bareme.moyens);
    const p = Number(bareme.petits);
    if ([g, m, p].some((v) => isNaN(v) || v < 0)) {
      pushToast({ type: "error", title: "Validation", message: "Les taux du bareme doivent etre des nombres positifs." });
      return;
    }
    try {
      setSavingBar(true);
      await updateParametreBonus({
        bareme_grands_defaut: g,
        bareme_moyens_defaut: m,
        bareme_petits_defaut: p,
      });
      pushToast({ type: "success", title: "Bareme", message: "Bareme par defaut mis a jour." });
    } catch (err) {
      pushToast({ type: "error", title: "Bareme", message: err.message });
    } finally {
      setSavingBar(false);
    }
  };

  const saveBonus = async () => {
    const seuil   = Number(bonus.seuil_non_conformes);
    const montant = Number(bonus.montant_bonus);
    if (isNaN(seuil) || seuil < 0 || seuil > 100) {
      pushToast({ type: "error", title: "Validation", message: "Le seuil doit etre entre 0 et 100 %." });
      return;
    }
    if (isNaN(montant) || montant < 0) {
      pushToast({ type: "error", title: "Validation", message: "Le montant du bonus doit etre positif." });
      return;
    }
    try {
      setSavingBonus(true);
      await updateParametreBonus({ seuil_non_conformes: seuil, montant_bonus: montant });
      pushToast({ type: "success", title: "Bonus qualite", message: "Parametres mis a jour." });
    } catch (err) {
      pushToast({ type: "error", title: "Bonus qualite", message: err.message });
    } finally {
      setSavingBonus(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2>Parametres generaux</h2>
          <p className="dashboard-subtitle">Bareme par defaut et bonus qualite</p>
        </div>
      </div>

      {loading ? (
        <p style={{ color: "#aaa", padding: 24 }}>Chargement...</p>
      ) : (
        <div style={{ maxWidth: 540 }}>

          {/* ── Section Barème ─────────────────────────────────────── */}
          <SectionCard
            title="Bareme des recolteurs (defaut)"
            subtitle="Ces taux sont pre-remplis automatiquement dans chaque nouvelle fiche de recolte. L'administrateur peut les ajuster fiche par fiche si necessaire."
            onSave={saveBareme}
            saving={savingBar}
          >
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              <NumField
                label="Grands regimes"
                value={bareme.grands}
                onChange={(v) => setBareme((p) => ({ ...p, grands: v }))}
                unit="FCFA"
                hint="par regime"
              />
              <NumField
                label="Moyens regimes"
                value={bareme.moyens}
                onChange={(v) => setBareme((p) => ({ ...p, moyens: v }))}
                unit="FCFA"
                hint="par regime"
              />
              <NumField
                label="Petits regimes"
                value={bareme.petits}
                onChange={(v) => setBareme((p) => ({ ...p, petits: v }))}
                unit="FCFA"
                hint="par regime"
              />
            </div>
            <div style={{
              background: "#e3f2fd", border: "1px solid #90caf9",
              borderRadius: 6, padding: "10px 14px", fontSize: 12, color: "#1565c0",
            }}>
              Exemple : 100 grands × {Number(bareme.grands) || "?"} + 50 moyens × {Number(bareme.moyens) || "?"} + 30 petits × {Number(bareme.petits) || "?"} ={" "}
              <strong>
                {(Number(bareme.grands) * 100 + Number(bareme.moyens) * 50 + Number(bareme.petits) * 30).toLocaleString("fr-FR")} FCFA
              </strong>
            </div>
          </SectionCard>

          {/* ── Section Bonus ───────────────────────────────────────── */}
          <SectionCard
            title="Bonus qualite (regimes non conformes)"
            subtitle="Un bonus est verse au recolteur si le pourcentage de regimes non conformes est inferieur ou egal au seuil defini."
            onSave={saveBonus}
            saving={savingBonus}
          >
            <NumField
              label="Seuil non conformes (%)"
              value={bonus.seuil_non_conformes}
              onChange={(v) => setBonus((p) => ({ ...p, seuil_non_conformes: v }))}
              min={0} max={100} step={0.01}
              unit="%"
              hint="Si non_conformes_pct ≤ seuil → bonus declenche"
            />
            <NumField
              label="Montant du bonus"
              value={bonus.montant_bonus}
              onChange={(v) => setBonus((p) => ({ ...p, montant_bonus: v }))}
              unit="FCFA"
            />
          </SectionCard>

        </div>
      )}
    </div>
  );
}
