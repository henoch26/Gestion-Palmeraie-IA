import { apiDelete, apiGet, apiPost, apiPut } from "../api/axios.js";
import { endpoints } from "../api/endpoints.js";

// CRUD secteurs
export const listSecteurs = () => apiGet(endpoints.secteurs);
export const createSecteur = (payload) => apiPost(endpoints.secteurs, payload);
export const updateSecteur = (id, payload) => apiPut(`${endpoints.secteurs}${id}/`, payload);
export const deleteSecteur = (id) => apiDelete(`${endpoints.secteurs}${id}/`);

// Analytics
export const getSecteur = (id) => apiGet(`${endpoints.secteurs}${id}/`);
export const getSecteurAnalytics = (id, year) =>
  apiGet(`${endpoints.secteurs}${id}/analytics/${year ? `?year=${encodeURIComponent(year)}` : ""}`);
