import { apiGet, apiPost } from "../api/axios.js";

const BASE = "/action-logs/";

export const listActionLogs = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return apiGet(`${BASE}${qs ? `?${qs}` : ""}`);
};

export const revertAction = (id, raison = "") =>
  apiPost(`${BASE}${id}/annuler/`, { raison });
