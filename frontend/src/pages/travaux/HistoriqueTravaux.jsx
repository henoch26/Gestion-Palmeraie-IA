/**
 * HistoriqueTravaux.jsx — Page de gestion des fiches de travaux.
 *
 * La page est organisee en 2 onglets (?tab=) :
 *   saisie     — Formulaire de creation d'une fiche travaux avec consommables
 *                et repartition des taches entre agents (superviseur)
 *   historique — Tableau des fiches avec filtres ; validation/rejet (admin)
 *
 * Structure d'une fiche travaux :
 *   FicheTravaux + N ConsommableTravaux + N RepartitionTache
 *   Le cout total est recalcule cote serveur apres chaque modification
 *   (voir recalculer_cout() dans backend/travaux/models.py).
 *
 * Acces :
 *   - superviseur : cree et soumet ses propres fiches
 *   - admin : valide, rejette ou modifie toutes les fiches
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

const NATURE_TRAVAUX_OPTIONS = [
  { value: "desherbage", label: "Désherbage" },
  { value: "traitement_phytosanitaire", label: "Traitement phytosanitaire" },
  { value: "fertilisation", label: "Fertilisation" },
  { value: "taille_ablation", label: "Taille / Ablation" },
  { value: "recolte", label: "Récolte" },
  { value: "pepiniere", label: "Pépinière" },
  { value: "plantation", label: "Plantation" },
  { value: "entretien_voie", label: "Entretien voie d'accès" },
  { value: "entretien_infrastructure", label: "Entretien infrastructure" },
  { value: "recensement", label: "Recensement" },
  { value: "autre", label: "Autre" },
];


import { useToast } from "../../context/ToastContext.jsx";
import DataTable from "../../components/DataTable.jsx";
import LogoLoader from "../../components/LogoLoader.jsx";
import FicheTravauxDialog from "../../components/FicheTravauxDialog.jsx";
import SuccessDialog from "../../components/SuccessDialog.jsx";
import { ficheTravauxInitial } from "../../data/ficheTravauxData.js";
import { listSecteurs } from "../../services/secteurService.js";
import { listSuperviseurs } from "../../services/superviseurService.js";
import { createFicheTravaux, deleteFicheTravaux, listFichesTravaux, patchFicheTravaux } from "../../services/travauxService.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { getToken } from "../../services/authService.js";
import { sanitizeDecimal, sanitizeInt } from "../../utils/number.js";
import { saveTravauxOffline } from "../../utils/offline.js";

const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";

const uid = (prefix = "ID") =>
  `${prefix}-${crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`}`;

export default function HistoriqueTravaux() {
  const { pushToast } = useToast();
  const { isAdmin, isSuperviseur, hasPermission, user } = useAuth();
  const canSaisir = !isAdmin && hasPermission("gerer_travaux");
  const superviseurNomCourant = user
    ? (user.last_name?.trim() || user.username || "")
    : "";

  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") || "saisie"; // saisie | historique
  const setTab = (key) => setSearchParams({ tab: key }, { replace: true });

  const [fiche, setFiche] = useState(ficheTravauxInitial);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  const [secteurs, setSecteurs] = useState([]);
  const [superviseurs, setSuperviseurs] = useState([]);
  const [secteurToAdd, setSecteurToAdd] = useState("");

  const [editingId, setEditingId] = useState(null);

  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [selectedFiche, setSelectedFiche] = useState(null);
  const [success, setSuccess] = useState({ open: false, message: "" });
  const [confirmRejet, setConfirmRejet] = useState({ open: false, ficheId: null, motif: "" });
  const [ficheToDelete, setFicheToDelete] = useState(null);

  const loadSecteurs = async () => {
    try {
      const data = await listSecteurs();
      setSecteurs(data || []);
    } catch (err) {
      pushToast({ type: "error", title: "Travaux", message: err.message });
    }
  };

  const loadSuperviseurs = async () => {
    try {
      const data = await listSuperviseurs();
      setSuperviseurs(data || []);
    } catch (err) {
      pushToast({ type: "error", title: "Travaux", message: err.message });
    }
  };

  const loadHistory = async () => {
    try {
      setLoadingHistory(true);
      const data = await listFichesTravaux();
      setHistory(data || []);
      setHistoryLoaded(true);
    } catch (err) {
      pushToast({ type: "error", title: "Travaux", message: err.message });
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (isAdmin && tab === "saisie") setTab("historique");
  }, [isAdmin, tab]);

  useEffect(() => {
    loadSecteurs();
    loadSuperviseurs();
    loadHistory();
  }, []);

  // Pré-remplir le superviseur dès que l'auth est disponible (user peut arriver après le montage)
  useEffect(() => {
    if (!isAdmin && superviseurNomCourant && !editingId) {
      setFiche((prev) => ({ ...prev, superviseurTravaux: superviseurNomCourant }));
    }
  }, [superviseurNomCourant, isAdmin]);

  const handleReset = () => {
    setFiche({
      ...ficheTravauxInitial,
      superviseurTravaux: !isAdmin && superviseurNomCourant ? superviseurNomCourant : ficheTravauxInitial.superviseurTravaux,
    });
    setSecteurToAdd("");
    setFieldErrors({});
    setEditingId(null);
    setTab("saisie");
  };

  const handleLoadForEdit = (row) => {
    const parts = (row.periode_travaux || "").split(" - ");
    const debut = parts[0]?.trim() || "";
    const fin   = parts[1]?.trim() || "";
    setFiche({
      superviseurTravaux:   row.superviseur_travaux || "",
      natureTravaux:        row.nature_travaux || "",
      superficieCouverteHa: row.superficie_couverte_ha != null ? String(row.superficie_couverte_ha) : "",
      secteursCouverts:     (row.secteurs_couverts || []).map(Number),
      periodeTravauxDebut:  debut,
      periodeTravauxFin:    fin,
      nbPersonnes:          row.nb_personnes != null ? String(row.nb_personnes) : "",
      salaireTotal:         row.salaire_total != null ? String(row.salaire_total) : "",
      consommables: (row.consommables || []).map((c) => ({
        id: uid("C"),
        designation:  c.designation || "",
        quantite:     c.quantite != null ? String(c.quantite) : "",
        unite:        c.unite || "",
        prix_unitaire: c.prix_unitaire != null ? String(c.prix_unitaire) : "",
      })),
      repartitions: (row.repartitions || []).map((r) => ({
        id: uid("R"),
        nom_prenom:   r.nom_prenom || "",
        nature_taches: r.nature_taches || "",
        quantite:     r.quantite != null ? String(r.quantite) : "",
        prix_unitaire: r.prix_unitaire != null ? String(r.prix_unitaire) : "",
      })),
      observations: row.observations || "",
    });
    setEditingId(row.id);
    setSecteurToAdd("");
    setFieldErrors({});
    setTab("saisie");
  };

  const selectedSecteurs = useMemo(() => {
    const selected = new Set((fiche.secteursCouverts || []).map((x) => String(x)));
    return (secteurs || []).filter((s) => selected.has(String(s.id)));
  }, [fiche.secteursCouverts, secteurs]);

  const clearFieldError = (key) => {
    setFieldErrors((prev) => {
      if (!prev || !prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const validateFiche = () => {
    const errors = {};

    if (!(fiche.superviseurTravaux || "").trim()) {
      errors.superviseurTravaux = "Superviseur requis";
    }
    if (!(fiche.natureTravaux || "").trim()) {
      errors.natureTravaux = "Nature des travaux requise";
    }
    if (!fiche.periodeTravauxDebut) {
      errors.periodeTravauxDebut = "Date debut requise";
    }
    if (!fiche.periodeTravauxFin) {
      errors.periodeTravauxFin = "Date fin requise";
    }
    if (
      fiche.periodeTravauxDebut &&
      fiche.periodeTravauxFin &&
      fiche.periodeTravauxDebut > fiche.periodeTravauxFin
    ) {
      errors.periodeTravauxFin = "La date fin doit etre >= debut";
    }
    if (!Array.isArray(fiche.secteursCouverts) || fiche.secteursCouverts.length === 0) {
      errors.secteursCouverts = "Selectionne au moins un secteur";
    }

    return errors;
  };

  const addConsommable = () => {
    setFiche((prev) => ({
      ...prev,
      consommables: [
        ...prev.consommables,
        { id: uid("C"), designation: "", quantite: "", unite: "", prix_unitaire: "" },
      ],
    }));
  };

  const removeConsommable = (id) => {
    setFiche((prev) => ({
      ...prev,
      consommables: prev.consommables.filter((c) => c.id !== id),
    }));
  };

  const updateConsommable = (id, field, value) => {
    const nextValue =
      field === "quantite" || field === "prix_unitaire"
        ? sanitizeDecimal(value)
        : value;
    setFiche((prev) => ({
      ...prev,
      consommables: prev.consommables.map((c) =>
        c.id === id ? { ...c, [field]: nextValue } : c
      ),
    }));
  };

  const addRepartition = () => {
    setFiche((prev) => ({
      ...prev,
      repartitions: [
        ...prev.repartitions,
        { id: uid("R"), nom_prenom: "", nature_taches: "", quantite: "", prix_unitaire: "" },
      ],
    }));
  };

  const removeRepartition = (id) => {
    setFiche((prev) => ({
      ...prev,
      repartitions: prev.repartitions.filter((r) => r.id !== id),
    }));
  };

  const updateRepartition = (id, field, value) => {
    const nextValue =
      field === "quantite" || field === "prix_unitaire"
        ? sanitizeDecimal(value)
        : value;
    setFiche((prev) => ({
      ...prev,
      repartitions: prev.repartitions.map((r) =>
        r.id === id ? { ...r, [field]: nextValue } : r
      ),
    }));
  };

  const totalConsommables = useMemo(() => {
    return (fiche.consommables || []).reduce((sum, c) => {
      const q = Number(c.quantite) || 0;
      const p = Number(c.prix_unitaire) || 0;
      return sum + q * p;
    }, 0);
  }, [fiche.consommables]);

  const totalRepartitions = useMemo(() => {
    return (fiche.repartitions || []).reduce((sum, r) => {
      const q = Number(r.quantite) || 0;
      const p = Number(r.prix_unitaire) || 0;
      return sum + q * p;
    }, 0);
  }, [fiche.repartitions]);

  const totalCout = totalConsommables + totalRepartitions;

  const buildPayload = () => {
    const superficie = fiche.superficieCouverteHa.trim();
    const nb = fiche.nbPersonnes.trim();
    const debut = (fiche.periodeTravauxDebut || "").trim();
    const fin = (fiche.periodeTravauxFin || "").trim();
    const periode_travaux = debut && fin ? `${debut} - ${fin}` : debut || fin || "";

    const consommables = (fiche.consommables || [])
      .filter((c) => (c.designation || "").trim())
      .map((c) => ({
        designation: c.designation,
        quantite: Number(c.quantite) || 0,
        unite: c.unite || "",
        prix_unitaire: Number(c.prix_unitaire) || 0,
      }));

    const repartitions = (fiche.repartitions || [])
      .filter((r) => (r.nom_prenom || "").trim())
      .map((r) => ({
        nom_prenom: r.nom_prenom,
        nature_taches: r.nature_taches || "",
        quantite: Number(r.quantite) || 0,
        prix_unitaire: Number(r.prix_unitaire) || 0,
      }));

    const salaire = (fiche.salaireTotal || "").toString().trim();
    return {
      superviseur_travaux: fiche.superviseurTravaux,
      nature_travaux: fiche.natureTravaux,
      superficie_couverte_ha: superficie ? Number(superficie) : null,
      secteurs_couverts: fiche.secteursCouverts,
      periode_travaux,
      nb_personnes: nb ? Number(nb) : null,
      salaire_total: salaire ? Number(salaire) : null,
      consommables,
      repartitions,
      observations: fiche.observations || "",
    };
  };

  const handleSave = async () => {
    const errors = validateFiche();
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      setTab("saisie");
      pushToast({
        type: "warning",
        title: "Travaux",
        message: "Complete les champs obligatoires",
      });
      return;
    }

    try {
      setSaving(true);
      setFieldErrors({});
      const payload = buildPayload();

      if (!navigator.onLine) {
        await saveTravauxOffline(payload, getToken());
        setSuccess({ open: true, message: "Fiche sauvegardée hors ligne — sera synchronisée à la reconnexion." });
        return;
      }

      if (editingId) {
        await patchFicheTravaux(editingId, payload);
        setSuccess({ open: true, message: "Fiche travaux modifiée avec succès" });
      } else {
        await createFicheTravaux(payload);
        setSuccess({ open: true, message: "Fiche travaux enregistrée avec succès" });
      }
      loadHistory();
    } catch (err) {
      pushToast({ type: "error", title: "Travaux", message: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFiche = async () => {
    try {
      await deleteFicheTravaux(ficheToDelete.id);
      setHistory((prev) => prev.filter((f) => f.id !== ficheToDelete.id));
      pushToast({ type: "success", title: "Travaux", message: "Fiche supprimee." });
    } catch (err) {
      pushToast({ type: "error", title: "Travaux", message: err.message });
    } finally {
      setFicheToDelete(null);
    }
  };

  const handleStatutChange = async (ficheId, newStatut, motif = "") => {
    try {
      const payload = { statut: newStatut };
      if (motif && motif.trim()) payload.motif = motif.trim();
      await patchFicheTravaux(ficheId, payload);
      await loadHistory();
      const labels = { valide: "validée", brouillon: "rejetée" };
      pushToast({ type: "success", title: "Travaux", message: `Fiche ${labels[newStatut] || newStatut}` });
    } catch (err) {
      pushToast({ type: "error", title: "Statut", message: err.message });
    }
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
      const res = await fetch(`${API_BASE}/travaux/export/`, {
        headers: token ? { Authorization: `Token ${token}` } : {},
      });
      if (!res.ok) throw new Error("Export impossible");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `travaux_export_${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      pushToast({ type: "error", title: "Erreur export", message: err.message });
    }
  };

  const historyRows = useMemo(() => {
    return (history || []).map((f) => ({
      ...f,
      secteurs: (f.secteurs_couverts_codes || []).join(", "),
    }));
  }, [history]);

  const localPendingCount = isSuperviseur
    ? historyRows.filter((r) => r.statut !== "valide").length
    : 0;

  const historyColumns = [
    { key: "id", label: "ID" },
    { key: "periode_travaux", label: "Periode" },
    {
      key: "nature_travaux",
      label: "Nature",
      render: (row) => row.nature_travaux_display || row.nature_travaux || "-",
    },
    { key: "superviseur_travaux", label: "Superviseur" },
    { key: "nb_personnes", label: "Nb pers." },
    { key: "secteurs", label: "Secteurs" },
    {
      key: "statut",
      label: "Statut",
      render: (row) => {
        const s = row.statut || "brouillon";
        return <span className={`statut-badge statut-${s}`}>{row.statut_display || s}</span>;
      },
    },
    {
      key: "actions",
      label: "Actions",
      render: (row) => {
        const s = row.statut || "brouillon";
        const isCreateur = row.created_by === user?.id;
        const canValidate = isCreateur;
        return (
          <div className="row-actions">
            <button onClick={() => setSelectedFiche(row)}>Voir</button>
            {s === "brouillon" && isCreateur && (
              <>
                <button
                  className="btn-warning btn-sm"
                  onClick={() => handleLoadForEdit(row)}
                >
                  Modifier
                </button>
                <button
                  className="btn-primary btn-sm"
                  onClick={() => handleStatutChange(row.id, "valide")}
                >
                  Valider
                </button>
              </>
            )}
            {s !== "valide" && isCreateur && (
              <button
                className="btn-danger btn-sm"
                onClick={() => setFicheToDelete(row)}
              >
                Supprimer
              </button>
            )}
            {s === "valide" && isAdmin && (
              <button
                className="btn-danger btn-sm"
                onClick={() => handleConfirmRejet(row.id)}
              >
                Rejeter
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="page fiche">
      <header className="fiche-header">
        <h2>
          Fiche de travaux
          {editingId && (
            <span style={{ fontSize: 13, fontWeight: 500, color: "#e65100", marginLeft: 10 }}>
              — Modification en cours
            </span>
          )}
        </h2>
        <div className="row-actions">
          {tab === "historique" ? (
            <>
              <button className="btn-ghost" onClick={handleExport}>Exporter Excel</button>
              <button className="btn-ghost" onClick={loadHistory} disabled={loadingHistory}>
                {loadingHistory ? "Chargement..." : "Rafraichir"}
              </button>
            </>
          ) : (
            <>
              {editingId ? (
                <button className="btn-ghost" onClick={handleReset}>Annuler la modification</button>
              ) : (
                <button className="btn-ghost" onClick={handleReset}>Nouvelle fiche</button>
              )}
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? "Enregistrement..." : editingId ? "Enregistrer les modifications" : "Enregistrer"}
              </button>
            </>
          )}
        </div>
      </header>

      {tab === "saisie" && !canSaisir && (
        <div style={{ padding: "40px 0", textAlign: "center", color: "#888" }}>
          Vous n'avez pas l'autorisation de saisir des travaux. Contactez l'administrateur.
        </div>
      )}

      {tab === "saisie" && canSaisir && (
        <div>
          {/* ── En-tête ── */}
          <section
            className={`fiche-section ${
              fieldErrors.superviseurTravaux || fieldErrors.natureTravaux ||
              fieldErrors.periodeTravauxDebut || fieldErrors.periodeTravauxFin ||
              fieldErrors.secteursCouverts ? "section-error" : ""
            }`}
          >
            <h3>En-tete</h3>
            <div className="fiche-header-grid">
              <label>
                Superviseur des travaux
                {isAdmin ? (
                  <select
                    className={`fiche-input ${fieldErrors.superviseurTravaux ? "input-error" : ""}`}
                    value={fiche.superviseurTravaux}
                    onChange={(e) => {
                      setFiche((p) => ({ ...p, superviseurTravaux: e.target.value }));
                      clearFieldError("superviseurTravaux");
                    }}
                  >
                    <option value="">— Sélectionner un superviseur —</option>
                    {superviseurs.map((s) => (
                      <option key={s.id} value={s.nom}>
                        {s.nom_complet || s.nom || s.code}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="fiche-input"
                    value={fiche.superviseurTravaux}
                    readOnly
                    style={{ background: "#f5f5f5", cursor: "default" }}
                  />
                )}
                {fieldErrors.superviseurTravaux && (
                  <span className="field-error">{fieldErrors.superviseurTravaux}</span>
                )}
              </label>
              <label>
                Nature des travaux
                <select
                  className={`fiche-input ${fieldErrors.natureTravaux ? "input-error" : ""}`}
                  value={fiche.natureTravaux}
                  onChange={(e) => {
                    setFiche((p) => ({ ...p, natureTravaux: e.target.value }));
                    clearFieldError("natureTravaux");
                  }}
                >
                  <option value="">-- Choisir --</option>
                  {NATURE_TRAVAUX_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {fieldErrors.natureTravaux && (
                  <span className="field-error">{fieldErrors.natureTravaux}</span>
                )}
              </label>
              <label>
                Superficie (ha) couverte
                <input
                  type="number"
                  className="fiche-input"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={fiche.superficieCouverteHa}
                  onChange={(e) =>
                    setFiche((p) => ({ ...p, superficieCouverteHa: sanitizeDecimal(e.target.value) }))
                  }
                />
              </label>
              <label>
                Periode des travaux
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <input
                      type="date"
                      className={`fiche-input ${fieldErrors.periodeTravauxDebut ? "input-error" : ""}`}
                      value={fiche.periodeTravauxDebut}
                      onChange={(e) => {
                        setFiche((p) => ({ ...p, periodeTravauxDebut: e.target.value }));
                        clearFieldError("periodeTravauxDebut");
                      }}
                    />
                    {fieldErrors.periodeTravauxDebut && (
                      <div className="field-error">{fieldErrors.periodeTravauxDebut}</div>
                    )}
                  </div>
                  <div>
                    <input
                      type="date"
                      className={`fiche-input ${fieldErrors.periodeTravauxFin ? "input-error" : ""}`}
                      value={fiche.periodeTravauxFin}
                      onChange={(e) => {
                        setFiche((p) => ({ ...p, periodeTravauxFin: e.target.value }));
                        clearFieldError("periodeTravauxFin");
                      }}
                    />
                    {fieldErrors.periodeTravauxFin && (
                      <div className="field-error">{fieldErrors.periodeTravauxFin}</div>
                    )}
                  </div>
                </div>
              </label>
              <label>
                Nombre de personnes impliquees
                <input
                  type="number"
                  className="fiche-input"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  value={fiche.nbPersonnes}
                  onChange={(e) =>
                    setFiche((p) => ({ ...p, nbPersonnes: sanitizeInt(e.target.value) }))
                  }
                />
              </label>
              <label>
                Salaire total des travailleurs (FCFA)
                <input
                  type="number"
                  className="fiche-input"
                  inputMode="decimal"
                  min="0"
                  step="1"
                  value={fiche.salaireTotal}
                  onChange={(e) =>
                    setFiche((p) => ({ ...p, salaireTotal: sanitizeDecimal(e.target.value) }))
                  }
                />
              </label>
              <label>
                Secteurs couverts
                <select
                  className={`fiche-input ${fieldErrors.secteursCouverts ? "input-error" : ""}`}
                  value={secteurToAdd}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setSecteurToAdd(nextId);
                    if (!nextId) return;
                    setFiche((p) => {
                      const prevIds = p.secteursCouverts || [];
                      const toAdd = Number(nextId);
                      if (prevIds.some((x) => Number(x) === toAdd)) return p;
                      return { ...p, secteursCouverts: [...prevIds, toAdd] };
                    });
                    clearFieldError("secteursCouverts");
                    requestAnimationFrame(() => setSecteurToAdd(""));
                  }}
                >
                  <option value="">Ajouter un secteur...</option>
                  {secteurs.map((s) => (
                    <option key={s.id} value={s.id}>{s.code} - {s.nom}</option>
                  ))}
                </select>
                {selectedSecteurs.length > 0 && (
                  <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {selectedSecteurs.map((s) => (
                      <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span className="fiche-chip">{s.code}</span>
                        <button
                          type="button"
                          className="btn-danger btn-mini"
                          onClick={() => {
                            clearFieldError("secteursCouverts");
                            setFiche((p) => ({
                              ...p,
                              secteursCouverts: (p.secteursCouverts || []).filter(
                                (id) => Number(id) !== Number(s.id)
                              ),
                            }));
                          }}
                        >
                          Retirer
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {fieldErrors.secteursCouverts && (
                  <div className="field-error">{fieldErrors.secteursCouverts}</div>
                )}
              </label>
            </div>
          </section>

          {/* ── Observations ── */}
          <section className="fiche-section">
            <h3>Observations</h3>
            <textarea
              className="fiche-input"
              rows={4}
              value={fiche.observations}
              onChange={(e) => setFiche((p) => ({ ...p, observations: e.target.value }))}
            />
          </section>

          {/* ── Consommables ── */}
          <section className="fiche-section">
            <div className="section-row">
              <h3>Consommables necessaires</h3>
              <button className="btn-ghost" onClick={addConsommable}>Ajouter</button>
            </div>
            <div className="fiche-table-wrapper">
              <table className="fiche-table">
                <thead>
                  <tr>
                    <th>Designation</th>
                    <th>Quantite</th>
                    <th>Unite</th>
                    <th>Prix unitaire</th>
                    <th>Prix total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {fiche.consommables.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <input
                          className="fiche-input"
                          value={c.designation}
                          onChange={(e) => updateConsommable(c.id, "designation", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="fiche-input fiche-input-sm"
                          inputMode="decimal"
                          value={c.quantite}
                          onChange={(e) => updateConsommable(c.id, "quantite", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="fiche-input fiche-input-sm"
                          list={`unites-list-${c.id}`}
                          value={c.unite}
                          onChange={(e) => updateConsommable(c.id, "unite", e.target.value)}
                          placeholder="ex: L, kg, m..."
                        />
                        <datalist id={`unites-list-${c.id}`}>
                          <option value="u">u — Unite</option>
                          <option value="m">m — Metre</option>
                          <option value="m²">m² — Metre carre</option>
                          <option value="m³">m³ — Metre cube</option>
                          <option value="L">L — Litre</option>
                          <option value="cL">cL — Centilitre</option>
                          <option value="kg">kg — Kilogramme</option>
                          <option value="g">g — Gramme</option>
                          <option value="t">t — Tonne</option>
                          <option value="sac">Sac</option>
                          <option value="bidon">Bidon</option>
                          <option value="h">h — Heure</option>
                          <option value="j">j — Jour</option>
                        </datalist>
                      </td>
                      <td>
                        <input
                          className="fiche-input fiche-input-sm"
                          inputMode="decimal"
                          value={c.prix_unitaire}
                          onChange={(e) => updateConsommable(c.id, "prix_unitaire", e.target.value)}
                        />
                      </td>
                      <td className="total-cell">
                        {(Number(c.quantite) || 0) * (Number(c.prix_unitaire) || 0)}
                      </td>
                      <td>
                        <button className="btn-danger btn-mini" onClick={() => removeConsommable(c.id)}>
                          Supprimer
                        </button>
                      </td>
                    </tr>
                  ))}
                  {fiche.consommables.length === 0 && (
                    <tr><td colSpan={6}>Aucun consommable</td></tr>
                  )}
                  {fiche.consommables.length > 0 && (
                    <tr>
                      <td colSpan={4}><strong>Total</strong></td>
                      <td className="total-cell"><strong>{totalConsommables}</strong></td>
                      <td></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Repartition des taches ── */}
          <section className="fiche-section">
            <div className="section-row">
              <h3>Repartition des taches executees par chaque personne</h3>
              <button className="btn-ghost" onClick={addRepartition}>Ajouter</button>
            </div>
            <div className="fiche-table-wrapper">
              <table className="fiche-table">
                <thead>
                  <tr>
                    <th>Nom et prenom</th>
                    <th>Nature taches</th>
                    <th>Quantite</th>
                    <th>Prix unitaire</th>
                    <th>Prix total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {fiche.repartitions.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <input
                          className="fiche-input"
                          value={r.nom_prenom}
                          onChange={(e) => updateRepartition(r.id, "nom_prenom", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="fiche-input"
                          value={r.nature_taches}
                          onChange={(e) => updateRepartition(r.id, "nature_taches", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="fiche-input fiche-input-sm"
                          inputMode="decimal"
                          value={r.quantite}
                          onChange={(e) => updateRepartition(r.id, "quantite", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="fiche-input fiche-input-sm"
                          inputMode="decimal"
                          value={r.prix_unitaire}
                          onChange={(e) => updateRepartition(r.id, "prix_unitaire", e.target.value)}
                        />
                      </td>
                      <td className="total-cell">
                        {(Number(r.quantite) || 0) * (Number(r.prix_unitaire) || 0)}
                      </td>
                      <td>
                        <button className="btn-danger btn-mini" onClick={() => removeRepartition(r.id)}>
                          Supprimer
                        </button>
                      </td>
                    </tr>
                  ))}
                  {fiche.repartitions.length === 0 && (
                    <tr><td colSpan={6}>Aucune repartition</td></tr>
                  )}
                  <tr>
                    <td colSpan={4}><strong>Total</strong></td>
                    <td className="total-cell"><strong>{totalRepartitions}</strong></td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p style={{ marginTop: 10 }}>
              <strong>Total consommables :</strong> {totalConsommables.toLocaleString("fr-FR")} FCFA —{" "}
              <strong>Total taches :</strong> {totalRepartitions.toLocaleString("fr-FR")} FCFA —{" "}
              <strong>Total general :</strong> {totalCout.toLocaleString("fr-FR")} FCFA
              {fiche.salaireTotal && Number(fiche.salaireTotal) > 0 && (
                <> — <strong>Salaire travailleurs :</strong>{" "}
                  <span style={{ color: "#1b5e20", fontWeight: 700 }}>
                    {Number(fiche.salaireTotal).toLocaleString("fr-FR")} FCFA
                  </span>
                </>
              )}
            </p>
          </section>
        </div>
      )}

      {tab === "historique" && (
        <section className="fiche-section fiche-analytics">
          {/* Banniere fiches en attente — superviseur uniquement */}
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

          <h3>Historique des fiches</h3>
          {loadingHistory ? (
            <LogoLoader compact size={70} />
          ) : (
            <DataTable columns={historyColumns} rows={historyRows} pageSize={5} />
          )}
        </section>
      )}

      <FicheTravauxDialog
        open={!!selectedFiche}
        fiche={selectedFiche}
        onClose={() => setSelectedFiche(null)}
      />

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

      {/* Confirmation suppression fiche travaux */}
      {ficheToDelete && (
        <div className="dialog-backdrop" onClick={() => setFicheToDelete(null)}>
          <div className="dialog dialog-sm" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ color: "#b71c1c" }}>Supprimer la fiche travaux</h3>
            <p style={{ fontSize: 14, color: "#555", margin: "12px 0 20px" }}>
              Supprimer la fiche <strong>{ficheToDelete.periode_travaux || `#${ficheToDelete.id}`}</strong> ?
              Cette action est irreversible.
            </p>
            <div className="dialog-actions">
              <button className="btn-ghost" onClick={() => setFicheToDelete(null)}>Annuler</button>
              <button className="btn-danger" onClick={handleDeleteFiche}>Supprimer</button>
            </div>
          </div>
        </div>
      )}

      <SuccessDialog
        open={success.open}
        message={success.message}
        actions={!isAdmin ? [{
          label: "Aller valider",
          className: "btn-primary",
          onClick: () => {
            setSuccess({ open: false, message: "" });
            setFiche({ ...ficheTravauxInitial, superviseurTravaux: superviseurNomCourant || "" });
            setSecteurToAdd("");
            setFieldErrors({});
            setEditingId(null);
            setTab("historique");
          },
        }] : []}
        onClose={() => {
          setSuccess({ open: false, message: "" });
          handleReset();
        }}
      />
    </div>
  );
}
