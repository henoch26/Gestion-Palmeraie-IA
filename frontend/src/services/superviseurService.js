import { apiGet } from "../api/axios.js";

const BASE = "/superviseurs/";

export const listSuperviseurs = () => apiGet(BASE);
export const getSuperviseur = (id) => apiGet(`${BASE}${id}/`);
export const getSuperviseurStats = (id) => apiGet(`${BASE}${id}/stats/`);
export const getSuperviseurSecteurs = (id, year) => apiGet(`${BASE}${id}/secteurs-stats/?year=${year}`);
export const getSuperviseurRecolteurs = (id, year) => apiGet(`${BASE}${id}/recolteurs-stats/?year=${year}`);