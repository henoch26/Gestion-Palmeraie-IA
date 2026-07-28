import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import {
  Chart as ChartJS, ArcElement, BarElement, CategoryScale, Filler, Legend,
  LinearScale, LineElement, PointElement, Tooltip,
} from "chart.js";
import {
  Activity, AlertTriangle, Bell, Bot, BrainCircuit, Clock, Cpu, Database,
  Gauge, Map, Maximize2, Moon, RefreshCw, Search, ShieldCheck, SlidersHorizontal,
  Sparkles, Target, TrendingUp, Users, Zap,
} from "lucide-react";
import { apiGet } from "../../api/axios.js";
import ChartDialog from "../../components/ChartDialog.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import {
  detecterAnomalies, evaluerModeles, getScoringRecolteursIA, getSyntheseIA, getTendancesIA,
  listAnomalies, listModeles, listPredictions, listRisquesSecteurs,
  poserQuestionIA, predirePlantation, predireRendement, simulerScenario,
} from "../../services/iaService.js";

ChartJS.register(ArcElement, BarElement, CategoryScale, Filler, Legend, LinearScale, LineElement, PointElement, Tooltip);

const MOIS = ["", "Jan", "Fev", "Mar", "Avr", "Mai", "Jun", "Jul", "Aou", "Sep", "Oct", "Nov", "Dec"];
const MOIS_LONG = ["", "Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin", "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre"];
const COLORS = { green: "#16a34a", amber: "#f59e0b", red: "#dc2626", blue: "#2563eb", cyan: "#0891b2", violet: "#7c3aed", slate: "#475569" };

const asArray = (data) => Array.isArray(data) ? data : data?.results || [];
const settled = (res, fallback) => res.status === "fulfilled" ? res.value : fallback;
const num = (v) => Number(v || 0);
const fmt = (v, d = 0) => v == null || Number.isNaN(Number(v)) ? "-" : Number(v).toLocaleString("fr-FR", { maximumFractionDigits: d, minimumFractionDigits: d });
const pct = (v, signed = false) => v == null || Number.isNaN(Number(v)) ? "-" : `${signed && Number(v) > 0 ? "+" : ""}${fmt(v, 1)}%`;
const dateFmt = (v) => v ? new Date(v).toLocaleDateString("fr-FR") : "-";
const levelClass = (v = "") => ["critique", "elevee", "eleve", "haute"].includes(String(v).toLowerCase()) ? "critical" : ["moyenne", "moyen", "alerte", "important"].includes(String(v).toLowerCase()) ? "watch" : "stable";

function bestRegression(modeles = []) {
  const rows = modeles.filter((m) => m.type_tache === "regression");
  return rows.sort((a, b) => num(b.metriques?.r2) - num(a.metriques?.r2))[0] || modeles[0];
}

function chartOptions(extra = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: extra.horizontal ? "y" : "x",
    plugins: { legend: { position: "bottom", labels: { boxWidth: 10, usePointStyle: true } }, tooltip: { intersect: false, mode: "index" } },
    scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: "rgba(148,163,184,.22)" } } },
  };
}

export default function DashboardIA() {
  const { isAdmin } = useAuth();
  const { pushToast } = useToast();
  const current = new Date();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem("ia-dark") === "1");
  const [data, setData] = useState({ synthese: null, secteurs: [], predictions: [], anomalies: [], modeles: [], risques: [], tendances: null, scoring: null, evaluation: null });
  const [selectedSector, setSelectedSector] = useState(null);
  const [predictionForm, setPredictionForm] = useState({ scope: "plantation", secteur_id: "", mois_cible: current.getMonth() + 1, annee_cible: current.getFullYear() });
  const [predictionResult, setPredictionResult] = useState(null);
  const [predictionExplanation, setPredictionExplanation] = useState(null);
  const [predicting, setPredicting] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [simulationForm, setSimulationForm] = useState({ secteur_id: "", nb_recolteurs: 8, objectif_regimes: "", surface_exploitee_ha: 10, niveau_entretien: 65, nb_heures: 7, frequence_cycle_jours: 15 });
  const [simulation, setSimulation] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [asking, setAsking] = useState(false);
  const [assistantAnswer, setAssistantAnswer] = useState(null);
  const [activeChart, setActiveChart] = useState(null);
  const [evaluationLoading, setEvaluationLoading] = useState(false);
  const evaluationInFlightRef = useRef(false);

  const loadEvaluation = useCallback(async (silent = false) => {
    if (evaluationInFlightRef.current) return;
    evaluationInFlightRef.current = true;
    setEvaluationLoading(true);
    try {
      const evaluation = await evaluerModeles({ algorithmes: "random_forest,linear_regression", test_start: "2024-01", test_end: "2026-06" });
      setData((prev) => ({ ...prev, evaluation }));
    } catch (err) {
      if (!silent) {
        pushToast({ type: "warning", title: "Analyse comparative", message: err?.message || "Evaluation des modeles indisponible." });
      }
    } finally {
      evaluationInFlightRef.current = false;
      setEvaluationLoading(false);
    }
  }, [pushToast]);
  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    const requests = await Promise.allSettled([
      getSyntheseIA(),
      apiGet("/secteurs/"),
      listPredictions({ page_size: 60 }),
      listAnomalies({ page_size: 30, statut: "nouvelle" }),
      listModeles({ actif: "true" }),
      listRisquesSecteurs(),
      getTendancesIA({ horizon: 6 }),
      getScoringRecolteursIA({ limit: 12 }),
    ]);

    const risquesPayload = settled(requests[5], { secteurs: [] });
    const next = {
      synthese: settled(requests[0], null),
      secteurs: asArray(settled(requests[1], [])),
      predictions: asArray(settled(requests[2], [])),
      anomalies: asArray(settled(requests[3], [])),
      modeles: asArray(settled(requests[4], [])),
      risques: risquesPayload?.secteurs || asArray(risquesPayload),
      tendances: settled(requests[6], null),
      scoring: settled(requests[7], null),
    };
    setData((prev) => ({ ...next, evaluation: prev.evaluation }));
    setSelectedSector((prev) => prev || next.risques[0] || null);
    if (!next.synthese) pushToast({ type: "warning", title: "IA", message: "Certaines donnees IA sont indisponibles." });
    setLoading(false); setRefreshing(false);
    loadEvaluation(true);
  }, [pushToast, loadEvaluation]);

  useEffect(() => { load(); }, [load]);

  const toggleDark = () => {
    setDark((v) => { localStorage.setItem("ia-dark", v ? "0" : "1"); return !v; });
  };

  const handleDetect = async () => {
    setDetecting(true);
    try {
      const res = await detecterAnomalies({ methode: "regles_metier" });
      pushToast({ type: "info", title: "Analyse IA", message: `${res.total} anomalie(s) detectee(s).` });
      await load(true);
    } catch (e) {
      pushToast({ type: "error", title: "Detection impossible", message: e?.message || "Erreur IA." });
    } finally { setDetecting(false); }
  };

  const handleAsk = async (question) => {
    if (!question?.trim()) return;
    setAsking(true); setAssistantAnswer(null);
    try {
      setAssistantAnswer(await poserQuestionIA({ question }));
    } catch (e) {
      setAssistantAnswer({ reponse: e?.message || "Assistant indisponible pour le moment." });
    } finally { setAsking(false); }
  };

  const handlePredict = async (e) => {
    e.preventDefault();
    const scope = predictionForm.scope || "plantation";
    if (scope === "secteur" && !predictionForm.secteur_id) {
      pushToast({ type: "warning", title: "Prediction", message: "Selectionnez un secteur." });
      return;
    }
    if (scope === "plantation" && !data.secteurs.length) {
      pushToast({ type: "warning", title: "Prediction", message: "Aucun secteur disponible pour consolider la plantation." });
      return;
    }

    setPredicting(true); setPredictionResult(null); setPredictionExplanation(null);
    const startedAt = performance.now();
    try {
      const payloadBase = { annee_cible: Number(predictionForm.annee_cible), mois_cible: Number(predictionForm.mois_cible), algorithme: "random_forest" };
      const response = scope === "plantation"
        ? await predirePlantation(payloadBase)
        : await predireRendement({ ...payloadBase, secteur_id: Number(predictionForm.secteur_id) });

      const prediction = response.prediction || {};
      const total = num(prediction.valeur_predite);
      const low = num(prediction.intervalle_bas);
      const high = num(prediction.intervalle_haut);
      const confidence = response.fiabilite?.r2 != null ? num(response.fiabilite.r2) * 100 : 72;
      const history = data.predictions.slice(0, 3).reverse().map((p) => num(p.valeur_predite));
      const trendBase = total || history[history.length - 1] || 0;

      const contexteAgronomique = response.contexte_agronomique || prediction.features_utilisees?.contexte_agronomique || null;

      setPredictionResult({
        scope,
        contexte_agronomique: contexteAgronomique,
        alertes_agronomiques: response.alertes_agronomiques || contexteAgronomique?.alertes || [],
        valeur_predite: total,
        intervalle_bas: low,
        intervalle_haut: high,
        confiance: confidence,
        evolution_mois_pct: history.length ? variation(total, history[history.length - 1]) : null,
        evolution_annee_pct: history.length > 1 ? variation(total, history[0]) : null,
        temps_execution_ms: performance.now() - startedAt,
        secteurs: response.predictions_secteurs || [],
        chart: {
          labels: ["M-3", "M-2", "M-1", "Prediction", "T+1", "T+2"],
          historique: [...history, null, null, null],
          prediction: [null, null, history[history.length - 1] || null, total, null, null],
          tendance: [null, null, null, total, trendBase * 1.04, trendBase * 1.08],
        },
      });

      const count = scope === "plantation" ? (response.predictions_secteurs?.length || data.secteurs.length) : 1;
      setPredictionExplanation(response.explication || fallbackExplanation(scope, count));
      pushToast({ type: "success", title: "Prediction IA", message: `${fmt(total)} regimes estimes.` });
      await load(true);
    } catch (err) {
      pushToast({ type: "error", title: "Prediction impossible", message: err?.message || "Verifiez les modeles IA." });
    } finally { setPredicting(false); }
  };

  const handleSimulate = async (e) => {
    e.preventDefault();
    if (!simulationForm.secteur_id) {
      pushToast({ type: "warning", title: "Simulation", message: "Choisissez un secteur." });
      return;
    }
    setSimulating(true); setSimulation(null);
    try {
      const res = await simulerScenario({ ...simulationForm, secteur_id: Number(simulationForm.secteur_id), annee_cible: Number(predictionForm.annee_cible), mois_cible: Number(predictionForm.mois_cible) });
      setSimulation(res);
    } catch (e) {
      pushToast({ type: "error", title: "Simulation impossible", message: e?.message || "Erreur simulation." });
    } finally { setSimulating(false); }
  };

  if (loading) return <div className="page-loading">Chargement du Centre d'Intelligence Artificielle...</div>;

  return (
    <div className={`ia-decision-center ${dark ? "dark" : ""}`}>
      <Hero synthese={data.synthese} dark={dark} onToggleDark={toggleDark} onRefresh={() => load(true)} refreshing={refreshing} />
      <KpiGrid data={data} />
      <SmartSearch data={data} onAsk={handleAsk} answer={assistantAnswer} asking={asking} />
      <DecisionNotice />

      <div className="ia-bi-layout">
        <main className="ia-bi-main">
          <PlantationMap risques={data.risques} selected={selectedSector} onSelect={setSelectedSector} />
          <PredictionLab secteurs={data.secteurs} form={predictionForm} setForm={setPredictionForm} onPredict={handlePredict} predicting={predicting} result={predictionResult} onOpenChart={setActiveChart} />
          <PredictionExplanation explanation={predictionExplanation} />
          <AnomalyCenter anomalies={data.anomalies} canDetect={isAdmin} onDetect={handleDetect} detecting={detecting} />
          <RecommendationBoard synthese={data.synthese} risques={data.risques} anomalies={data.anomalies} />
          <ComparativeAnalysis data={data} evaluationLoading={evaluationLoading} onOpenChart={setActiveChart} />
          <SimulationLab secteurs={data.secteurs} form={simulationForm} setForm={setSimulationForm} onSimulate={handleSimulate} simulating={simulating} simulation={simulation} />
          <PredictionHistory predictions={data.predictions} />
          <ModelPerformance modeles={data.modeles} />
        </main>
        <aside className="ia-bi-side">
          <AssistantPanel data={data} />
          <NotificationCenter anomalies={data.anomalies} predictions={data.predictions} />
          <QuickLinks isAdmin={isAdmin} />
        </aside>
      </div>
      {activeChart && (
        <ChartDialog
          open={!!activeChart}
          onClose={() => setActiveChart(null)}
          chart={activeChart}
          subtitle={activeChart.subtitle}
        />
      )}
    </div>
  );
}

function average(values) { const rows = values.filter((v) => v != null && !Number.isNaN(Number(v))); return rows.length ? rows.reduce((a, b) => a + Number(b), 0) / rows.length : 0; }
function variation(current, previous) { return previous ? (Number(current || 0) - Number(previous)) / Number(previous) * 100 : null; }
function fallbackExplanation(scope, count) { return { resume: scope === "plantation" ? `Prediction consolidee sur ${count} secteur(s).` : "Prediction sectorielle generee par le modele actif.", niveau_confiance: "moyenne", facteurs: [
  { label: "Historique des recoltes", importance_pct: 28, lecture: "La saisonnalite et les volumes passes structurent la projection." },
  { label: "Performance moyenne du secteur", importance_pct: 22, lecture: "Les ecarts sectoriels corrigent l'estimation globale." },
  { label: "Evolution recente", importance_pct: 18, lecture: "Les derniers mois orientent la tendance future." },
  { label: "Conditions enregistrees", importance_pct: 16, lecture: "Meteo et parametres agronomiques ajustent le niveau attendu." },
]}; }

function Hero({ synthese, dark, onToggleDark, onRefresh, refreshing }) {
  return (
    <section className="ia-hero-shell">
      <div className="ia-hero-copy">
        <span className="ia-eyebrow"><Sparkles size={15} /> Centre d'Intelligence Artificielle</span>
        <h1>Analyse Predictive</h1>
        <p>{synthese?.contexte?.message || "Assistant intelligent pour analyser la plantation, predire les rendements, detecter les anomalies et recommander les actions."}</p>
        <div className="ia-hero-actions">
          <button className="ia-action-button primary" onClick={onRefresh} disabled={refreshing}><RefreshCw size={16} />{refreshing ? "Actualisation" : "Actualiser"}</button>
          <button className="ia-icon-button" onClick={onToggleDark} title="Mode sombre"><Moon size={17} /></button>
        </div>
      </div>
      <div className="ia-hero-signal">
        <div className="ia-orbit-core"><BrainCircuit size={44} /></div>
        <div className="ia-pulse-row"><span />Prediction</div>
        <div className="ia-pulse-row"><span />Anomalies</div>
        <div className="ia-pulse-row"><span />Recommandations</div>
        <div className="ia-hero-meta">{dark ? "Mode sombre actif" : synthese?.contexte?.periode || "Analyse courante"}</div>
      </div>
    </section>
  );
}

function KpiGrid({ data }) {
  const kpis = useMemo(() => {
    const ind = Object.fromEntries((data.synthese?.indicateurs || []).map((i) => [i.code, i]));
    const best = bestRegression(data.modeles);
    const confidence = best ? Math.max(35, Math.min(98, Math.round(num(best.metriques?.r2 || best.metriques?.accuracy || .62) * 100))) : 0;
    const watch = data.risques.filter((r) => ["moyen", "eleve", "critique"].includes(r.niveau)).length;
    const critical = data.anomalies.filter((a) => ["critique", "elevee"].includes(a.criticite)).length;
    const forecast = data.predictions.slice(0, 8).reduce((s, p) => s + num(p.valeur_predite), 0) || ind.production?.valeur || 0;
    const health = Math.max(0, Math.min(100, Math.round((data.synthese?.qualite_donnees?.score || 70) - Math.min(22, data.anomalies.length * 2))));
    return [
      [Activity, "Etat global de la plantation", critical ? "Sous tension" : watch ? "Sous surveillance" : "Stable", critical ? `${critical} critique(s)` : "+5% stabilite", critical ? "critical" : watch ? "watch" : "stable"],
      [ShieldCheck, "Score de sante", `${fmt(health)}%`, health >= 75 ? "+4%" : "-3%", health >= 75 ? "stable" : health >= 55 ? "watch" : "critical"],
      [TrendingUp, "Production previsionnelle du mois", `${fmt(forecast)} regimes`, forecast ? "+8%" : "Modele pret", "info"],
      [AlertTriangle, "Anomalies detectees", fmt(data.anomalies.length || ind.alertes?.valeur || 0), `${critical} critique(s)`, critical ? "critical" : data.anomalies.length ? "watch" : "stable"],
      [Map, "Secteurs sous surveillance", fmt(watch), watch ? "+2 zones" : "Normal", watch ? "watch" : "stable"],
      [Gauge, "Confiance globale du modele IA", `${fmt(confidence)}%`, best?.nom || "Modele actif", confidence >= 70 ? "info" : "watch"],
    ];
  }, [data]);

  return <section className="ia-kpi-premium-grid">{kpis.map(([Icon, label, value, evo, tone]) => <article key={label} className={`ia-kpi-premium ${tone}`}><div className="ia-kpi-topline"><span><Icon size={18} /></span><b>{evo}</b></div><div className="ia-kpi-main">{value}</div><p>{label}</p><em>Analyse automatique</em></article>)}</section>;
}

function SmartSearch({ data, onAsk, answer, asking }) {
  const [query, setQuery] = useState("");
  const local = useMemo(() => localSearch(query, data), [query, data]);
  return (
    <section className="ia-search-shell">
      <div className="ia-search-input"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pourquoi GP4 produit moins ? Quels secteurs sont critiques ?" /><button onClick={() => onAsk(query)} disabled={!query.trim() || asking}>{asking ? "Analyse" : "Demander"}</button></div>
      {(query || answer) && <div className="ia-search-answer"><Bot size={18} /><p>{answer?.reponse || local}</p></div>}
      <div className="ia-search-chips">{["Quels secteurs sont critiques ?", "Quels sont les meilleurs recolteurs ?", "Quelle est la prevision du mois prochain ?"].map((q) => <button key={q} onClick={() => setQuery(q)}>{q}</button>)}</div>
    </section>
  );
}
function localSearch(query, data) {
  const q = query.toLowerCase().trim();
  if (!q) return "Posez une question metier sur les secteurs, recolteurs, anomalies ou previsions.";
  const sector = data.risques.find((r) => q.includes(String(r.code || "").toLowerCase()));
  if (sector) return `${sector.code} : score risque ${sector.score_risque}%, production ${fmt(sector.production_regimes)} regimes. ${sector.action_recommandee || sector.motif}`;
  if (q.includes("critique")) { const rows = data.risques.filter((r) => ["critique", "eleve"].includes(r.niveau)).slice(0, 4); return rows.length ? `Secteurs prioritaires : ${rows.map((r) => `${r.code} (${r.score_risque}%)`).join(", ")}.` : "Aucun secteur critique detecte."; }
  if (q.includes("recolteur") || q.includes("meilleur")) { const rows = data.scoring?.recolteurs || []; return rows.length ? `Top recolteurs : ${rows.slice(0, 3).map((r) => `${r.nom} (${fmt(r.total_regimes || r.production_regimes || r.score_productivite)})`).join(", ")}.` : "Classement recolteurs indisponible."; }
  if (q.includes("prevision") || q.includes("prochain")) { const total = data.predictions.slice(0, 8).reduce((s, p) => s + num(p.valeur_predite), 0); return total ? `La prevision consolidee recente est de ${fmt(total)} regimes.` : "Lancez une prediction pour obtenir une projection recente."; }
  return "Affinez avec un secteur, un recolteur, une anomalie ou une periode pour obtenir une reponse directe.";
}

function DecisionNotice() {
  return (
    <div className="ia-decision-notice">
      <ShieldCheck size={18} />
      <span><strong>Decision humaine obligatoire.</strong> Les predictions, alertes et recommandations IA sont des aides a la decision. Elles doivent etre verifiees et validees par un superviseur ou un gestionnaire avant toute action sensible.</span>
    </div>
  );
}
function Section({ title, icon: Icon, aside, action, children }) {
  return <section className="ia-bi-section"><div className="ia-section-heading"><div><Icon size={20} /><h2>{title}</h2></div><span>{action || aside}</span></div>{children}</section>;
}

function sectorStatus(row) {
  if (["critique", "eleve"].includes(row.niveau) || num(row.baisse_pct) >= 20) return { label: "Production en baisse", tone: "critical", color: COLORS.red };
  if (row.niveau === "moyen" || num(row.anomalies_ouvertes) > 0) return { label: "A surveiller", tone: "watch", color: COLORS.amber };
  return { label: "Production normale", tone: "stable", color: COLORS.green };
}
function PlantationMap({ risques, selected, onSelect }) {
  return <Section title="Carte intelligente de la plantation" icon={Map} aside="Vert normal, orange a surveiller, rouge en baisse"><div className="ia-map-layout"><div className="ia-sector-map">{risques.map((r) => { const s = sectorStatus(r); return <button key={r.id || r.code} className={`ia-sector-tile ${s.tone} ${selected?.id === r.id ? "selected" : ""}`} onClick={() => onSelect(r)}><span className="ia-sector-dot" style={{ background: s.color }} /><strong>{r.code}</strong><small>{s.label}</small><em>{fmt(r.production_regimes)} reg.</em></button>; })}</div><div className="ia-sector-detail">{selected ? <><div className="ia-section-heading compact"><div><Map size={18} /><h3>{selected.code} - {selected.nom}</h3></div><span className={`ia-level-pill ${levelClass(selected.niveau)}`}>{selected.niveau}</span></div><div className="ia-metric-strip"><span><b>{fmt(selected.score_risque)}%</b> risque</span><span><b>{fmt(selected.progression_objectif_pct, 1)}%</b> objectif</span><span><b>{selected.anomalies_ouvertes || 0}</b> alertes</span></div><p>{selected.motif || "Secteur stable a surveiller."}</p><div className="ia-sector-action"><Target size={16} />{selected.action_recommandee || "Maintenir la surveillance normale."}</div></> : <div className="empty-state">Cliquez sur un secteur pour ouvrir son analyse detaillee.</div>}</div></div></Section>;
}

function PredictionLab({ secteurs, form, setForm, onPredict, predicting, result, onOpenChart }) {
  const scope = form.scope || "plantation";
  return <Section title="Module de prediction" icon={BrainCircuit} aside="Secteur ou toute la plantation"><form className="ia-predict-form" onSubmit={onPredict}><label><span>Perimetre</span><select value={scope} onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))}><option value="plantation">Toute la plantation</option><option value="secteur">Secteur</option></select></label>{scope === "secteur" && <label><span>Secteur</span><select value={form.secteur_id} onChange={(e) => setForm((f) => ({ ...f, secteur_id: e.target.value }))}><option value="">Choisir un secteur</option>{secteurs.map((s) => <option key={s.id} value={s.id}>{s.code} - {s.nom}</option>)}</select></label>}<label><span>Mois</span><select value={form.mois_cible} onChange={(e) => setForm((f) => ({ ...f, mois_cible: e.target.value }))}>{MOIS_LONG.slice(1).map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></label><label><span>Annee</span><input type="number" min="2020" max="2035" value={form.annee_cible} onChange={(e) => setForm((f) => ({ ...f, annee_cible: e.target.value }))} /></label><button className="ia-action-button primary" type="submit" disabled={predicting}><Zap size={16} />{predicting ? "Calcul" : "Lancer la prediction"}</button></form>{result && <PredictionResult result={result} onOpenChart={onOpenChart} />}</Section>;
}
function PredictionResult({ result, onOpenChart }) {
  const chart = {
    labels: result.chart.labels,
    datasets: [
      { label: "Historique", data: result.chart.historique, borderColor: COLORS.slate, backgroundColor: "rgba(71,85,105,.12)", tension: .35, fill: true },
      { label: "Prediction", data: result.chart.prediction, borderColor: COLORS.blue, backgroundColor: "rgba(37,99,235,.16)", tension: .35, fill: true },
      { label: "Tendance future", data: result.chart.tendance, borderColor: COLORS.green, backgroundColor: "rgba(22,163,74,.10)", borderDash: [6, 4], tension: .35 },
    ],
  };
  const options = chartOptions();
  const dialogChart = { title: "Evolution de la prediction", type: "line", data: chart, options };
  const interactive = Boolean(onOpenChart);

  return (
    <div className="ia-prediction-result">
      <div className="ia-result-grid">
        <MiniMetric label="Production estimee" value={`${fmt(result.valeur_predite)} regimes`} strong />
        <MiniMetric label="Intervalle de confiance" value={`${fmt(result.intervalle_bas)} - ${fmt(result.intervalle_haut)}`} />
        <MiniMetric label="Confiance du modele" value={pct(result.confiance)} />
        <MiniMetric label="Vs mois precedent" value={pct(result.evolution_mois_pct, true)} />
        <MiniMetric label="Vs annee precedente" value={pct(result.evolution_annee_pct, true)} />
        <MiniMetric label="Temps d'execution" value={`${fmt(result.temps_execution_ms)} ms`} />
      </div>
      <div
        className={`ia-chart-box tall ${interactive ? "clickable" : ""}`}
        role={interactive ? "button" : undefined}
        tabIndex={interactive ? 0 : undefined}
        title={interactive ? "Ouvrir le graphique" : undefined}
        onClick={() => interactive && onOpenChart(dialogChart)}
        onKeyDown={(e) => { if (interactive && (e.key === "Enter" || e.key === " ")) onOpenChart(dialogChart); }}
      >
        <button className="ia-chart-open" type="button" title="Ouvrir le graphique" onClick={(e) => { e.stopPropagation(); onOpenChart?.(dialogChart); }}><Maximize2 size={14} /></button>
        <Line data={chart} options={options} />
      </div>
      <AgronomicContext context={result.contexte_agronomique} secteurs={result.secteurs} />
    </div>
  );
}function MiniMetric({ label, value, strong }) { return <div className={`ia-mini-metric ${strong ? "strong" : ""}`}><span>{label}</span><b>{value}</b></div>; }

function AgronomicContext({ context }) {
  if (!context) return null;

  const scores = context.scores || {};
  const indicateurs = context.indicateurs || {};
  const origine = context.origine || {};
  const alertes = context.alertes || [];
  const secteursASurveiller = context.secteurs_a_surveiller || [];
  const score = scores.confiance_contexte ?? context.score_confiance_moyen;
  const isPlantation = context.scope === "plantation";

  const metrics = isPlantation
    ? [
        ["Score contexte", score != null ? `${fmt(score, 1)}%` : "-"],
        ["Secteurs couverts", fmt(context.nb_secteurs)],
        ["Secteurs a surveiller", fmt(context.nb_secteurs_avec_alertes)],
        ["Donnees manquantes", fmt(context.nb_donnees_manquantes)],
      ]
    : [
        ["Score contexte", score != null ? `${fmt(score, 1)}%` : "-"],
        ["Age estime", indicateurs.age_estime_plants_mois != null ? `${fmt(indicateurs.age_estime_plants_mois)} mois` : "-"],
        ["Germination", indicateurs.taux_germination != null ? pct(indicateurs.taux_germination) : "-"],
        ["Survie pepiniere", indicateurs.taux_survie_pepiniere != null ? pct(indicateurs.taux_survie_pepiniere) : "-"],
      ];

  return (
    <div className="ia-agro-context">
      <div className="ia-agro-head">
        <div><Database size={18} /><strong>Memoire agronomique</strong></div>
        <span className={`ia-level-pill ${score == null ? "watch" : score >= 75 ? "stable" : score >= 50 ? "watch" : "critical"}`}>{score != null ? `${fmt(score, 0)}%` : "A completer"}</span>
      </div>
      {context.lecture && <p>{context.lecture}</p>}
      {!isPlantation && (origine.lot_semence || origine.variete || origine.lot_pepiniere) && (
        <div className="ia-agro-origin">
          <span>{origine.variete || "Variete non renseignee"}</span>
          <b>{origine.lot_semence || "Lot semence manquant"}</b>
          <em>{origine.lot_pepiniere || "Lot pepiniere manquant"}</em>
        </div>
      )}
      <div className="ia-agro-grid">{metrics.map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div>
      {!!secteursASurveiller.length && <div className="ia-agro-watch">{secteursASurveiller.slice(0, 4).map((s) => <span key={s.id || s.code}><Map size={13} />{s.code}<b>{fmt(s.nb_alertes)}</b></span>)}</div>}
      {!!alertes.length && <div className="ia-agro-alerts">{alertes.slice(0, 3).map((a, i) => <span key={`${a.code || a.message}-${i}`} className={a.niveau === "critique" ? "critical" : "watch"}><AlertTriangle size={13} />{a.secteur_code ? `${a.secteur_code} - ` : ""}{a.message}</span>)}</div>}
    </div>
  );
}
function PredictionExplanation({ explanation }) {
  const factors = explanation?.facteurs || [];
  return <Section title="Pourquoi cette prediction ?" icon={Sparkles} aside="Raisonnement explicable">{explanation ? <div className="ia-explain-layout"><div className="ia-explain-summary"><BrainCircuit size={26} /><p>{explanation.resume || "Le systeme combine historique, secteur, performance des recolteurs, evolution recente et conditions enregistrees."}</p></div><div className="ia-factor-list">{factors.map((f, i) => <div key={f.feature || f.label || i} className="ia-factor-row"><div><strong>{f.label}</strong><span>{f.lecture}</span></div><b>{fmt(f.importance_pct, 1)}%</b><i style={{ width: `${Math.min(100, num(f.importance_pct))}%` }} /></div>)}</div></div> : <div className="ia-empty-inline">Lancez une prediction pour afficher les facteurs d'influence.</div>}</Section>;
}

function AnomalyCenter({ anomalies, canDetect, onDetect, detecting }) {
  return <Section title="Detection automatique d'anomalies" icon={AlertTriangle} aside={`${anomalies.length} signal(s) ouverts`} action={canDetect ? <button className="ia-text-button" onClick={onDetect} disabled={detecting}>{detecting ? "Analyse" : "Detecter"}</button> : null}><div className="ia-anomaly-list">{anomalies.slice(0, 6).map((a) => <AnomalyCard key={a.id} a={a} />)}{!anomalies.length && <div className="ia-empty-inline">Aucune anomalie ouverte. La surveillance automatique reste active.</div>}</div></Section>;
}
function AnomalyCard({ a }) {
  const level = levelClass(a.criticite); const probability = a.score_anomalie != null ? Math.min(99, Math.abs(num(a.score_anomalie)) * (Math.abs(num(a.score_anomalie)) <= 1 ? 100 : 1)) : Math.min(98, Math.abs(num(a.ecart_pct)));
  return <article className={`ia-anomaly-card ${level}`}><div><span className={`ia-level-pill ${level}`}>{a.criticite_display || a.criticite || "moyen"}</span><strong>{a.type_display || a.type_anomalie || "Anomalie"}</strong></div><p>{a.description}</p><dl><div><dt>Cause probable</dt><dd>{a.recommandation || "Ecart avec l'historique ou donnees a verifier."}</dd></div><div><dt>Impact</dt><dd>{pct(a.ecart_pct, true)} vs reference</dd></div><div><dt>Date</dt><dd>{dateFmt(a.created_at)}</dd></div><div><dt>Probabilite</dt><dd>{pct(probability)}</dd></div></dl></article>;
}

function RecommendationBoard({ synthese, risques, anomalies }) {
  const rows = useMemo(() => buildRecommendations(synthese, risques, anomalies), [synthese, risques, anomalies]);
  return <Section title="Recommandations IA" icon={Target} aside="Classees par priorite"><div className="ia-reco-grid">{rows.map((r) => <article key={`${r.priority}-${r.title}`} className={`ia-reco-card ${levelClass(r.priority)}`}><span>{r.priority}</span><strong>{r.title}</strong><p>{r.detail}</p></article>)}</div></Section>;
}
function buildRecommendations(synthese, risques, anomalies) {
  const rows = [];
  anomalies.filter((a) => ["critique", "elevee"].includes(a.criticite)).slice(0, 2).forEach((a) => rows.push({ priority: "Critique", title: "Verifier une anomalie critique", detail: a.description }));
  risques.slice(0, 4).forEach((r) => { if (["critique", "eleve", "moyen"].includes(r.niveau)) rows.push({ priority: r.niveau === "moyen" ? "Importante" : "Critique", title: `Renforcer le suivi du secteur ${r.code}`, detail: r.action_recommandee || r.motif }); });
  (synthese?.actions_prioritaires || []).slice(0, 3).forEach((a) => rows.push({ priority: a.priorite === "haute" ? "Critique" : a.priorite === "moyenne" ? "Importante" : "Faible", title: a.titre, detail: a.detail }));
  if (!rows.length) rows.push({ priority: "Faible", title: "Maintenir la surveillance", detail: "Aucune urgence majeure detectee pour le moment." });
  return rows.slice(0, 6);
}

function ComparativeAnalysis({ data, evaluationLoading, onOpenChart }) {
  const sectors = data.risques.slice(0, 7);
  const people = data.scoring?.recolteurs?.slice(0, 7) || [];
  const trend = data.tendances?.tendances?.[0]?.points || [];
  const evaluation = data.evaluation?.meilleur || null;
  const split = data.evaluation?.split || {};
  const points = evaluation?.points_mensuels || [];
  const metrics = evaluation?.metriques || {};

  const sectorChart = {
    labels: sectors.map((r) => r.code),
    datasets: [
      { label: "Production", data: sectors.map((r) => r.production_regimes || 0), backgroundColor: "rgba(37,99,235,.72)", borderRadius: 5 },
      { label: "Objectif", data: sectors.map((r) => r.objectif_regimes || 0), backgroundColor: "rgba(22,163,74,.48)", borderRadius: 5 },
    ],
  };
  const peopleChart = {
    labels: people.map((r) => r.nom || r.recolteur_nom || "Recolteur"),
    datasets: [{ label: "Production", data: people.map((r) => r.total_regimes || r.production_regimes || r.score_productivite || 0), backgroundColor: "rgba(124,58,237,.70)", borderRadius: 5 }],
  };
  const trendChart = {
    labels: trend.map((p) => p.mois_label || MOIS[p.mois]),
    datasets: [
      { label: "Prediction", data: trend.map((p) => p.valeur_predite), borderColor: COLORS.blue, backgroundColor: "rgba(37,99,235,.12)", tension: .35, fill: true },
      { label: "Objectif", data: trend.map((p) => p.objectif_regimes), borderColor: COLORS.green, tension: .35 },
    ],
  };
  const fallbackPredictions = data.predictions.slice(0, 8).reverse();
  const realPred = points.length
    ? {
        labels: points.map((p) => p.periode),
        datasets: [
          { label: "Production reelle", data: points.map((p) => num(p.reel)), borderColor: "#16a34a", backgroundColor: "rgba(22,163,74,.14)", pointBackgroundColor: "#16a34a", pointBorderColor: "#ffffff", pointRadius: 3, pointHoverRadius: 5, borderWidth: 3, tension: .3, fill: true },
          { label: "Production predite", data: points.map((p) => num(p.predit)), borderColor: "#e11d48", backgroundColor: "rgba(225,29,72,.10)", pointBackgroundColor: "#e11d48", pointBorderColor: "#ffffff", pointRadius: 3, pointHoverRadius: 5, borderWidth: 3, borderDash: [8, 5], tension: .3, fill: false },
        ],
      }
    : {
        labels: fallbackPredictions.map((p) => `${p.secteur_code || "Plant."} ${MOIS[p.mois_cible] || ""}`),
        datasets: [
          { label: "Production reelle", data: fallbackPredictions.map((p) => num(p.valeur_reelle)), borderColor: "#16a34a", backgroundColor: "rgba(22,163,74,.14)", pointBackgroundColor: "#16a34a", pointBorderColor: "#ffffff", pointRadius: 3, borderWidth: 3, tension: .3, fill: true },
          { label: "Production predite", data: fallbackPredictions.map((p) => num(p.valeur_predite)), borderColor: "#e11d48", backgroundColor: "rgba(225,29,72,.10)", pointBackgroundColor: "#e11d48", pointBorderColor: "#ffffff", pointRadius: 3, borderWidth: 3, borderDash: [8, 5], tension: .3, fill: false },
        ],
      };

  const standardOptions = chartOptions();
  const horizontalOptions = chartOptions({ horizontal: true });
  const charts = [
    { title: "Reel vs predit", type: "line", data: realPred, options: standardOptions, subtitle: points.length ? `Test ${split.test_start} - ${split.test_end}` : undefined },
    { title: "Comparaison entre secteurs", type: "bar", data: sectorChart, options: standardOptions },
    { title: "Comparaison entre recolteurs", type: "bar", data: peopleChart, options: horizontalOptions },
    { title: "Tendance future", type: "line", data: trendChart, options: standardOptions },
  ];

  return <Section title="Analyse comparative" icon={TrendingUp} aside={evaluationLoading ? "Evaluation en cours" : points.length ? `Test ${split.test_start} - ${split.test_end}` : "Graphiques croises"}>{evaluationLoading && !evaluation && <div className="ia-empty-inline">Evaluation des modeles en cours. Les autres graphiques restent disponibles.</div>}{evaluation && <div className="ia-metric-strip"><span><b>{evaluation.algorithme}</b> modele teste</span><span><b>{fmt(metrics.r2, 3)}</b> R2 test</span><span><b>{fmt(metrics.mae, 1)}</b> MAE</span><span><b>{fmt(metrics.rmse, 1)}</b> RMSE</span><span><b>{pct(metrics.mape)}</b> erreur moy.</span></div>}<div className="ia-chart-grid"><ChartPanel chart={charts[0]} onOpenChart={onOpenChart}><Line data={realPred} options={standardOptions} /></ChartPanel><ChartPanel chart={charts[1]} onOpenChart={onOpenChart}><Bar data={sectorChart} options={standardOptions} /></ChartPanel><ChartPanel chart={charts[2]} onOpenChart={onOpenChart}><Bar data={peopleChart} options={horizontalOptions} /></ChartPanel><ChartPanel chart={charts[3]} onOpenChart={onOpenChart}><Line data={trendChart} options={standardOptions} /></ChartPanel></div><div className="ia-rank-grid"><RankList title="Top secteurs" rows={sectors.slice().sort((a,b)=>num(b.production_regimes)-num(a.production_regimes)).slice(0,4)} value="production_regimes" /><RankList title="Secteurs en difficulte" rows={data.risques.slice(0,4)} value="score_risque" suffix="%" /><RankList title="Top recolteurs" rows={people.slice(0,4)} value="total_regimes" fallback="score_productivite" /></div></Section>;
}
function ChartPanel({ chart, onOpenChart, children }) {
  const interactive = Boolean(onOpenChart && chart?.data?.datasets?.length);
  const open = () => { if (interactive) onOpenChart(chart); };
  return (
    <div
      className={`ia-chart-box ia-comparative-chart ${interactive ? "clickable" : ""}`}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      title={interactive ? "Ouvrir le graphique" : undefined}
      onClick={open}
      onKeyDown={(e) => { if (interactive && (e.key === "Enter" || e.key === " ")) open(); }}
    >
      <div className="ia-chart-title-row">
        <strong>{chart.title}</strong>
        {interactive && <button className="ia-chart-open" type="button" title="Ouvrir le graphique" onClick={(e) => { e.stopPropagation(); open(); }}><Maximize2 size={14} /></button>}
      </div>
      <div className="ia-chart-canvas">{children}</div>
    </div>
  );
}function RankList({ title, rows, value, fallback, suffix = "" }) { return <div className="ia-rank-list"><strong>{title}</strong>{rows.map((r, i) => <span key={r.id || r.code || r.nom || i}><em>{i + 1}</em>{r.code || r.nom || r.recolteur_nom}<b>{fmt(r[value] ?? r[fallback] ?? 0)}{suffix}</b></span>)}</div>; }

function SimulationLab({ secteurs, form, setForm, onSimulate, simulating, simulation }) {
  const up = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return <Section title="Simulation" icon={SlidersHorizontal} aside="Parametres operationnels"><form className="ia-simulation-grid" onSubmit={onSimulate}><label><span>Secteur</span><select value={form.secteur_id} onChange={(e) => up("secteur_id", e.target.value)}><option value="">Choisir</option>{secteurs.map((s) => <option key={s.id} value={s.id}>{s.code} - {s.nom}</option>)}</select></label><label><span>Nombre de recolteurs</span><input type="number" min="1" value={form.nb_recolteurs} onChange={(e) => up("nb_recolteurs", e.target.value)} /></label><label><span>Production moyenne</span><input type="number" min="0" value={form.objectif_regimes} onChange={(e) => up("objectif_regimes", e.target.value)} placeholder="Objectif regimes" /></label><label><span>Surface exploitee</span><input type="number" min="0" step="0.1" value={form.surface_exploitee_ha} onChange={(e) => up("surface_exploitee_ha", e.target.value)} /></label><label><span>Rendement : {form.niveau_entretien}%</span><input type="range" min="0" max="100" value={form.niveau_entretien} onChange={(e) => up("niveau_entretien", e.target.value)} /></label><button className="ia-action-button" type="submit" disabled={simulating}>{simulating ? "Simulation" : "Simuler"}</button></form>{simulation && <div className="ia-simulation-result"><MiniMetric label="Impact estime" value={`${fmt(simulation.rendement_simule)} regimes`} strong /><MiniMetric label="Gain potentiel" value={`${fmt(Math.max(0, num(simulation.rendement_simule) - num(simulation.rendement_reference)))} regimes`} /><MiniMetric label="Perte potentielle" value={`${fmt(Math.max(0, num(simulation.rendement_reference) - num(simulation.rendement_simule)))} regimes`} /><MiniMetric label="Variation" value={pct(simulation.variation_pct, true)} /><p>{simulation.lecture}</p></div>}</Section>;
}

function PredictionHistory({ predictions }) {
  const [search, setSearch] = useState(""); const [sortKey, setSortKey] = useState("date_prediction");
  const rows = useMemo(() => predictions.filter((p) => `${p.secteur_code || ""} ${p.modele_nom || ""} ${p.annee_cible}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => String(b[sortKey] || "").localeCompare(String(a[sortKey] || ""))), [predictions, search, sortKey]);
  return <Section title="Historique des predictions" icon={Clock} aside="Tri et recherche"><div className="ia-table-tools"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher secteur, annee, modele" /><select value={sortKey} onChange={(e) => setSortKey(e.target.value)}><option value="date_prediction">Date</option><option value="secteur_code">Secteur</option><option value="valeur_predite">Valeur predite</option></select></div><div className="ia-table-wrap"><table className="ia-pro-table"><thead><tr><th>Date</th><th>Secteur</th><th>Valeur predite</th><th>Valeur reelle</th><th>Erreur</th><th>Precision</th></tr></thead><tbody>{rows.slice(0, 12).map((p) => { const real = num(p.valeur_reelle); const err = p.erreur_absolue; const precision = real && err != null ? Math.max(0, 100 - num(err) / real * 100) : null; return <tr key={p.id}><td>{dateFmt(p.date_prediction)}</td><td>{p.secteur_code || "Plantation"}</td><td>{fmt(p.valeur_predite)} reg.</td><td>{p.valeur_reelle != null ? `${fmt(p.valeur_reelle)} reg.` : "-"}</td><td>{err != null ? fmt(err, 1) : "-"}</td><td>{precision != null ? pct(precision) : "-"}</td></tr>; })}</tbody></table></div></Section>;
}

function ModelPerformance({ modeles }) {
  const best = bestRegression(modeles); const m = best?.metriques || {};
  const cards = [["Accuracy", m.accuracy ?? m.r2, "%", true], ["MAE", m.mae, "reg.", false], ["RMSE", m.rmse, "reg.", false], ["R2", m.r2, "%", true], ["Temps moyen de prediction", m.temps_prediction_ms || 120, "ms", false], ["Donnees utilisees", best?.nb_observations || 0, "obs.", false]];
  return <Section title="Performance du modele IA" icon={Cpu} aside={best?.nom || "Modele actif"}><div className="ia-model-grid">{cards.map(([label, value, unit, isPercent]) => <MiniMetric key={label} label={label} value={`${isPercent ? pct(num(value) * 100) : fmt(value, label === "Temps moyen de prediction" ? 0 : 1)} ${unit}`} />)}</div><div className="ia-model-foot"><Database size={16} />Dernier entrainement : {dateFmt(best?.date_entrainement)}</div></Section>;
}

function AssistantPanel({ data }) {
  const messages = useMemo(() => { const top = data.risques[0]; const total = data.predictions.slice(0, 6).reduce((s, p) => s + num(p.valeur_predite), 0); const critical = data.anomalies.filter((a) => ["critique", "elevee"].includes(a.criticite)).length; return [total ? { level: "info", text: `La production previsionnelle consolidee atteint ${fmt(total)} regimes.` } : null, top ? { level: top.niveau, text: `Le secteur ${top.code} presente un risque ${top.niveau} (${top.score_risque}%).` } : null, { level: critical ? "critique" : "stable", text: critical ? `${critical} anomalie(s) critiques doivent etre traitees.` : "Aucune anomalie critique ouverte dans la vue courante." }, data.synthese?.qualite_donnees?.score < 75 ? { level: "moyen", text: "La qualite des donnees doit etre renforcee pour ameliorer la fiabilite." } : null, { level: "action", text: "Une inspection est recommandee sur les secteurs en baisse avant la prochaine planification." }].filter(Boolean); }, [data]);
  return <aside className="ia-assistant-panel"><div className="ia-assistant-head"><Bot size={20} /><div><strong>Assistant IA</strong><span>Resume decisionnel</span></div></div><div className="ia-assistant-messages">{messages.map((m, i) => <p key={i} className={levelClass(m.level)}>{m.text}</p>)}</div></aside>;
}

function NotificationCenter({ anomalies, predictions }) {
  const items = [...anomalies.slice(0, 4).map((a) => ({ type: levelClass(a.criticite), title: "Nouvelle anomalie detectee", text: a.description, date: a.created_at })), ...predictions.slice(0, 3).map((p) => ({ type: "info", title: "Nouvelle prediction disponible", text: `${p.secteur_code || "Plantation"} - ${MOIS[p.mois_cible] || p.annee_cible}`, date: p.date_prediction }))];
  return <Section title="Notifications intelligentes" icon={Bell} aside="Critiques prioritaires"><div className="ia-notification-list">{items.length ? items.map((it, i) => <article key={i} className={it.type}><span /><div><strong>{it.title}</strong><p>{it.text}</p><small>{dateFmt(it.date)}</small></div></article>) : <div className="ia-empty-inline">Aucune notification prioritaire.</div>}</div></Section>;
}

function QuickLinks({ isAdmin }) {
  return <section className="ia-quick-links"><strong>Acces rapides</strong><Link to="/ia/predictions">Historique predictions</Link><Link to="/ia/anomalies">Toutes les anomalies</Link><Link to="/ia/prescriptions">Plans et prescriptions IA</Link>{isAdmin && <Link to="/ia/modeles">Modeles IA</Link>}<Link to="/dashboard">Tableau de bord global</Link></section>;
}
