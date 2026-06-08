import { apiDelete, apiGet, apiPatch, apiPost } from "../api/axios.js";
import { endpoints } from "../api/endpoints.js";

export const listAgents    = ()           => apiGet(endpoints.agents);
export const createAgent   = (payload)    => apiPost(endpoints.agents, payload);
export const updateAgent   = (id, payload) => apiPatch(`${endpoints.agents}${id}/`, payload);
export const deleteAgent   = (id)         => apiDelete(`${endpoints.agents}${id}/`);
