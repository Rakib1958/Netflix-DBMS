/** Prefer DB override (full URL or TMDB-style path); fall back to TMDB path from API. */
export function resolveImageUrl(tmdbPath, dbUrl) {
  if (dbUrl != null && String(dbUrl).trim() !== "") {
    const u = String(dbUrl).trim();
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith("/")) return `https://image.tmdb.org/t/p/original${u}`;
    return u;
  }
  if (tmdbPath) return `https://image.tmdb.org/t/p/original${tmdbPath}`;
  return "";
}

/** Extract YouTube video id from common URL shapes. */
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
