/**
 * recolteurService.js — Acces aux donnees du personnel (anciennement "recolteurs").
 *
 * Toutes les fonctions pointent vers /api/personnel/ (endpoint Django).
 * Les alias "Recolteur" et "Personnel" sont equivalents — les deux noms
 * coexistent pour compatibilite avec le code existant.
 *
 * Fonctions exportees :
 *   listPersonnel()                      — GET  liste complete
 *   createPersonnelMultipart(formData)   — POST creation avec photo (FormData)
 *   updatePersonnelMultipart(id, fd)     — PUT  mise a jour avec photo (FormData)
 *   deletePersonnel(id)                  — DELETE
 *   getPersonnelStats(year)              — GET  stats agregees par annee
 *   getPersonnelAnalytics(id, year, cb)  — GET  detail analytique d'un agent
 */
import { apiDelete, apiGet, apiPatch, apiPost, apiPostMultipart, apiPut, apiPutMultipart } from "../api/axios.js";
import { endpoints } from "../api/endpoints.js";

const BASE = endpoints.personnel;

// CRUD personnel (anciennement recolteurs)
export const listRecolteurs = () => apiGet(BASE);
export const listPersonnel = () => apiGet(BASE);
export const createRecolteur = (payload) => apiPost(BASE, payload);
export const createPersonnel = (payload) => apiPost(BASE, payload);
export const createPersonnelMultipart = (formData) => apiPostMultipart(BASE, formData);
export const updateRecolteur = (id, payload) => apiPatch(`${BASE}${id}/`, payload);
export const updatePersonnel = (id, payload) => apiPatch(`${BASE}${id}/`, payload);
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
