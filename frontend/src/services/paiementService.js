import { apiGet, apiPost, apiPut } from "../api/axios.js";
import { endpoints } from "../api/endpoints.js";

export const listPaiements = ({ year, month, statut, recolteur, obsolete } = {}) => {
  const params = new URLSearchParams();
  if (year) params.set("year", String(year));
  if (month) params.set("month", String(month));
  if (statut) params.set("statut", String(statut));
  if (recolteur) params.set("recolteur", String(recolteur));
  if (obsolete === true) params.set("obsolete", "1");
  if (obsolete === false) params.set("obsolete", "0");
  const qs = params.toString();
  return apiGet(`${endpoints.paiements}${qs ? `?${qs}` : ""}`);
};

export const updatePaiementStatut = (id, statut) =>
  apiPut(`${endpoints.paiements}${id}/`, { statut });

export const getPaiementsSummary = ({ year, month } = {}) => {
  const params = new URLSearchParams();
  if (year) params.set("year", String(year));
  if (month) params.set("month", String(month));
  const qs = params.toString();
  return apiGet(`${endpoints.paiements}summary/${qs ? `?${qs}` : ""}`);
};

export const syncPaiements = ({ year } = {}) => {
  const params = new URLSearchParams();
  if (year) params.set("year", String(year));
  const qs = params.toString();
  return apiPost(`${endpoints.paiements}sync/${qs ? `?${qs}` : ""}`, {});
};
