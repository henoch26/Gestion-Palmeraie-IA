import { useEffect, useMemo, useState } from "react";
import { useToast } from "../../context/ToastContext.jsx";
import DataTable from "../../components/DataTable.jsx";
import FicheTravauxDialog from "../../components/FicheTravauxDialog.jsx";
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

  const [fiche, setFiche] = useState(ficheTravauxInitial);
  const [saving, setSaving] = useState(false);

  const [secteurs, setSecteurs] = useState([]);

  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedFiche, setSelectedFiche] = useState(null);

  const loadSecteurs = async () => {
    try {
      const data = await listSecteurs();
      setSecteurs(data || []);
    } catch (err) {
      pushToast({ type: "error", title: "Erreur API", message: err.message });
    }
  };

  const loadHistory = async () => {
    try {
      setLoadingHistory(true);
      const data = await listFichesTravaux();
      setHistory(data || []);
    } catch (err) {
      pushToast({ type: "error", title: "Erreur API", message: err.message });
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadSecteurs();
    loadHistory();
  }, []);

  const handleReset = () => setFiche(ficheTravauxInitial);

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
      periode_travaux: fiche.periodeTravaux,
      nb_personnes: nb ? Number(nb) : null,
      consommables,
      repartitions,
      observations: fiche.observations || "",
    };
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const payload = buildPayload();
      await createFicheTravaux(payload);
      pushToast({ type: "success", title: "Fiche travaux enregistree" });
      handleReset();
      loadHistory();
    } catch (err) {
      pushToast({ type: "error", title: "Erreur API", message: err.message });
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
          <button className="btn-ghost" onClick={handleReset}>
            Nouvelle fiche
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </header>

      <section className="fiche-section">
        <h3>En-tete</h3>
        <div className="fiche-header-grid">
          <label>
            Superviseur des travaux
            <input
              className="fiche-input"
              value={fiche.superviseurTravaux}
              onChange={(e) => setFiche((p) => ({ ...p, superviseurTravaux: e.target.value }))}
            />
          </label>
          <label>
            Nature des travaux
            <input
              className="fiche-input"
              value={fiche.natureTravaux}
              onChange={(e) => setFiche((p) => ({ ...p, natureTravaux: e.target.value }))}
            />
          </label>
          <label>
            Superficie (ha) couverte
            <input
              className="fiche-input"
              inputMode="decimal"
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
            <input
              className="fiche-input"
              value={fiche.periodeTravaux}
              onChange={(e) => setFiche((p) => ({ ...p, periodeTravaux: e.target.value }))}
              placeholder="Ex: 01/03/2026 - 05/03/2026"
            />
          </label>
          <label>
            Nombre de personnes impliquees
            <input
              className="fiche-input"
              inputMode="numeric"
              value={fiche.nbPersonnes}
              onChange={(e) =>
                setFiche((p) => ({ ...p, nbPersonnes: sanitizeInt(e.target.value) }))
              }
            />
          </label>
          <label>
            Secteurs couverts
            <select
              className="fiche-input"
              multiple
              value={fiche.secteursCouverts}
              onChange={(e) => {
                const selected = Array.from(e.target.selectedOptions).map((o) => Number(o.value));
                setFiche((p) => ({ ...p, secteursCouverts: selected }));
              }}
              style={{ minHeight: 90 }}
            >
              {secteurs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} - {s.nom}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

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

      <section className="fiche-section">
        <h3>Observations</h3>
        <textarea
          className="fiche-input"
          rows={4}
          value={fiche.observations}
          onChange={(e) => setFiche((p) => ({ ...p, observations: e.target.value }))}
        />
      </section>

      <section className="fiche-section fiche-analytics">
        <div className="page-header-row">
          <h3>Historique des fiches</h3>
          <div className="row-actions">
            <button className="btn-ghost" onClick={handleExport}>Exporter Excel</button>
            <button className="btn-ghost" onClick={loadHistory} disabled={loadingHistory}>
              {loadingHistory ? "Chargement..." : "Rafraichir"}
            </button>
          </div>
        </div>

        {loadingHistory ? (
          <p>Chargement...</p>
        ) : (
          <DataTable columns={historyColumns} rows={historyRows} pageSize={5} />
        )}
      </section>

      <FicheTravauxDialog
        open={!!selectedFiche}
        fiche={selectedFiche}
        onClose={() => setSelectedFiche(null)}
      />
    </div>
  );
}
