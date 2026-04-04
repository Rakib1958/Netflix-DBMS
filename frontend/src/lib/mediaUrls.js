/**
 * Helpers for poster/backdrop URLs: DB overrides, absolute URLs, TMDB-style paths, or /uploads.
 */
export function resolveImageUrl(primaryPath, dbUrl) {
  if (dbUrl != null && String(dbUrl).trim() !== "") {
    const u = String(dbUrl).trim();
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith("/")) return u;
    return `https://image.tmdb.org/t/p/original${u}`;
  }
  if (primaryPath) {
    const p = String(primaryPath).trim();
    if (/^https?:\/\//i.test(p)) return p;
    if (p.startsWith("/")) return p;
    return `https://image.tmdb.org/t/p/original${p}`;
  }
  return "";
}

/** Card / grid image: prefers backdrop, then poster (full URL, /uploads, or TMDB-style path). */
export function catalogImageUrl(item) {
  const API_ORIGIN =
    typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL
      ? String(import.meta.env.VITE_API_URL).replace(/\/api\/?$/, "")
      : "http://localhost:5000";
  const u = item?.backdrop_url || item?.poster_url || item?.backdrop_path || item?.poster_path;
  if (!u) return "";
  const s = String(u).trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("/uploads")) return `${API_ORIGIN}${s}`;
  if (s.startsWith("/")) return `https://image.tmdb.org/t/p/w500${s}`;
  return `https://image.tmdb.org/t/p/w500/${s}`;
}

export function youtubeKeyFromUrl(url) {
  if (!url || typeof url !== "string") return null;
  const s = url.trim();
  try {
    const u = new URL(s);
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.replace(/^\//, "").split("/")[0] || null;
    }
    const v = u.searchParams.get("v");
    if (v) return v;
    const embed = u.pathname.match(/\/embed\/([^/?]+)/);
    if (embed) return embed[1];
  } catch {
    const m = s.match(/(?:v=|youtu\.be\/|\/embed\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
  }
  return null;
}
