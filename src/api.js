export const API_BASE =
  import.meta.env.VITE_API_BASE ?? (import.meta.env.DEV ? `http://${window.location.hostname}:3001` : "/api");

export const STANDALONE = import.meta.env.VITE_STANDALONE === "true";

export const assetUrl = (url) => (!url ? null : /^(blob:|data:|https?:)/.test(url) ? url : `${API_BASE}${url}`);
