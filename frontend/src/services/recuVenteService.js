import { apiDelete, apiGet, apiPatch, apiPost } from "../api/axios.js";

const BASE = "/recus-vente/";
const BONUS_BASE = "/parametre-bonus/";

export const listRecusVente    = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return apiGet(`${BASE}${qs ? `?${qs}` : ""}`);
};
export const getRecuVente      = (id)          => apiGet(`${BASE}${id}/`);
export const createRecuVente   = (payload)     => apiPost(BASE, payload);
export const updateRecuVente   = (id, payload) => apiPatch(`${BASE}${id}/`, payload);
export const deleteRecuVente   = (id)          => apiDelete(`${BASE}${id}/`);
export const validerRecu       = (id)          => apiPost(`${BASE}${id}/valider/`, {});

export const getParametreBonus    = ()          => apiGet(`${BONUS_BASE}`);
export const updateParametreBonus = (payload)   => apiPatch(`${BONUS_BASE}1/`, payload);
