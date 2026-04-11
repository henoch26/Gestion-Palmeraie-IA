import { apiDelete, apiGet, apiPost, apiPut } from "../api/axios.js";
import { endpoints } from "../api/endpoints.js";

// CRUD materiels / equipements
export const listMateriels = () => apiGet(endpoints.materiels);
export const createMateriel = (payload) => apiPost(endpoints.materiels, payload);
export const updateMateriel = (id, payload) =>
  apiPut(`${endpoints.materiels}${id}/`, payload);
export const deleteMateriel = (id) =>
  apiDelete(`${endpoints.materiels}${id}/`);

