import { apiGet, apiPost } from "../api/axios.js";

const BASE = "/clients/";

export const listClients = () => apiGet(BASE);
export const createClient = (payload) => apiPost(BASE, payload);
