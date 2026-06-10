import { apiGet, apiPost, apiPut, apiDelete } from "../api/axios.js";

const BASE = "/superviseurs-generaux/";

export const listSuperviseurs      = ()           => apiGet(BASE);
export const getSuperviseur        = (id)         => apiGet(`${BASE}${id}/`);
export const getSuperviseurStats      = (id)          => apiGet(`${BASE}${id}/stats/`);
export const getSuperviseurSecteurs   = (id, year)    => apiGet(`${BASE}${id}/secteurs-stats/?year=${year}`);
export const getSuperviseurRecolteurs = (id, year)    => apiGet(`${BASE}${id}/recolteurs-stats/?year=${year}`);
export const createSuperviseur     = (data)       => apiPost(BASE, data);
export const updateSuperviseur     = (id, data)   => apiPut(`${BASE}${id}/`, data);
export const deleteSuperviseur     = (id)         => apiDelete(`${BASE}${id}/`);
