import { useEffect, useMemo, useState } from "react";
import { useToast } from "../../context/ToastContext.jsx";
import DataTable from "../../components/DataTable.jsx";
import LogoLoader from "../../components/LogoLoader.jsx";
import FicheTravauxDialog from "../../components/FicheTravauxDialog.jsx";
import SuccessDialog from "../../components/SuccessDialog.jsx";
import { ficheTravauxInitial } from "../../data/ficheTravauxData.js";
import { listSecteurs } from "../../services/secteurService.js";
import { createFicheTravaux, listFichesTravaux } from "../../services/travauxService.js";
import { getToken } from "../../services/authService.js";
import { sanitizeDecimal, sanitizeInt } from "../../utils/number.js";

const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";

const uid = (prefix = "ID") =>
  `${prefix}-${crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`}`;

export default function HistoriqueTravaux() {
  const { pushToast } = useToast();

  const [tab, setTab] = useState("entete"); // entete | consommables | taches | historique

  const [fiche, setFiche] = useState(ficheTravauxInitial);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  const [secteurs, setSecteurs] = useState([]);
  const [secteurToAdd, setSecteurToAdd] = useState("");

  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedFiche, setSelectedFiche] = useState(null);
  const [success, setSuccess] = useState({ open: false, message: "" });

  const loadSecteurs = async () => {
    try {
      const data = await listSecteurs();
      setSecteurs(data || []);
    } catch (err) {
      pushToast({ type: "error", title: "Travaux", message: err.message });
    }
  };

  const loadHistory = async () => {
    try {
      setLoadingHistory(true);
      const data = await listFichesTravaux();
      setHistory(data || []);
    } catch (err) {
      pushToast({ type: "error", title: "Travaux", message: err.message });
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadSecteurs();
    loadHistory();
  }, []);

  const handleReset = () => {
    setFiche(ficheTravauxInitial);
    setSecteurToAdd("");
    setFieldErrors({});
    setTab("entete");
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

    return {
      superviseur_travaux: fiche.superviseurTravaux,
      nature_travaux: fiche.natureTravaux,
      superficie_couverte_ha: superficie ? Number(superficie) : null,
      secteurs_couverts: fiche.secteursCouverts,
      periode_travaux,
      nb_personnes: nb ? Number(nb) : null,
      consommables,
      repartitions,
      observations: fiche.observations || "",
    };
  };

  const handleSave = async () => {
    const errors = validateFiche();
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      setTab("entete");
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
      await createFicheTravaux(payload);
      setSuccess({ open: true, message: "Fiche travaux enregistree avec succes" });
      loadHistory();
    } catch (err) {
      pushToast({ type: "error", title: "Travaux", message: err.message });
    } finally {
      setSaving(false);
    }
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

  const historyColumns = [
    { key: "id", label: "ID" },
    { key: "periode_travaux", label: "Periode" },
    { key: "nature_travaux", label: "Nature" },
    { key: "superviseur_travaux", label: "Superviseur" },
    { key: "superficie_couverte_ha", label: "Superficie (ha)" },
    { key: "nb_personnes", label: "Nb pers." },
    { key: "total_cout", label: "Total (FCFA)" },
    { key: "secteurs", label: "Secteurs" },
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
      <header className="fiche-header">
        <h2>Fiche de travaux</h2>
        <div className="row-actions">
          {tab === "historique" ? (
            <>
              <button className="btn-ghost" onClick={handleExport}>
                Exporter Excel
              </button>
              <button className="btn-ghost" onClick={loadHistory} disabled={loadingHistory}>
                {loadingHistory ? "Chargement..." : "Rafraichir"}
              </button>
            </>
          ) : (
            <>
              <button className="btn-ghost" onClick={handleReset}>
                Nouvelle fiche
              </button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? "Enregistrement..." : "Enregistrer"}
              </button>
            </>
          )}
        </div>
      </header>

      <div className="tabs" style={{ marginTop: 12 }}>
        <button
          className={`tab-btn ${tab === "entete" ? "active" : ""}`}
          onClick={() => setTab("entete")}
        >
          En-tete
        </button>
        <button
          className={`tab-btn ${tab === "consommables" ? "active" : ""}`}
          onClick={() => setTab("consommables")}
        >
          Consommables
        </button>
        <button
          className={`tab-btn ${tab === "taches" ? "active" : ""}`}
          onClick={() => setTab("taches")}
        >
          Taches
        </button>
        <button
          className={`tab-btn ${tab === "historique" ? "active" : ""}`}
          onClick={() => setTab("historique")}
        >
          Historique
        </button>
      </div>

      {tab === "entete" && (
        <>
          <section
            className={`fiche-section ${
              fieldErrors.superviseurTravaux ||
              fieldErrors.natureTravaux ||
              fieldErrors.periodeTravauxDebut ||
              fieldErrors.periodeTravauxFin ||
              fieldErrors.secteursCouverts
                ? "section-error"
                : ""
            }`}
          >
            <h3>En-tete</h3>
            <div className="fiche-header-grid">
              <label>
                Superviseur des travaux
                <input
                  className={`fiche-input ${fieldErrors.superviseurTravaux ? "input-error" : ""}`}
                  value={fiche.superviseurTravaux}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFiche((p) => ({ ...p, superviseurTravaux: v }));
                    clearFieldError("superviseurTravaux");
                  }}
                />
                {fieldErrors.superviseurTravaux && (
                  <span className="field-error">{fieldErrors.superviseurTravaux}</span>
                )}
              </label>
              <label>
                Nature des travaux
                <input
                  className={`fiche-input ${fieldErrors.natureTravaux ? "input-error" : ""}`}
                  value={fiche.natureTravaux}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFiche((p) => ({ ...p, natureTravaux: v }));
                    clearFieldError("natureTravaux");
                  }}
                />
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
                    setFiche((p) => ({
                      ...p,
                      superficieCouverteHa: sanitizeDecimal(e.target.value),
                    }))
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

                    // Reset pour ajouter rapidement plusieurs secteurs
                    requestAnimationFrame(() => setSecteurToAdd(""));
                  }}
                >
                  <option value="">Ajouter un secteur...</option>
                  {secteurs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} - {s.nom}
                    </option>
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

          <section className="fiche-section">
            <h3>Observations</h3>
            <textarea
              className="fiche-input"
              rows={4}
              value={fiche.observations}
              onChange={(e) => setFiche((p) => ({ ...p, observations: e.target.value }))}
            />
          </section>
        </>
      )}

      {tab === "consommables" && (
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
                        value={c.unite}
                        onChange={(e) => updateConsommable(c.id, "unite", e.target.value)}
                      />
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
      )}

      {tab === "taches" && (
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
            <strong>Total consommables:</strong> {totalConsommables} FCFA -{" "}
            <strong>Total taches:</strong> {totalRepartitions} FCFA -{" "}
            <strong>Total general:</strong> {totalCout} FCFA
          </p>
        </section>
      )}

      {tab === "historique" && (
        <section className="fiche-section fiche-analytics">
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

      <SuccessDialog
        open={success.open}
        message={success.message}
        onClose={() => {
          setSuccess({ open: false, message: "" });
          handleReset();
        }}
      />
    </div>
  );
}
