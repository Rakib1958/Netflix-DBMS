/**
 * API base URL for axios/fetch. Default `/api` is same-origin with Vite dev proxy or Express static,
 * so httpOnly auth cookies are sent (cross-origin http://localhost:5000 from :5173 often drops them with SameSite=Lax).
 */
const envUrl = import.meta.env.VITE_API_URL?.trim();

export const API_URL = envUrl || "/api";

/** Origin for `/uploads` and other non-API paths when API_URL is relative. */
export function getSiteOrigin() {
  if (envUrl) {
    return String(envUrl).replace(/\/api\/?$/, "");
  }
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "";
}
