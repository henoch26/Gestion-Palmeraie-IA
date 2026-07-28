/**
 * ListeAnomalies.jsx — Liste des anomalies détectées avec filtres, criticité
 * colorée et boutons Valider / Rejeter pour l'administrateur.
 */
import { useEffect, useState, useCallback } from "react";
import { listAnomalies, detecterAnomalies, validerAnomalie, rejeterAnomalie } from "../../services/iaService.js";
import { useToast } from "../../context/ToastContext.jsx";
import { useAuth } from "../../context/AuthContext.jsx";

const CRITICITE_COLOR = {
  faible:   { bg: "#dcfce7", text: "#166534" },
  moyenne:  { bg: "#fef9c3", text: "#854d0e" },
  elevee:   { bg: "#fee2e2", text: "#991b1b" },
  critique: { bg: "#ede9fe", text: "#5b21b6" },
};
const STATUT_COLOR = {
  nouvelle: { bg: "#fef3c7", text: "#92400e" },
  validee:  { bg: "#d1fae5", text: "#065f46" },
  rejetee:  { bg: "#fee2e2", text: "#991b1b" },
};

const TYPE_LABELS = {
  recolte:   "Anomalie récolte",
  rendement: "Anomalie rendement",
  recolteur: "Anomalie récolteur",
  poids:     "Anomalie poids",
};
const METHODE_LABELS = {
  regles_metier:       "Seuils métier",
  isolation_forest:    "Analyse avancée",
  decision_tree:       "Analyse supervisee",
  logistic_regression: "Analyse statistique",
  residu_prediction:   "Résidu du modèle",
};

const URGENCE_LABEL = {
  faible:   { label: "À surveiller",  color: "#16a34a" },
  moyenne:  { label: "Important",     color: "#d97706" },
  elevee:   { label: "Urgent",        color: "#dc2626" },
  critique: { label: "Très urgent",   color: "#7c3aed" },
};

const RECOMMANDATIONS = {
  recolte:   "Vérifiez la fiche de récolte du secteur concerné et contactez l'encadreur technique pour un contrôle terrain.",
  rendement: "Comparez avec les récoltes des mois précédents. Un rendement anormalement bas peut indiquer un problème phytosanitaire ou climatique.",
  recolteur: "Discutez avec le récolteur concerné : la variation peut s'expliquer par une absence, un matériel défaillant ou un problème de pesée.",
  poids:     "Vérifiez le pesage et la qualité des régimes. Un poids par régime anormal peut indiquer une erreur de saisie ou des régimes non conformes.",
};

export default function ListeAnomalies() {
  const { pushToast } = useToast();
  const { isAdmin } = useAuth();
  const [anomalies, setAnomalies] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [filters, setFilters]     = useState({ statut: "", criticite: "", type_anomalie: "" });
  const [page, setPage] = useState(1);
  const [pageMeta, setPageMeta] = useState({ count: 0, next: null, previous: null });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page };
      if (filters.statut)       params.statut      = filters.statut;
      if (filters.criticite)    params.criticite    = filters.criticite;
      if (filters.type_anomalie) params.type_anomalie = filters.type_anomalie;
      const data = await listAnomalies(params);
      if (Array.isArray(data)) {
        setAnomalies(data);
        setPageMeta({ count: data.length, next: null, previous: null });
      } else {
        setAnomalies(data.results || []);
        setPageMeta({ count: data.count ?? 0, next: data.next, previous: data.previous });
      }
    } catch {
      pushToast({ type: "error", title: "Erreur", message: "Impossible de charger les anomalies." });
    } finally { setLoading(false); }
  }, [pushToast, filters, page]);

  useEffect(() => { load(); }, [load]);

  const updateFilter = (key, value) => {
    setFilters(f => ({ ...f, [key]: value }));
    setPage(1);
  };

  const handleDetect = async (methode = "regles_metier") => {
    setDetecting(true);
    try {
      const res = await detecterAnomalies({ methode });
      pushToast({ type: "info", title: "Détection", message: `${res.total} anomalie(s) créée(s).` });
      load();
    } catch (e) {
      pushToast({ type: "error", title: "Erreur", message: e?.message || "Détection échouée." });
    } finally { setDetecting(false); }
  };

  const handleValider = async (id) => {
    try {
      await validerAnomalie(id);
      pushToast({ type: "success", title: "Validée", message: "Anomalie validée." });
      load();
    } catch { pushToast({ type: "error", title: "Erreur", message: "Échec de la validation." }); }
  };

  const handleRejeter = async (id) => {
    try {
      await rejeterAnomalie(id);
      pushToast({ type: "warning", title: "Rejetée", message: "Anomalie rejetée." });
      load();
    } catch { pushToast({ type: "error", title: "Erreur", message: "Échec du rejet." }); }
  };

  const nouvelles  = anomalies.filter(a => a.statut === "nouvelle").length;
  const critiques  = anomalies.filter(a => a.criticite === "critique").length;
  const elevees    = anomalies.filter(a => a.criticite === "elevee").length;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Anomalies détectées</h1>
          <p className="page-subtitle">
            {nouvelles} nouvelle(s) · {critiques} critique(s) · {elevees} élevée(s) (sur cette page)
            {pageMeta.count ? ` · ${pageMeta.count} anomalie(s) au total` : ""}
          </p>
        </div>
        {isAdmin && (
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => handleDetect("isolation_forest")} disabled={detecting}
              title="Détection automatique avancée">
              Détection avancée
            </button>
            <button className="btn btn-secondary" onClick={() => handleDetect("residu_prediction")} disabled={detecting}
              title="Compare la production réelle à ce que le modèle de prédiction attendait">
              Résidu du modèle
            </button>
            <button className="btn btn-primary" onClick={() => handleDetect("regles_metier")} disabled={detecting}>
              {detecting ? "Analyse en cours…" : "Analyser les données"}
            </button>
          </div>
        )}
      </div>

      {/* Filtres */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <select className="form-control" style={{ width: "auto" }} value={filters.statut}
          onChange={e => updateFilter("statut", e.target.value)}>
          <option value="">Tous les statuts</option>
          <option value="nouvelle">Nouvelle</option>
          <option value="validee">Validée</option>
          <option value="rejetee">Rejetée</option>
        </select>
        <select className="form-control" style={{ width: "auto" }} value={filters.criticite}
          onChange={e => updateFilter("criticite", e.target.value)}>
          <option value="">Toutes criticités</option>
          <option value="faible">Faible</option>
          <option value="moyenne">Moyenne</option>
          <option value="elevee">Élevée</option>
          <option value="critique">Critique</option>
        </select>
        <select className="form-control" style={{ width: "auto" }} value={filters.type_anomalie}
          onChange={e => updateFilter("type_anomalie", e.target.value)}>
          <option value="">Tous les types</option>
          <option value="recolte">Récolte</option>
          <option value="rendement">Rendement</option>
          <option value="recolteur">Récolteur</option>
          <option value="poids">Poids</option>
        </select>
      </div>

      {loading ? (
        <div className="page-loading">Chargement…</div>
      ) : anomalies.length === 0 ? (
        <div className="empty-state">
          Aucune anomalie trouvée. Lancez une détection pour analyser les données.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {anomalies.map(a => (
            <AnomalieCard
              key={a.id}
              anomalie={a}
              isAdmin={isAdmin}
              onValider={handleValider}
              onRejeter={handleRejeter}
            />
          ))}
        </div>
      )}

      {!loading && anomalies.length > 0 && (pageMeta.next || pageMeta.previous) && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
          <button className="btn btn-secondary" disabled={!pageMeta.previous}
            onClick={() => setPage(p => Math.max(1, p - 1))}>
            Precedent
          </button>
          <span style={{ fontSize: 13, color: "#6b7280" }}>
            Page {page}{pageMeta.count ? ` — ${pageMeta.count} anomalie(s) au total` : ""}
          </span>
          <button className="btn btn-secondary" disabled={!pageMeta.next}
            onClick={() => setPage(p => p + 1)}>
            Suivant
          </button>
        </div>
      )}
    </div>
  );
}

function AnomalieCard({ anomalie: a, isAdmin, onValider, onRejeter }) {
  const crit    = CRITICITE_COLOR[a.criticite] || { bg: "#f3f4f6", text: "#374151" };
  const stat    = STATUT_COLOR[a.statut]       || { bg: "#f3f4f6", text: "#374151" };
  const urgence = URGENCE_LABEL[a.criticite]   || { label: a.criticite, color: "#374151" };
  const f       = v => v != null ? Number(v).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) : "—";
  const conseil = RECOMMANDATIONS[a.type_anomalie];

  return (
    <div style={{
      background: "var(--white)",
      border: `2px solid ${crit.text}33`,
      borderLeft: `4px solid ${crit.text}`,
      borderRadius: 8,
      padding: 16,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1 }}>
          {/* En-tête : type + urgence + statut */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>
              {TYPE_LABELS[a.type_anomalie] || a.type_display}
            </span>
            <Badge label={urgence.label} bg={crit.bg} text={urgence.color} />
            <Badge label={a.statut_display || a.statut} bg={stat.bg} text={stat.text} />
            {/* Méthode : libellé technique visible admins seulement */}
            {isAdmin && (
              <span style={{ fontSize: 11, color: "#6b7280" }}>
                {METHODE_LABELS[a.methode_detection] || a.methode_detection}
              </span>
            )}
          </div>

          {/* Description */}
          <p style={{ margin: "0 0 8px", fontSize: 13 }}>{a.description}</p>

          {/* Chiffres clés */}
          <div style={{ display: "flex", gap: 20, fontSize: 12, color: "#6b7280", flexWrap: "wrap" }}>
            <span>Valeur observée : <strong>{f(a.valeur_observee)}</strong></span>
            <span>Valeur normale : <strong>{f(a.valeur_reference)}</strong></span>
            <span>Écart : <strong style={{ color: crit.text }}>{f(a.ecart_pct)}%</strong></span>
            {a.secteur_code  && <span>Secteur : <strong>{a.secteur_code}</strong></span>}
            {a.recolteur_nom && <span>Récolteur : <strong>{a.recolteur_nom}</strong></span>}
          </div>

          {/* Recommandation — visible aux non-admins pour guider l'action */}
          {conseil && !isAdmin && a.statut === "nouvelle" && (
            <div style={{
              marginTop: 10,
              padding: "8px 12px",
              background: `${urgence.color}11`,
              border: `1px solid ${urgence.color}33`,
              borderRadius: 6,
              fontSize: 12,
              color: "var(--text)",
            }}>
              <strong style={{ color: urgence.color }}>Que faire ?</strong>{" "}{conseil}
            </div>
          )}
        </div>

        {/* Boutons action admin */}
        {isAdmin && a.statut === "nouvelle" && (
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button className="btn btn-success btn-sm" onClick={() => onValider(a.id)}>Valider</button>
            <button className="btn btn-danger btn-sm"  onClick={() => onRejeter(a.id)}>Rejeter</button>
          </div>
        )}
      </div>
      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 8 }}>
        Détecté le {new Date(a.created_at).toLocaleString("fr-FR")}
        {a.validated_by_username && ` · Traité par ${a.validated_by_username}`}
      </div>
    </div>
  );
}

function Badge({ label, bg, text }) {
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600,
      background: bg, color: text,
    }}>
      {label}
    </span>
  );
}

