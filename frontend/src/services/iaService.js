import { apiGet, apiPost } from "../api/axios.js";

const BASE = "/ia";

export const getSyntheseIA = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return apiGet(`${BASE}/synthese/${qs ? `?${qs}` : ""}`);
};

export const simulerScenario = (payload) => apiPost(`${BASE}/simulation/`, payload);

export const listPrescriptions = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return apiGet(`${BASE}/prescriptions/${qs ? `?${qs}` : ""}`);
};
export const creerPrescription = (payload) => apiPost(`${BASE}/prescriptions/`, payload);

export const listRisquesSecteurs = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return apiGet(`${BASE}/risques-secteurs/${qs ? `?${qs}` : ""}`);
};

export const listModeles = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return apiGet(`${BASE}/modeles/${qs ? `?${qs}` : ""}`);
};
export const entrainerModeles = (algorithmes = []) => apiPost(`${BASE}/entrainer/`, { algorithmes });
export const evaluerModeles = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return apiGet(`${BASE}/evaluation-modeles/${qs ? `?${qs}` : ""}`);
};

export const listPredictions = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return apiGet(`${BASE}/predictions/${qs ? `?${qs}` : ""}`);
};
export const predireRendement = (payload) => apiPost(`${BASE}/predire-rendement/`, payload);
export const predirePlantation = (payload) => apiPost(`${BASE}/predire-plantation/`, payload);
export const expliquerPrediction = (id) => apiGet(`${BASE}/predictions/${id}/expliquer/`);

export const listAnomalies = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return apiGet(`${BASE}/anomalies/${qs ? `?${qs}` : ""}`);
};
export const detecterAnomalies = (payload) => apiPost(`${BASE}/detecter-anomalie/`, payload);
export const validerAnomalie = (id) => apiPost(`${BASE}/anomalies/${id}/valider/`, {});
export const rejeterAnomalie = (id) => apiPost(`${BASE}/anomalies/${id}/rejeter/`, {});

export const getTendancesIA = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return apiGet(`${BASE}/tendances/${qs ? `?${qs}` : ""}`);
};

export const poserQuestionIA = (payload) => apiPost(`${BASE}/assistant-metier/`, payload);

export const getScoringRecolteursIA = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return apiGet(`${BASE}/scoring-recolteurs/${qs ? `?${qs}` : ""}`);
};