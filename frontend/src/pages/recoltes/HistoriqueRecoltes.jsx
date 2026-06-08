import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ficheRecolteInitial,
  regimeTypes,
  secteurCodes,
} from "../../data/ficheRecolteData.js";
import { useToast } from "../../context/ToastContext.jsx";
import { listSecteurs } from "../../services/secteurService.js";
import { createFiche, getRecoltesAnalytics, listFiches, patchFiche, updateFiche } from "../../services/recolteService.js";
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

const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";

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
  const [historyFilter, setHistoryFilter] = useState("all");

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
      recus: (apiFiche.recus || []).map((r) => ({
        id: `RC-${uid()}`,
        date: r.date || "",
        client: r.client || "",
        peseeKg: r.pesee_kg ?? "",
        nonConformes: r.non_conformes_pct ?? "",
        montant: r.montant ?? "",
      })),
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

  // Total dépenses = nourriture + transport + salaire
  const totalDepenses = useMemo(() => {
    const n = Number(fiche.depenses.nourriture) || 0;
    const t = Number(fiche.depenses.transport) || 0;
    const s = Number(fiche.depenses.salaire) || 0;
    return n + t + s;
  }, [fiche.depenses.nourriture, fiche.depenses.transport, fiche.depenses.salaire]);

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
  }, []);

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

  // Superviseurs adjoints — sélection depuis la liste des agents (capture ID automatique)
  const handleAdjointNomChange = (id, value) => {
    const agent = agentsList.find(
      (a) => (a.nom_complet || `${a.nom} ${a.prenom || ""}`.trim()) === value
    );
    setFiche((prev) => ({
      ...prev,
      superviseursAdjoints: prev.superviseursAdjoints.map((s) =>
        s.id === id ? { ...s, nom: value, agentId: agent?.id || null } : s
      ),
    }));
    clearNestedError("adjoints", id, "nom");
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

  // Depenses
  const handleDepenseChange = (field, value) => {
    setFiche((prev) => ({
      ...prev,
      depenses: { ...prev.depenses, [field]: value },
    }));
  };

  // Recus de vente
  const handleRecuChange = (id, field, value) => {
    setFiche((prev) => ({
      ...prev,
      recus: prev.recus.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
    }));
    clearNestedError("recus", id, field);
  };

  const addRecu = () => {
    setFiche((prev) => ({
      ...prev,
      recus: [
        ...prev.recus,
        { id: `RC-${Date.now()}`, date: "", client: "", peseeKg: "", nonConformes: "", montant: "" },
      ],
    }));
  };

  const removeRecu = (id) => {
    setFiche((prev) => ({
      ...prev,
      recus: prev.recus.filter((r) => r.id !== id),
    }));
    clearIdError("recus", id);
  };

  // Valide + construit le payload conforme a l'API (retourne aussi les erreurs par champ)
  const buildPayload = () => {
    const errors = {};

    if (!fiche.date) errors.date = "Date requise";
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
          secteur: "Secteurs ou recolteurs requis",
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

    // Recus de vente (ignore recus vides; si saisi => date + montant)
    const recus = [];
    const recusErrors = {};

    for (const r of fiche.recus || []) {
      const date = String(r.date || "").trim();
      const client = String(r.client || "").trim();
      const pesee = String(r.peseeKg || "").trim();
      const nonConf = String(r.nonConformes || "").trim();
      const montantRaw = String(r.montant || "").trim();

      const hasAny = !!date || !!client || !!pesee || !!nonConf || !!montantRaw;
      if (!hasAny) continue;

      const montant = Number(montantRaw) || 0;
      if (!date) {
        recusErrors[r.id] = { ...(recusErrors[r.id] || {}), date: "Date requise" };
      }
      if (!(montant > 0)) {
        recusErrors[r.id] = { ...(recusErrors[r.id] || {}), montant: "Montant requis" };
      }

      if (date && montant > 0) {
        recus.push({
          date: date || null,
          client,
          pesee_kg: Number(pesee) || 0,
          non_conformes_pct: Number(nonConf) || 0,
          montant,
        });
      }
    }

    if (Object.keys(recusErrors).length > 0) errors.recus = recusErrors;

    const payload = {
      date: fiche.date,
      superviseur_general: String(fiche.superviseurGeneral || "").trim(),
      bareme_grands: Number(fiche.bareme.grands) || 0,
      bareme_moyens: Number(fiche.bareme.moyens) || 0,
      bareme_petits: Number(fiche.bareme.petits) || 0,
      depense_nourriture: Number(fiche.depenses.nourriture) || 0,
      depense_transport: Number(fiche.depenses.transport) || 0,
      depense_salaire: Number(fiche.depenses.salaire) || 0,
      observations: fiche.observations || "",
      superviseurs_adjoints,
      lignes,
      recus,
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
        await saveRecolteOffline(payload);
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

  const handleStatutChange = async (ficheId, newStatut) => {
    try {
      await patchFiche(ficheId, { statut: newStatut });
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
              }
            : f
        );
        if (!isAdmin) {
          setPendingCount(next.filter((f) => f.statut !== "valide").length);
        }
        return next;
      });
      const labels = { valide: "validee" };
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

  // Colonnes admin : uniquement les fiches validées, avec traçabilité validation
  const adminColumns = [
    { key: "date", label: "Date récolte" },
    { key: "superviseur_general", label: "Superviseur", render: (row) => row.superviseur_general || "-" },
    { key: "total_regimes", label: "Total régimes" },
    { key: "nb_recolteurs", label: "Récolteurs" },
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
          </div>
        );
      },
    },
  ];

  const historyColumns = isAdmin ? adminColumns : superviseurColumns;
  const displayRows = isAdmin
    ? historyRows.filter((r) => r.statut === "valide")
    : historyRows;

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
              onChange={handleHeaderChange}
            />
            {fieldErrors.date && <span className="field-error">{fieldErrors.date}</span>}
          </label>
          <label>
            Superviseur general
            {isAdmin ? (
              <select
                name="superviseurGeneral"
                className={`fiche-input ${fieldErrors.superviseurGeneral ? "input-error" : ""}`}
                value={fiche.superviseurGeneral}
                onChange={handleHeaderChange}
              >
                <option value="">-- Choisir un superviseur --</option>
                {superviseursList.map((s) => (
                  <option key={s.id} value={s.display_name}>{s.display_name}</option>
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
            Complete les superviseurs adjoints (Nom + Secteurs/Recolteurs).
          </div>
        )}
        <div className="fiche-table-wrapper">
          <table className="simple-table">
            <thead>
              <tr>
                <th>Nom et prenom</th>
                <th>Secteurs ou recolteurs</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {fiche.superviseursAdjoints.map((s) => (
                <tr key={s.id}>
                  <td>
                    <SearchableSelect
                      value={s.nom}
                      options={(agentsList || []).map((a) => ({
                        value: a.nom_complet || `${a.nom} ${a.prenom || ""}`.trim(),
                        label: a.nom_complet || `${a.nom} ${a.prenom || ""}`.trim(),
                      }))}
                      onChange={(v) => handleAdjointNomChange(s.id, v)}
                      placeholder="Nom ou saisie libre"
                      allowCustom
                      clearable
                      className={fieldErrors.adjoints?.[s.id]?.nom ? "input-error" : ""}
                    />
                    {fieldErrors.adjoints?.[s.id]?.nom && (
                      <div className="field-error">{fieldErrors.adjoints[s.id].nom}</div>
                    )}
                  </td>
                  <td>
                    <SearchableSelect
                      value={s.secteur || ""}
                      options={secteursOrRecolteursOptions}
                      onChange={(v) => handleAdjointChange(s.id, "secteur", v)}
                      placeholder="Rechercher..."
                      clearable
                      className={fieldErrors.adjoints?.[s.id]?.secteur ? "input-error" : ""}
                    />
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
                className="fiche-input"
                value={fiche.bareme[r.key]}
                onChange={(e) => handleBaremeChange(r.key, e.target.value)}
              />
            </label>
          ))}
        </div>
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
                          <SearchableSelect
                            value={r.nom}
                            options={(recolteursList || []).map((x) => ({
                              value: x.nom,
                              label: `${x.numero_telephone ? `${x.numero_telephone} - ` : ""}${x.nom}`,
                              group: "",
                            }))}
                            onChange={(v) => handleRecolteurName(r.id, v)}
                            placeholder="Nom recolteur"
                            clearable
                            className={fieldErrors.recolteurs?.[r.id] ? "input-error" : ""}
                          />
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
                          className="fiche-input fiche-input-sm"
                          value={r.regimes[reg.key][s.code]}
                          onChange={(e) =>
                            handleRegimeChange(r.id, reg.key, s.code, e.target.value)
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
              type="number"
              min="0"
              className="fiche-input"
              value={fiche.depenses.salaire}
              onChange={(e) => handleDepenseChange("salaire", e.target.value)}
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

      {/* Recus de vente */}
      <section className={`fiche-section ${fieldErrors.recus ? "section-error" : ""}`}>
        <div className="section-row">
          <h3>Recu de vente</h3>
          <button className="btn-ghost" onClick={addRecu}>Ajouter recu</button>
        </div>
        {fieldErrors.recus && (
          <div className="field-error">
            Complete les recus de vente (Date + Montant).
          </div>
        )}
        <div className="recus-grid">
          {fiche.recus.map((r) => (
            <div key={r.id} className="recu-card">
              <div className="recu-header">
                <strong>Recu</strong>
                <button className="btn-danger btn-mini" onClick={() => removeRecu(r.id)}>
                  Supprimer
                </button>
              </div>
              <label>
                Date
                <input
                  type="date"
                  className={`fiche-input ${
                    fieldErrors.recus?.[r.id]?.date ? "input-error" : ""
                  }`}
                  value={r.date}
                  onChange={(e) => handleRecuChange(r.id, "date", e.target.value)}
                />
                {fieldErrors.recus?.[r.id]?.date && (
                  <span className="field-error">{fieldErrors.recus[r.id].date}</span>
                )}
              </label>
              <label>
                Client
                <ClientSelect
                  value={r.client}
                  clients={clientsList}
                  isAdmin={isAdmin}
                  onChange={(val) => handleRecuChange(r.id, "client", val)}
                  onClientAdded={(newClient) =>
                    setClientsList((prev) => [...prev, newClient].sort((a, b) => a.nom.localeCompare(b.nom)))
                  }
                />
              </label>
              <label>
                Pesee (kg)
                <input
                  type="number"
                  className="fiche-input"
                  value={r.peseeKg}
                  onChange={(e) => handleRecuChange(r.id, "peseeKg", e.target.value)}
                />
              </label>
              <label>
                Regimes non conformes (%)
                <input
                  type="number"
                  className="fiche-input"
                  value={r.nonConformes}
                  onChange={(e) => handleRecuChange(r.id, "nonConformes", e.target.value)}
                />
              </label>
              <label>
                Montant (FCFA)
                <input
                  type="number"
                  className={`fiche-input ${
                    fieldErrors.recus?.[r.id]?.montant ? "input-error" : ""
                  }`}
                  value={r.montant}
                  onChange={(e) => handleRecuChange(r.id, "montant", e.target.value)}
                />
                {fieldErrors.recus?.[r.id]?.montant && (
                  <span className="field-error">{fieldErrors.recus[r.id].montant}</span>
                )}
              </label>
            </div>
          ))}
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
            <div className="charts-grid">
              {analytics?.monthly && (
                <ChartCard
                  title="Evolution mensuelle (annee en cours vs precedente)"
                  type="line"
                  data={{
                    labels: analytics.monthly.current.labels,
                    datasets: [
                      {
                        label: `${analytics.year}`,
                        data: analytics.monthly.current.data,
                        borderColor: "#2E7D32",
                      },
                      {
                        label: `${analytics.year - 1}`,
                        data: analytics.monthly.previous.data,
                        borderColor: "#FBC02D",
                        borderDash: [4, 4],
                      },
                    ],
                  }}
                  onClick={() =>
                    setActiveChart({
                      title: "Evolution mensuelle",
                      type: "line",
                      data: {
                        labels: analytics.monthly.current.labels,
                        datasets: [
                          {
                            label: `${analytics.year}`,
                            data: analytics.monthly.current.data,
                            borderColor: "#2E7D32",
                          },
                          {
                            label: `${analytics.year - 1}`,
                            data: analytics.monthly.previous.data,
                            borderColor: "#FBC02D",
                            borderDash: [4, 4],
                          },
                        ],
                      },
                    })
                  }
                />
              )}

              {analytics?.yearly && (
                <ChartCard
                  title="Production par annee (5 ans)"
                  type="bar"
                  data={{
                    labels: analytics.yearly.labels,
                    datasets: [
                      {
                        label: "Total regimes",
                        data: analytics.yearly.data,
                        backgroundColor: "#66BB6A",
                      },
                    ],
                  }}
                  onClick={() =>
                    setActiveChart({
                      title: "Production par annee",
                      type: "bar",
                      data: {
                        labels: analytics.yearly.labels,
                        datasets: [
                          {
                            label: "Total regimes",
                            data: analytics.yearly.data,
                            backgroundColor: "#66BB6A",
                          },
                        ],
                      },
                    })
                  }
                />
              )}
            </div>

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
    </div>
  );
}
