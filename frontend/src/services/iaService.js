import { apiGet, apiPost, apiPut } from "../api/axios.js";
import { endpoints } from "../api/endpoints.js";

export const getIASummary = ({ year, secteur } = {}) => {
  const params = new URLSearchParams();
  if (year) params.set("year", String(year));
  if (secteur) params.set("secteur", String(secteur));
  const qs = params.toString();
  return apiGet(`${endpoints.iaSummary}${qs ? `?${qs}` : ""}`);
};

export const getIAAdvanced = ({ year, secteur, horizon } = {}) => {
  const params = new URLSearchParams();
  if (year) params.set("year", String(year));
  if (secteur) params.set("secteur", String(secteur));
  if (horizon) params.set("horizon", String(horizon));
  const qs = params.toString();
  return apiGet(`${endpoints.iaAdvanced}${qs ? `?${qs}` : ""}`);
};

export const listFacteursProduction = ({ year, month, secteur } = {}) => {
  const params = new URLSearchParams();
  if (year) params.set("year", String(year));
  if (month) params.set("month", String(month));
  if (secteur) params.set("secteur", String(secteur));
  const qs = params.toString();
  return apiGet(`${endpoints.iaFacteursProduction}${qs ? `?${qs}` : ""}`);
};

export const listAnomalies = ({ year, resolved } = {}) => {
  const params = new URLSearchParams();
  if (year) params.set("year", String(year));
  if (resolved === true) params.set("resolved", "1");
  if (resolved === false) params.set("resolved", "0");
  const qs = params.toString();
  return apiGet(`${endpoints.iaAnomalies}${qs ? `?${qs}` : ""}`);
};

export const resolveAnomalie = (id, resolved = true) =>
  apiPut(`${endpoints.iaAnomalies}${id}/`, { resolved: !!resolved });

export const recomputeAnomalies = ({ year } = {}) => {
  const params = new URLSearchParams();
  if (year) params.set("year", String(year));
  const qs = params.toString();
  return apiPost(`${endpoints.iaAnomalies}recompute/${qs ? `?${qs}` : ""}`, {});
};

export const recomputePredictions = ({ year, secteur, horizon } = {}) => {
  const params = new URLSearchParams();
  if (year) params.set("year", String(year));
  if (secteur) params.set("secteur", String(secteur));
  if (horizon) params.set("horizon", String(horizon));
  const qs = params.toString();
  return apiPost(`${endpoints.iaPredictions}recompute/${qs ? `?${qs}` : ""}`, {});
};
