import { apiDelete, apiGet, apiPatch, apiPost } from "../api/axios.js";

const BASE = "/clients/";

export const listClients   = ()           => apiGet(BASE);
export const createClient  = (payload)    => apiPost(BASE, payload);
export const updateClient  = (id, payload) => apiPatch(`${BASE}${id}/`, payload);
export const deleteClient  = (id)         => apiDelete(`${BASE}${id}/`);
