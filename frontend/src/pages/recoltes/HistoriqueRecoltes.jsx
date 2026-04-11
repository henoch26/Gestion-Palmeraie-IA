import { useEffect, useMemo, useState } from "react";
import {
  ficheRecolteInitial,
  regimeTypes,
  secteurCodes,
} from "../../data/ficheRecolteData.js";
import { useToast } from "../../context/ToastContext.jsx";
import { listSecteurs } from "../../services/secteurService.js";
import { createFiche, getRecoltesAnalytics, listFiches } from "../../services/recolteService.js";
import { listRecolteurs } from "../../services/recolteurService.js";
import DataTable from "../../components/DataTable.jsx";
import FicheDialog from "../../components/FicheDialog.jsx";
import ChartCard from "../../components/ChartCard.jsx";
import ChartDialog from "../../components/ChartDialog.jsx";
import { getToken } from "../../services/authService.js";

const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";

// Page Fiche de recolte (format papier)
export default function HistoriqueRecoltes() {
  const { pushToast } = useToast();

  // Etat global de la fiche
  const [fiche, setFiche] = useState(ficheRecolteInitial);
  const [saving, setSaving] = useState(false);

  // Secteurs visibles dans la fiche (depuis l'API)
  const [secteurList, setSecteurList] = useState(secteurCodes);
  const [activeSecteurCodes, setActiveSecteurCodes] = useState(
    secteurCodes.map((s) => s.code)
  );
  const [recolteursList, setRecolteursList] = useState([]);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedFiche, setSelectedFiche] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [analyticsYear, setAnalyticsYear] = useState(new Date().getFullYear());
  const [activeChart, setActiveChart] = useState(null);

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

  // Total depenses (nourriture + transport)
  const totalDepenses = useMemo(() => {
    const n = Number(fiche.depenses.nourriture) || 0;
    const t = Number(fiche.depenses.transport) || 0;
    return n + t;
  }, [fiche.depenses.nourriture, fiche.depenses.transport]);

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
      pushToast({ type: "error", title: "Erreur API", message: err.message });
    }
  };

  const loadRecolteurs = async () => {
    try {
      const data = await listRecolteurs();
      setRecolteursList(data || []);
    } catch (err) {
      pushToast({ type: "error", title: "Erreur API", message: err.message });
    }
  };

  const loadAnalytics = async (year = analyticsYear) => {
    try {
      setLoadingAnalytics(true);
      const data = await getRecoltesAnalytics(year);
      setAnalytics(data);
    } catch (err) {
      pushToast({ type: "error", title: "Erreur API", message: err.message });
    } finally {
      setLoadingAnalytics(false);
    }
  };

  useEffect(() => {
    loadSecteurs();
    loadRecolteurs();
    loadHistory();
  }, []);

  useEffect(() => {
    loadAnalytics(analyticsYear);
  }, [analyticsYear]);

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
    setFiche((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  // Bareme (Grds/Moy/Ptits)
  const handleBaremeChange = (key, value) => {
    setFiche((prev) => ({
      ...prev,
      bareme: { ...prev.bareme, [key]: value },
    }));
  };

  // Superviseurs adjoints
  const handleAdjointChange = (id, field, value) => {
    setFiche((prev) => ({
      ...prev,
      superviseursAdjoints: prev.superviseursAdjoints.map((s) =>
        s.id === id ? { ...s, [field]: value } : s
      ),
    }));
  };

  const addAdjoint = () => {
    setFiche((prev) => ({
      ...prev,
      superviseursAdjoints: [
        ...prev.superviseursAdjoints,
        { id: `SA-${Date.now()}`, nom: "", secteur: "" },
      ],
    }));
  };

  const removeAdjoint = (id) => {
    setFiche((prev) => ({
      ...prev,
      superviseursAdjoints: prev.superviseursAdjoints.filter((s) => s.id !== id),
    }));
  };

  // Recolteurs (nom)
  const handleRecolteurName = (id, value) => {
    setFiche((prev) => ({
      ...prev,
      recolteurs: prev.recolteurs.map((r) =>
        r.id === id ? { ...r, nom: value } : r
      ),
    }));
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
  };

  // Construit le payload conforme a l'API
  const buildPayload = () => {
    const secteurByCode = new Map(secteurList.map((s) => [s.code, s]));
    const recolteurByName = new Map(
      recolteursList
        .filter((r) => r?.nom)
        .map((r) => [r.nom.trim().toLowerCase(), r])
    );

    // Lignes par recolteur et par type de regime
    const lignes = fiche.recolteurs.flatMap((r) =>
      regimeTypes.map((reg) => ({
        recolteur: recolteurByName.get((r.nom || "").trim().toLowerCase())?.id || null,
        recolteur_nom: r.nom,
        regime_type: reg.key,
        details: secteurList
          .map((s) => ({
            secteur: secteurByCode.get(s.code)?.id || null,
            secteur_code: s.code,
            quantite: Number(r.regimes[reg.key][s.code]) || 0,
          }))
          .filter((d) => Number(d.quantite) > 0),
      }))
    );

    return {
      date: fiche.date,
      superviseur_general: fiche.superviseurGeneral,
      bareme_grands: Number(fiche.bareme.grands) || 0,
      bareme_moyens: Number(fiche.bareme.moyens) || 0,
      bareme_petits: Number(fiche.bareme.petits) || 0,
      depense_nourriture: Number(fiche.depenses.nourriture) || 0,
      depense_transport: Number(fiche.depenses.transport) || 0,
      observations: fiche.observations || "",
      superviseurs_adjoints: fiche.superviseursAdjoints.map((s) => ({
        nom: s.nom,
        secteur_ou_recolteur: s.secteur,
      })),
      lignes,
      recus: fiche.recus.map((r) => ({
        date: r.date || null,
        client: r.client,
        pesee_kg: Number(r.peseeKg) || 0,
        non_conformes_pct: Number(r.nonConformes) || 0,
        montant: Number(r.montant) || 0,
      })),
    };
  };

  // Enregistre la fiche (POST ou PUT)
  const handleSave = async () => {
    try {
      setSaving(true);
      const payload = buildPayload();
      await createFiche(payload);
      pushToast({ type: "success", title: "Fiche enregistree" });
      loadHistory(); // Recharge l'historique apres sauvegarde
      loadAnalytics();
      handleReset();
    } catch (err) {
      pushToast({ type: "error", title: "Erreur API", message: err.message });
    } finally {
      setSaving(false);
    }
  };

  // Nouvelle fiche (reset)
  const handleReset = () => {
    setFiche(ficheRecolteInitial);
  };

  // Chargement de l'historique des fiches
  const loadHistory = async () => {
    try {
      setLoadingHistory(true);
      const data = await listFiches();
      setHistory(data || []);
    } catch (err) {
      pushToast({ type: "error", title: "Erreur API", message: err.message });
    } finally {
      setLoadingHistory(false);
    }
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

  const historyColumns = [
    { key: "date", label: "Date" },
    {
      key: "superviseur_general",
      label: "Superviseur",
      render: (row) => row.superviseur_general || "-",
    },
    { key: "total_regimes", label: "Total regimes" },
    { key: "total_prix", label: "Prix recolte" },
    { key: "nb_recolteurs", label: "Recolteurs" },
    { key: "nb_recus", label: "Recus" },
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

  return (
    <div className="page fiche">
      <datalist id="secteurs-options">
        {secteurList.map((s) => (
          <option key={s.code} value={s.code} label={s.nom} />
        ))}
      </datalist>
      <datalist id="recolteurs-options">
        {recolteursList.map((r) => (
          <option key={r.id} value={r.nom} />
        ))}
      </datalist>

      <header className="fiche-header">
        <h2>Fiche de recolte</h2>
        <div className="row-actions">
          <button className="btn-ghost" onClick={handleReset}>
            Nouvelle fiche
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </header>

      {/* En-tete de la fiche */}
      <section className="fiche-section">
        <h3>En-tete</h3>
        <div className="fiche-header-grid">
          <label>
            Date
            <input
              type="date"
              name="date"
              className="fiche-input"
              value={fiche.date}
              onChange={handleHeaderChange}
            />
          </label>
          <label>
            Superviseur general
            <input
              name="superviseurGeneral"
              className="fiche-input"
              value={fiche.superviseurGeneral}
              onChange={handleHeaderChange}
              placeholder="Nom du superviseur"
            />
          </label>
        </div>
      </section>

      {/* Superviseurs adjoints */}
      <section className="fiche-section">
        <div className="section-row">
          <h3>Superviseurs adjoints</h3>
          <button className="btn-ghost" onClick={addAdjoint}>Ajouter</button>
        </div>
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
                    <input
                      className="fiche-input"
                      value={s.nom}
                      onChange={(e) => handleAdjointChange(s.id, "nom", e.target.value)}
                    />
                  </td>
                  <td>
                    <select
                      className="fiche-input"
                      value={s.secteur || ""}
                      onChange={(e) => handleAdjointChange(s.id, "secteur", e.target.value)}
                    >
                      <option value="">-- Choisir --</option>
                      <optgroup label="Secteurs">
                        {secteurList.map((sec) => (
                          <option key={`sec-${sec.code}`} value={sec.code}>
                            {sec.code} - {sec.nom}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Recolteurs">
                        {recolteursList.map((r) => (
                          <option key={`rec-${r.id}`} value={r.nom}>
                            {r.code ? `${r.code} - ` : ""}{r.nom}
                          </option>
                        ))}
                      </optgroup>
                    </select>
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
      <section className="fiche-section">
        <div className="section-row">
          <h3>Denombrement des regimes par secteur et par recolteur</h3>
          <button className="btn-ghost" onClick={addRecolteur}>Ajouter recolteur</button>
        </div>

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
                          <input
                            className="fiche-input"
                            value={r.nom}
                            list="recolteurs-options"
                            onChange={(e) => handleRecolteurName(r.id, e.target.value)}
                            placeholder="Nom recolteur"
                          />
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
              className="fiche-input"
              value={fiche.depenses.nourriture}
              onChange={(e) => handleDepenseChange("nourriture", e.target.value)}
            />
          </label>
          <label>
            Transport
            <input
              type="number"
              className="fiche-input"
              value={fiche.depenses.transport}
              onChange={(e) => handleDepenseChange("transport", e.target.value)}
            />
          </label>
          <label>
            Total
            <input className="fiche-input" value={totalDepenses} readOnly />
          </label>
        </div>
      </section>

      {/* Recus de vente */}
      <section className="fiche-section">
        <div className="section-row">
          <h3>Recu de vente</h3>
          <button className="btn-ghost" onClick={addRecu}>Ajouter recu</button>
        </div>
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
                  className="fiche-input"
                  value={r.date}
                  onChange={(e) => handleRecuChange(r.id, "date", e.target.value)}
                />
              </label>
              <label>
                Client
                <input
                  className="fiche-input"
                  value={r.client}
                  onChange={(e) => handleRecuChange(r.id, "client", e.target.value)}
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
                  className="fiche-input"
                  value={r.montant}
                  onChange={(e) => handleRecuChange(r.id, "montant", e.target.value)}
                />
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

      {/* Analyses & comparaisons */}
      <section className="fiche-section">
        <div className="page-header-row">
          <h3>Analyses et comparaisons</h3>
          <div className="row-actions">
            <label className="inline-label">
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
              Rafraichir
            </button>
            <button className="btn-ghost" onClick={handleExport}>
              Exporter Excel
            </button>
          </div>
        </div>

        {loadingAnalytics ? (
          <p>Chargement...</p>
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
                    { key: "code", label: "Code" },
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

      {/* Historique des fiches */}
      <section className="fiche-section fiche-history">
        <div className="page-header-row">
          <h3>Historique des fiches</h3>
          <button className="btn-ghost" onClick={loadHistory} disabled={loadingHistory}>
            {loadingHistory ? "Chargement..." : "Rafraichir"}
          </button>
        </div>
        {loadingHistory ? (
          <p>Chargement...</p>
        ) : (
          <DataTable columns={historyColumns} rows={historyRows} pageSize={5} />
        )}
      </section>

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
    </div>
  );
}
