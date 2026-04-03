/**
 * TMDB data via backend /api/tmdb proxy (keeps API keys off the client).
 */
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

function toQuery(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    qs.set(k, String(v));
  });
  const s = qs.toString();
  return s ? `?${s}` : "";
}

/**
 * Calls the backend TMDB proxy to keep TMDB_TOKEN server-side.
 * @param {string} path TMDB path after /3/, e.g. "movie/upcoming"
 * @param {Record<string, any>} params query params
 */
export async function tmdbGet(path, params) {
  const clean = String(path || "").replace(/^\/+/, "");
  const url = `${API_URL}/tmdb/${clean}${toQuery(params)}`;
  const res = await fetch(url, { method: "GET", credentials: "include" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.message || `TMDB request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

export function isFutureReleaseDate(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return a > b;
}

