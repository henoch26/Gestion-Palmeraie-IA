import { apiGet } from "../api/axios.js";

// Resume dashboard
export const getDashboardSummary = ({ year, secteur, recolteur, regime_type, years } = {}) => {
  const params = new URLSearchParams();
  if (year) params.set("year", String(year));
  if (secteur) params.set("secteur", String(secteur));
  if (recolteur) params.set("recolteur", String(recolteur));
  if (regime_type) params.set("regime_type", String(regime_type));
  if (years) params.set("years", String(years));
  const qs = params.toString();
  return apiGet(`/dashboard/summary/${qs ? `?${qs}` : ""}`);
};
