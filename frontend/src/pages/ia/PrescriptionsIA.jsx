import { useCallback, useEffect, useState } from "react";
import { apiGet } from "../../api/axios.js";
import { creerPrescription, listPrescriptions, simulerScenario } from "../../services/iaService.js";
import { useToast } from "../../context/ToastContext.jsx";
import { useAuth } from "../../context/AuthContext.jsx";

const MOIS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

export default function PrescriptionsIA() {
  const { pushToast } = useToast();
  const { role, isAdmin } = useAuth();
  const [secteurs, setSecteurs] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [simulation, setSimulation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const [form, setForm] = useState({
    secteur_id: "",
    annee_cible: currentYear,
    mois_cible: currentMonth,
    objectif_regimes: "",
    nb_recolteurs: 8,
    nb_heures: 7,
    frequence_cycle_jours: 15,
    variation_pluie_pct: 0,
    niveau_entretien: 60,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const secs = await apiGet("/secteurs/");
      setSecteurs(Array.isArray(secs) ? secs : secs.results || []);
    } catch (e) {
      pushToast({ type: "error", title: "Erreur", message: e?.message || "Chargement des secteurs impossible." });
    }

    try {
      const pres = await listPrescriptions();
      setPrescriptions(Array.isArray(pres) ? pres : pres.results || []);
    } catch (e) {
      setPrescriptions([]);
      pushToast({ type: "warning", title: "Recommandations indisponibles", message: e?.message || "La liste des recommandations n'a pas pu être chargée." });
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => { load(); }, [load]);

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const payload = () => ({
    ...form,
    secteur_id: Number(form.secteur_id),
    annee_cible: Number(form.annee_cible),
    mois_cible: Number(form.mois_cible),
    objectif_regimes: form.objectif_regimes ? Number(form.objectif_regimes) : undefined,
    nb_recolteurs: Number(form.nb_recolteurs),
    nb_heures: Number(form.nb_heures),
    frequence_cycle_jours: Number(form.frequence_cycle_jours),
    variation_pluie_pct: Number(form.variation_pluie_pct),
    niveau_entretien: Number(form.niveau_entretien),
  });

  const ensureSecteur = () => {
    if (!form.secteur_id) {
      pushToast({ type: "warning", title: "Champ requis", message: "Sélectionnez un secteur." });
      return false;
    }
    return true;
  };

  const handleSimulation = async (event) => {
    event.preventDefault();
    if (!ensureSecteur()) return;
    setSimulating(true);
    setSimulation(null);
    try {
      const res = await simulerScenario(payload());
      setSimulation(res);
      pushToast({ type: "success", title: "Simulation prête", message: res.lecture });
    } catch (e) {
      pushToast({ type: "error", title: "Erreur", message: e?.message || "Simulation impossible." });
    } finally {
      setSimulating(false);
    }
  };

  const handlePrescription = async () => {
    if (!ensureSecteur()) return;
    setSubmitting(true);
    try {
      const res = await creerPrescription(payload());
      pushToast({ type: "success", title: "Prescription cr²e", message: `Plan proposàpour ${res.secteur_code}.` });
      await load();
    } catch (e) {
      pushToast({ type: "error", title: "Erreur", message: e?.message || "Prescription impossible." });
    } finally {
      setSubmitting(false);
    }
  };

  const f = (value, digits = 0) => Number(value || 0).toLocaleString("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

  return (
    <div className="page-container ia-workbench">
      <div className="page-header">
        <div>
          <h1 className="page-title">Recommandations intelligentes</h1>
          <p className="page-subtitle">
            Prescriptions, simulations et actions terrain adaptées au rôle {role || "utilisateur"}.
          </p>
        </div>
      </div>

      <div className="ia-decision-notice"><span><strong>Decision humaine obligatoire.</strong> Les resultats IA sont des recommandations consultatives a verifier avant toute action sensible.</span></div>

      <div className="ia-grid-2" style={{ alignItems: "start" }}>
        <div className="card">
          <h3 style={{ margin: "0 0 14px" }}>Construire un plan d'action</h3>
          <form onSubmit={handleSimulation}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 }}>
              <label className="form-group">
                <span className="form-label">Secteur</span>
                <select className="form-control" value={form.secteur_id} onChange={(e) => update("secteur_id", e.target.value)}>
                  <option value="">Choisir un secteur</option>
                  {secteurs.map((s) => <option key={s.id} value={s.id}>{s.code} - {s.nom}</option>)}
                </select>
              </label>
              <label className="form-group">
                <span className="form-label">Année cible</span>
                <input className="form-control" type="number" min="2020" max="2035" value={form.annee_cible} onChange={(e) => update("annee_cible", e.target.value)} />
              </label>
              <label className="form-group">
                <span className="form-label">Mois cible</span>
                <select className="form-control" value={form.mois_cible} onChange={(e) => update("mois_cible", e.target.value)}>
                  {MOIS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
              </label>
              <label className="form-group">
                <span className="form-label">Objectif de régimes</span>
                <input className="form-control" type="number" min="0" value={form.objectif_regimes} onChange={(e) => update("objectif_regimes", e.target.value)} placeholder="Auto si vide" />
              </label>
              <label className="form-group">
                <span className="form-label">Nombre de récolteurs</span>
                <input className="form-control" type="number" min="1" value={form.nb_recolteurs} onChange={(e) => update("nb_recolteurs", e.target.value)} />
              </label>
              <label className="form-group">
                <span className="form-label">Heures par jour</span>
                <input className="form-control" type="number" min="1" step="0.5" value={form.nb_heures} onChange={(e) => update("nb_heures", e.target.value)} />
              </label>
              <label className="form-group">
                <span className="form-label">Cycle de passage</span>
                <input className="form-control" type="number" min="1" value={form.frequence_cycle_jours} onChange={(e) => update("frequence_cycle_jours", e.target.value)} />
              </label>
              <label className="form-group">
                <span className="form-label">Pluie estimée (%)</span>
                <input className="form-control" type="number" min="-80" max="80" value={form.variation_pluie_pct} onChange={(e) => update("variation_pluie_pct", e.target.value)} />
              </label>
              <label className="form-group">
                <span className="form-label">Entretien du secteur</span>
                <input className="form-control" type="range" min="0" max="100" value={form.niveau_entretien} onChange={(e) => update("niveau_entretien", e.target.value)} />
                <span className="field-hint">Niveau : {form.niveau_entretien}%</span>
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              <button className="btn btn-secondary" type="submit" disabled={simulating}>
                {simulating ? "Simulation..." : "Simuler le scénario"}
              </button>
              <button className="btn btn-primary" type="button" onClick={handlePrescription} disabled={submitting}>
                {submitting ? "Création..." : "Générer une prescription"}
              </button>
            </div>
          </form>
        </div>

        <div className="card">
          <h3 style={{ margin: "0 0 14px" }}>Lecture du scénario</h3>
          {!simulation ? (
            <div className="empty-state" style={{ padding: "24px 0" }}>
              Lancez une simulation pour obtenir un impact estimàet des actions concrètes.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              <Metric label="Référence" value={`${f(simulation.rendement_reference)} régimes`} />
              <Metric label="Scénario" value={`${f(simulation.rendement_simule)} régimes`} accent />
              <Metric label="Variation" value={`${f(simulation.variation_pct, 1)}%`} />
              <p style={{ margin: 0, fontWeight: 700 }}>{simulation.lecture}</p>
              <div>
                <strong>Actions proposées</strong>
                <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                  {simulation.actions?.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="chart-card-header">
          <h3>Prescriptions récentes</h3>
          {isAdmin && <span className="field-hint">Vue globale administrateur</span>}
        </div>
        {loading ? (
          <div className="page-loading">Chargement...</div>
        ) : prescriptions.length === 0 ? (
          <div className="empty-state">Aucune prescription cr²e pour le moment.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12 }}>
            {prescriptions.map((p) => (
              <div key={p.id} className="ia-prescription-card">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <strong>{p.secteur_code} - {MOIS[p.mois_cible - 1]} {p.annee_cible}</strong>
                  <span className="badge-info" style={{ padding: "2px 8px", borderRadius: 999, fontSize: 12 }}>{p.statut_display}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8, marginTop: 10 }}>
                  <Metric label="Objectif" value={`${f(p.objectif_regimes)} reg.`} />
                  <Metric label="Prévu" value={`${f(p.rendement_predit)} reg.`} />
                  <Metric label="Équipe" value={`${p.nb_recolteurs_recommande} pers.`} />
                  <Metric label="Confiance" value={`${f(p.score_confiance)}%`} />
                </div>
                {p.alertes?.length > 0 && (
                  <div style={{ marginTop: 10, fontSize: 12, color: "#92400e" }}>
                    {p.alertes[0].message}
                  </div>
                )}
                {p.conseils?.length > 0 && (
                  <div style={{ marginTop: 10, fontSize: 12 }}>
                    <strong>{p.conseils[0].titre}</strong> : {p.conseils[0].detail}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, accent = false }) {
  return (
    <div style={{ padding: "8px 10px", borderRadius: 8, background: accent ? "#e8f5e9" : "var(--background)", border: "1px solid var(--border)" }}>
      <div style={{ fontSize: 11, color: "#6b7280" }}>{label}</div>
      <div style={{ fontWeight: 800, color: accent ? "var(--primary)" : "var(--text)" }}>{value}</div>
    </div>
  );
}
