import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "../api/axios.js";
import { endpoints } from "../api/endpoints.js";

// CRUD fiches de recolte
export const listFiches = () => apiGet(endpoints.recoltes);
export const createFiche = (payload) => apiPost(endpoints.recoltes, payload);
export const updateFiche = (id, payload) => apiPut(`${endpoints.recoltes}${id}/`, payload);
export const deleteFiche = (id) => apiDelete(`${endpoints.recoltes}${id}/`);
export const patchFiche = (id, payload) => apiPatch(`${endpoints.recoltes}${id}/`, payload);
export const getRecoltesAnalytics = (year) =>
  apiGet(`${endpoints.recoltes}analytics/${year ? `?year=${encodeURIComponent(year)}` : ""}`);
