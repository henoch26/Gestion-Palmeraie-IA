import { apiDelete, apiGet, apiPost, apiPut } from "../api/axios.js";
import { endpoints } from "../api/endpoints.js";

// CRUD fiches de travaux
export const listFichesTravaux = () => apiGet(endpoints.travaux);
export const createFicheTravaux = (payload) => apiPost(endpoints.travaux, payload);
export const updateFicheTravaux = (id, payload) =>
  apiPut(`${endpoints.travaux}${id}/`, payload);
export const deleteFicheTravaux = (id) =>
  apiDelete(`${endpoints.travaux}${id}/`);
