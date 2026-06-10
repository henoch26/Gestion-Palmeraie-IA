import { apiDelete, apiGet, apiPost, apiPostMultipart, apiPut, apiPutMultipart } from "../api/axios.js";
import { endpoints } from "../api/endpoints.js";

const BASE = endpoints.personnel;

// CRUD personnel (anciennement recolteurs)
export const listRecolteurs = () => apiGet(BASE);
export const listPersonnel = () => apiGet(BASE);
export const createRecolteur = (payload) => apiPost(BASE, payload);
export const createPersonnel = (payload) => apiPost(BASE, payload);
export const createPersonnelMultipart = (formData) => apiPostMultipart(BASE, formData);
export const updateRecolteur = (id, payload) => apiPut(`${BASE}${id}/`, payload);
export const updatePersonnel = (id, payload) => apiPut(`${BASE}${id}/`, payload);
export const updatePersonnelMultipart = (id, formData) => apiPutMultipart(`${BASE}${id}/`, formData);
export const deleteRecolteur = (id) => apiDelete(`${BASE}${id}/`);
export const deletePersonnel = (id) => apiDelete(`${BASE}${id}/`);

// Analytics & stats
export const getRecolteursStats = (year) =>
  apiGet(`${BASE}stats/${year ? `?year=${encodeURIComponent(year)}` : ""}`);
export const getPersonnelStats = (year) =>
  apiGet(`${BASE}stats/${year ? `?year=${encodeURIComponent(year)}` : ""}`);
export const getRecolteurAnalytics = (id, year, createdBy = null) => {
  const params = new URLSearchParams();
  if (year) params.set("year", year);
  if (createdBy) params.set("created_by", createdBy);
  const qs = params.toString();
  return apiGet(`${BASE}${id}/analytics/${qs ? `?${qs}` : ""}`);
};
export const getPersonnelAnalytics = (id, year, createdBy = null) =>
  getRecolteurAnalytics(id, year, createdBy);
