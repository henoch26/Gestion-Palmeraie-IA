/**
 * ListePredictions.jsx — Liste et formulaire de prédiction de rendement.
 * Permet de lancer une prédiction via le formulaire et d'afficher l'historique.
 */
import { useEffect, useState, useCallback } from "react";
import { expliquerPrediction, listPredictions, predireRendement, simulerScenario, creerPrescription } from "../../services/iaService.js";
import { apiGet } from "../../api/axios.js";
import { useToast } from "../../context/ToastContext.jsx";
import { useAuth } from "../../context/AuthContext.jsx";

const MOIS = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];
const ALGOS = [
  { value: "random_forest",     label: "Moteur robuste (recommande)" },
  { value: "linear_regression", label: "Moteur simple" },
];

const NIVEAU_FIABILITE = {
  eleve:   { label: "Fiabilité élevée",   color: "#16a34a" },
  modere:  { label: "Fiabilité modérée",  color: "#d97706" },
  faible:  { label: "Fiabilité faible",   color: "#dc2626" },
  inconnu: { label: "Fiabilité inconnue", color: "#9ca3af" },
};

function fiabiliteLabel(fiabilite) {
  const info = NIVEAU_FIABILITE[fiabilite?.niveau] || NIVEAU_FIABILITE.inconnu;
  const r2 = fiabilite?.r2;
  const objectif = fiabilite?.objectif_memoire;
  const detail = r2 != null
    ? `R² = ${Math.round(r2 * 100)}%${objectif != null ? ` (objectif mémoire : ≥ ${Math.round(objectif * 100)}%)` : ""}`
    : null;
  return { ...info, detail };
}

export default function ListePredictions() {
  const { pushToast } = useToast();
  const { isAdmin } = useAuth();
  const [predictions, setPredictions] = useState([]);
  const [secteurs, setSecteurs]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [submitting, setSubmitting]   = useState(false);
  const [showForm, setShowForm]       = useState(false);
  const [result, setResult]           = useState(null);
  const [explanation, setExplanation] = useState(null);
  const [explainingId, setExplainingId] = useState(null);
  const [form, setForm] = useState({
    secteur_id: "", annee_cible: new Date().getFullYear(),
    mois_cible: new Date().getMonth() + 1, algorithme: "random_forest",
  });
  const [objectifForm, setObjectifForm] = useState({
    objectif_regimes: "", nb_recolteurs: 8, nb_heures: 7,
    frequence_cycle_jours: 15, variation_pluie_pct: 0, niveau_entretien: 60,
  });
  const [simulation, setSimulation] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [creatingPlan, setCreatingPlan] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [preds, secs] = await Promise.all([listPredictions(), apiGet("/secteurs/")]);
      setPredictions(Array.isArray(preds) ?preds : preds.results || []);
      setSecteurs(Array.isArray(secs) ? secs : secs.results || []);
    } catch { pushToast({ type: "error", title: "Erreur", message: "Chargement impossible." }); }
    finally { setLoading(false); }
  }, [pushToast]);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.secteur_id) {
      pushToast({ type: "warning", title: "Champ manquant", message: "Sélectionnez un secteur." });
      return;
    }
    setSubmitting(true); setResult(null); setExplanation(null);
    try {
      const res = await predireRendement({ ...form, secteur_id: Number(form.secteur_id) });
      setResult(res);
      pushToast({ type: "success", title: "Prédiction", message: `Rendement prédit : ${res.prediction?.valeur_predite} régimes.` });
      load();
    } catch (e) {
      pushToast({ type: "error", title: "Erreur", message: e?.message || "Prédiction échouée. Vérifiez que le système intelligent est optimisé." });
    } finally { setSubmitting(false); }
  };

  const f = (v, d = 0) => v != null ? Number(v).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";

  const handleExplain = async (prediction) => {
    setExplainingId(prediction.id);
    try {
      const data = await expliquerPrediction(prediction.id);
      setExplanation({ prediction, data });
    } catch (e) {
      pushToast({ type: "error", title: "Erreur", message: e?.message || "Explication IA indisponible." });
    } finally {
      setExplainingId(null);
    }
  };

  const objectifPayload = () => ({
    secteur_id: Number(form.secteur_id),
    annee_cible: Number(form.annee_cible),
    mois_cible: Number(form.mois_cible),
    objectif_regimes: objectifForm.objectif_regimes ? Number(objectifForm.objectif_regimes) : undefined,
    nb_recolteurs: Number(objectifForm.nb_recolteurs),
    nb_heures: Number(objectifForm.nb_heures),
    frequence_cycle_jours: Number(objectifForm.frequence_cycle_jours),
    variation_pluie_pct: Number(objectifForm.variation_pluie_pct),
    niveau_entretien: Number(objectifForm.niveau_entretien),
  });

  const handleSimulate = async (e) => {
    e.preventDefault();
    setSimulating(true); setSimulation(null);
    try {
      const res = await simulerScenario(objectifPayload());
      setSimulation(res);
    } catch (e) {
      pushToast({ type: "error", title: "Erreur", message: e?.message || "Simulation impossible." });
    } finally { setSimulating(false); }
  };

  const handleCreatePlan = async () => {
    setCreatingPlan(true);
    try {
      await creerPrescription(objectifPayload());
      pushToast({ type: "success", title: "Plan enregistré", message: "Le plan d'action a été créé." });
    } catch (e) {
      pushToast({ type: "error", title: "Erreur", message: e?.message || "Création du plan impossible." });
    } finally { setCreatingPlan(false); }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Prédictions de rendement</h1>
          <p className="page-subtitle">Prévisions IA basées sur Random Forest et Moteur simple</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(s => !s)}>
          {showForm ? "Masquer le formulaire" : "Nouvelle prédiction"}
        </button>
      </div>

      <div className="ia-decision-notice"><span><strong>Decision humaine obligatoire.</strong> Les resultats IA sont des recommandations consultatives a verifier avant toute action sensible.</span></div>

      {showForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ margin: "0 0 16px" }}>Paramètres de prédiction</h3>
          <form onSubmit={handleSubmit}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Secteur *</label>
                <select className="form-control" value={form.secteur_id}
                  onChange={e => setForm(f => ({ ...f, secteur_id: e.target.value }))}>
                  <option value="">-- Choisir --</option>
                  {secteurs.map(s => <option key={s.id} value={s.id}>{s.code} — {s.nom}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Année cible</label>
                <input type="number" className="form-control" min={2020} max={2030}
                  value={form.annee_cible} onChange={e => setForm(f => ({ ...f, annee_cible: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Mois cible</label>
                <select className="form-control" value={form.mois_cible}
                  onChange={e => setForm(f => ({ ...f, mois_cible: e.target.value }))}>
                  {MOIS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                </select>
              </div>
              {isAdmin && (
                <div className="form-group">
                  <label className="form-label">Moteur de calcul</label>
                  <select className="form-control" value={form.algorithme}
                    onChange={e => setForm(f => ({ ...f, algorithme: e.target.value }))}>
                    {ALGOS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button className="btn btn-primary" type="submit" disabled={submitting}>
                {submitting ? "Calcul en cours…" : "Prédire"}
              </button>
            </div>
          </form>

          {result && (
            <div style={{ marginTop: 20, padding: 16, background: "var(--background)", borderRadius: 8 }}>
              <h4 style={{ margin: "0 0 12px", color: "var(--primary)" }}>Résultat de la prédiction</h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
                <PredCard label="Rendement estimé"     value={`${f(result.prediction?.valeur_predite)} régimes`} accent />
                <PredCard label="Estimation basse"     value={`${f(result.prediction?.intervalle_bas)} régimes`} />
                <PredCard label="Estimation haute"     value={`${f(result.prediction?.intervalle_haut)} régimes`} />
              </div>
              {result.fiabilite && (() => {
                const conf = fiabiliteLabel(result.fiabilite);
                return (
                  <div style={{ marginTop: 10, fontSize: 12, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                    <span>
                      Fiabilité du modèle :&nbsp;
                      <strong style={{ color: conf.color }}>{conf.label}</strong>
                      {conf.detail && <span style={{ color: "#6b7280" }}> — {conf.detail}</span>}
                    </span>
                    {isAdmin && result.modele && (
                      <span style={{ color: "#6b7280" }}>
                        {result.modele.nom} | RMSE={result.modele.metriques?.rmse != null ? result.modele.metriques.rmse.toFixed(1) : "-"}
                      </span>
                    )}
                  </div>
                );
              })()}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12, marginTop: 16 }}>
                <ExplicationBox explication={result.explication} />
                <PlanEquipeBox plan={result.plan_equipe} />
              </div>

              <ObjectifSection
                objectifForm={objectifForm}
                setObjectifForm={setObjectifForm}
                onSimulate={handleSimulate}
                simulating={simulating}
                simulation={simulation}
                onCreatePlan={handleCreatePlan}
                creatingPlan={creatingPlan}
                f={f}
              />
            </div>
          )}
        </div>
      )}

      {explanation && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="chart-card-header">
            <h3>Explication IA — {explanation.prediction?.secteur_code || "secteur"}</h3>
            <button className="btn-link" onClick={() => setExplanation(null)}>Fermer</button>
          </div>
          <ExplicationBox explication={explanation.data} />
        </div>
      )}

      {loading ? (
        <div className="page-loading">Chargement…</div>
      ) : predictions.length === 0 ? (
        <div className="empty-state">Aucune prédiction. Lancez votre première prédiction.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Secteur</th><th>Période</th><th>Rendement estimé</th>
                <th>Fourchette</th><th>Rendement réel</th><th>Écart</th>
                {isAdmin && <th>Moteur</th>}<th>Lecture IA</th><th>Date</th>
              </tr>
            </thead>
            <tbody>
              {predictions.map(p => (
                <tr key={p.id}>
                  <td>{p.secteur_code || "—"}</td>
                  <td>{p.mois_cible ? `${MOIS[p.mois_cible - 1]} ` : ""}{p.annee_cible}</td>
                  <td style={{ fontWeight: 600 }}>{f(p.valeur_predite)} rég.</td>
                  <td style={{ fontSize: 12, color: "#6b7280" }}>
                    {f(p.intervalle_bas)} – {f(p.intervalle_haut)}
                  </td>
                  <td>{p.valeur_reelle != null ? `${f(p.valeur_reelle)} rég.` : <span className="text-muted">—</span>}</td>
                  <td>{p.erreur_absolue != null ?f(p.erreur_absolue, 1) : "—"}</td>
                  {isAdmin && <td style={{ fontSize: 12 }}>{p.modele_nom}</td>}
                  <td>
                    <button className="btn-link" onClick={() => handleExplain(p)} disabled={explainingId === p.id}>
                      {explainingId === p.id ? "Analyse..." : "Expliquer"}
                    </button>
                  </td>
                  <td style={{ fontSize: 12 }}>{new Date(p.date_prediction).toLocaleDateString("fr-FR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PredCard({ label, value, accent }) {
  return (
    <div style={{
      padding: "10px 14px", borderRadius: 6,
      background: accent ? "var(--primary)" : "var(--white)",
      color: accent ? "#fff" : "inherit",
      border: "1px solid var(--border)",
    }}>
      <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
    </div>
  );
}


function ExplicationBox({ explication }) {
  if (!explication) return <div className="empty-state">Explication IA indisponible.</div>;
  return (
    <div style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 8, background: "var(--white)" }}>
      <strong>Pourquoi cette estimation ?</strong>
      <p style={{ margin: "6px 0 10px", color: "#4b5563" }}>{explication.resume}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <span className="badge">Confiance : {explication.niveau_confiance}</span>
        <span className="badge">Incertitude : {Number(explication.incertitude_pct || 0).toLocaleString("fr-FR")}%</span>
      </div>
      {explication.comparaison_objectif?.lecture && (
        <p style={{ margin: "0 0 10px", fontSize: 13 }}>{explication.comparaison_objectif.lecture}</p>
      )}
      <div style={{ display: "grid", gap: 8 }}>
        {explication.facteurs?.map((item) => (
          <div key={item.feature} style={{ padding: 8, borderRadius: 6, background: "var(--background)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <strong>{item.label}</strong>
              <span>{Number(item.importance_pct || 0).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}%</span>
            </div>
            <small style={{ color: "#6b7280" }}>{item.lecture}</small>
          </div>
        ))}
      </div>
      {explication.actions?.length > 0 && (
        <ul style={{ margin: "10px 0 0", paddingLeft: 18 }}>
          {explication.actions.map((item) => <li key={item}>{item}</li>)}
        </ul>
      )}
    </div>
  );
}

function PlanEquipeBox({ plan }) {
  if (!plan) return <div className="empty-state">Plan equipe indisponible.</div>;
  return (
    <div style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 8, background: "var(--white)" }}>
      <strong>Plan equipe recommande</strong>
      <p style={{ margin: "6px 0 10px", color: "#4b5563" }}>{plan.lecture}</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
        <PredCard label="Recolteurs" value={plan.nb_recolteurs} accent />
        <PredCard label="Passages" value={plan.nb_fiches} />
        <PredCard label="Cycle" value={`${plan.frequence_cycle_jours} jours`} />
        <PredCard label="Capacite" value={`${Number(plan.capacite_estimee || 0).toLocaleString("fr-FR")} reg.`} />
      </div>
      {plan.actions?.length > 0 && (
        <ul style={{ margin: "10px 0 0", paddingLeft: 18 }}>
          {plan.actions.map((item) => <li key={item}>{item}</li>)}
        </ul>
      )}
    </div>
  );
}

function ObjectifSection({ objectifForm, setObjectifForm, onSimulate, simulating, simulation, onCreatePlan, creatingPlan, f }) {
  const update = (key, value) => setObjectifForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div style={{ marginTop: 20, padding: 16, border: "1px dashed var(--border)", borderRadius: 8 }}>
      <h4 style={{ margin: "0 0 4px" }}>Atteindre un objectif</h4>
      <p style={{ margin: "0 0 14px", fontSize: 12, color: "#6b7280" }}>
        Estimation par règles métier (capacité moyenne observée par récolteur) — à distinguer de la
        prédiction du modèle IA ci-dessus, qui n'utilise pas ces variables opérationnelles.
      </p>
      <form onSubmit={onSimulate}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Objectif de régimes</label>
            <input className="form-control" type="number" min="0" placeholder="Auto si vide"
              value={objectifForm.objectif_regimes} onChange={(e) => update("objectif_regimes", e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Nombre de récolteurs</label>
            <input className="form-control" type="number" min="1"
              value={objectifForm.nb_recolteurs} onChange={(e) => update("nb_recolteurs", e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Heures par jour</label>
            <input className="form-control" type="number" min="1" step="0.5"
              value={objectifForm.nb_heures} onChange={(e) => update("nb_heures", e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Cycle de passage (jours)</label>
            <input className="form-control" type="number" min="1"
              value={objectifForm.frequence_cycle_jours} onChange={(e) => update("frequence_cycle_jours", e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Pluie estimée (%)</label>
            <input className="form-control" type="number" min="-80" max="80"
              value={objectifForm.variation_pluie_pct} onChange={(e) => update("variation_pluie_pct", e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Entretien du secteur : {objectifForm.niveau_entretien}%</label>
            <input className="form-control" type="range" min="0" max="100"
              value={objectifForm.niveau_entretien} onChange={(e) => update("niveau_entretien", e.target.value)} />
          </div>
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-secondary" type="submit" disabled={simulating}>
            {simulating ? "Simulation…" : "Simuler ce scénario"}
          </button>
          <button className="btn btn-primary" type="button" onClick={onCreatePlan} disabled={creatingPlan}>
            {creatingPlan ? "Création…" : "Enregistrer un plan d'action"}
          </button>
        </div>
      </form>

      {simulation && (
        <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
            <PredCard label="Référence" value={`${f(simulation.rendement_reference)} régimes`} />
            <PredCard label="Scénario"  value={`${f(simulation.rendement_simule)} régimes`} accent />
            <PredCard label="Variation" value={`${f(simulation.variation_pct, 1)}%`} />
          </div>
          <p style={{ margin: 0, fontWeight: 700 }}>{simulation.lecture}</p>
          {simulation.actions?.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {simulation.actions.map((item) => <li key={item}>{item}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
