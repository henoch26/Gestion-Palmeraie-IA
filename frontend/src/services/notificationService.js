import { apiGet, apiPatch, apiPost } from "../api/axios.js";

export const getNotifications = () => apiGet("/notifications/");

export const markRead = (id) => apiPatch(`/notifications/${id}/read/`, {});

export const markAllRead = () => apiPost("/notifications/mark-all-read/", {});
