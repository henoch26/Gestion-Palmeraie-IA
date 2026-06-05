import { useState } from "react";
import { createClient } from "../services/clientService.js";

/**
 * Sélecteur de client :
 * - Liste déroulante native (<select>) avec tous les clients existants
 * - Bouton "Ajouter un nouveau client" visible uniquement pour l'administrateur
 * - Mini-formulaire inline qui s'ouvre au clic sur le bouton
 */
export default function ClientSelect({ value = "", onChange, clients = [], onClientAdded, isAdmin = false }) {
  const [showForm, setShowForm] = useState(false);
  const [newNom, setNewNom] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async () => {
    const nom = newNom.trim();
    if (!nom) return;
    setLoading(true);
    setError("");
    try {
      const created = await createClient({ nom });
      onClientAdded?.(created);
      onChange(created.nom);
      setShowForm(false);
      setNewNom("");
    } catch (err) {
      setError(err.message || "Erreur lors de la création");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>

      {/* ── Ligne : select + bouton admin ── */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>

        {/* Liste déroulante */}
        <select
          className="fiche-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ flex: 1 }}
        >
          <option value="">— Choisir un client —</option>
          {clients.map((c) => (
            <option key={c.id} value={c.nom}>
              {c.nom}
            </option>
          ))}
        </select>

        {/* Bouton admin uniquement */}
        {isAdmin && !showForm && (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => { setShowForm(true); setNewNom(""); setError(""); }}
            style={{ whiteSpace: "nowrap", fontSize: 13 }}
          >
            + Ajouter un client
          </button>
        )}
      </div>

      {/* ── Formulaire d'ajout inline (admin) ── */}
      {isAdmin && showForm && (
        <div
          style={{
            padding: "10px 14px",
            background: "#f9fbe7",
            border: "1px solid #c5e1a5",
            borderRadius: 6,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600 }}>Nouveau client</span>

          <input
            className="fiche-input"
            value={newNom}
            onChange={(e) => setNewNom(e.target.value)}
            placeholder="Nom du client"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); handleCreate(); }
              if (e.key === "Escape") { setShowForm(false); }
            }}
          />

          {error && (
            <span style={{ color: "#c62828", fontSize: 12 }}>{error}</span>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn-primary"
              onClick={handleCreate}
              disabled={loading || !newNom.trim()}
              style={{ fontSize: 13, padding: "4px 14px" }}
            >
              {loading ? "Ajout…" : "Confirmer"}
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setShowForm(false)}
              style={{ fontSize: 13, padding: "4px 14px" }}
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
