// Donnees de depart pour la fiche de recolte (format papier)
// Tout est editable dans l'UI, mais on garde ici les valeurs par defaut.

// Codes secteurs visibles dans la fiche (fixes pour l'instant)
export const secteurCodes = [
  { code: "GP_1", label: "GP_1" },
  { code: "GP_2", label: "GP_2" },
  { code: "RTE_BOUB", label: "Rte Boub" },
  { code: "PM_1", label: "PM_1" },
  { code: "PM_2", label: "PM_2" },
  { code: "JC_1", label: "JC_1" },
  { code: "JC_2", label: "JC_2" },
  { code: "CO", label: "CO" },
  { code: "AA", label: "AA" },
];

// Types de regimes et leurs libelles
export const regimeTypes = [
  { key: "grands", label: "Grds" },
  { key: "moyens", label: "Moy" },
  { key: "petits", label: "Ptits" },
];

// Helper: cree un objet { GP_1: "", GP_2: "", ... }
const emptyBySecteur = () =>
  Object.fromEntries(secteurCodes.map((s) => [s.code, ""]));

// Etat initial de la fiche
export const ficheRecolteInitial = {
  date: "",
  superviseurGeneral: "",
  superviseursAdjoints: [
    { id: "SA-001", nom: "K. Kouassi", secteur: "GP_1" },
    { id: "SA-002", nom: "M. Yao", secteur: "GP_2" },
  ],
  // Bareme (editable)
  bareme: {
    grands: 60,
    moyens: 50,
    petits: 25,
  },
  // Recolteurs + denombrement des regimes
  recolteurs: [
    {
      id: "REC-001",
      nom: "A. Konan",
      regimes: {
        grands: { ...emptyBySecteur() },
        moyens: { ...emptyBySecteur() },
        petits: { ...emptyBySecteur() },
      },
    },
  ],
  // Depenses
  depenses: {
    nourriture: "",
    transport: "",
    salaire: "",
  },
  // Recu de vente (1 par defaut, on peut en ajouter d'autres si besoin)
  recus: [
    { id: "RC-001", date: "", client: "", peseeKg: "", nonConformes: "", montant: "" },
  ],
  observations: "",
};
