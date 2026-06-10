import { apiDelete, apiGet, apiPost, apiPut } from "../api/axios.js";
import { endpoints } from "../api/endpoints.js";

// CRUD secteurs
export const listSecteurs = () => apiGet(endpoints.secteurs);
export const createSecteur = (payload) => apiPost(endpoints.secteurs, payload);
export const updateSecteur = (id, payload) => apiPut(`${endpoints.secteurs}${id}/`, payload);
export const deleteSecteur = (id) => apiDelete(`${endpoints.secteurs}${id}/`);

// Analytics
export const getSecteur = (id) => apiGet(`${endpoints.secteurs}${id}/`);
export const getSecteurAnalytics = (id, year, createdBy = null) => {
  const params = new URLSearchParams();
  if (year) params.set("year", year);
  if (createdBy) params.set("created_by", createdBy);
  const qs = params.toString();
  return apiGet(`${endpoints.secteurs}${id}/analytics/${qs ? `?${qs}` : ""}`);
};
