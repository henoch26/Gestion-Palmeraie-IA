import { apiDelete, apiGet, apiPost, apiPut } from "../api/axios.js";
import { endpoints } from "../api/endpoints.js";

// CRUD recolteurs
export const listRecolteurs = () => apiGet(endpoints.recolteurs);
export const createRecolteur = (payload) => apiPost(endpoints.recolteurs, payload);
export const updateRecolteur = (id, payload) => apiPut(`${endpoints.recolteurs}${id}/`, payload);
export const deleteRecolteur = (id) => apiDelete(`${endpoints.recolteurs}${id}/`);

// Analytics
export const getRecolteursStats = (year) =>
  apiGet(`${endpoints.recolteurs}stats/${year ? `?year=${encodeURIComponent(year)}` : ""}`);
export const getRecolteurAnalytics = (id, year) =>
  apiGet(`${endpoints.recolteurs}${id}/analytics/${year ? `?year=${encodeURIComponent(year)}` : ""}`);
