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

// Etat initial de la fiche
export const ficheRecolteInitial = {
  date: "",
  superviseurGeneral: "",
  superviseurGeneralId: null,
  superviseursAdjoints: [
    { id: "SA-001", nom: "K. Kouassi", secteur: "GP_1", agentId: null },
    { id: "SA-002", nom: "M. Yao", secteur: "GP_2", agentId: null },
  ],
  // Bareme (editable)
  bareme: {
    grands: 60,
    moyens: 50,
    petits: 25,
  },
  // Lignes de denombrement inserees une a une (un recolteur + un type de regime
  // + les quantites par secteur ou il a recolte ce type de regime ce jour-la)
  recolteurs: [],
  // Depenses
  depenses: {
    nourriture: "",
    transport: "",
    salaire: "",
  },
  observations: "",
};
