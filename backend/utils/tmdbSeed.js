/**
 * Bootstrap: when the catalog is empty and TMDB credentials exist, import movies and/or TV
 * into PostgreSQL. After that the app uses the DB only. TV rows use tmdb_id "tv-{id}" so
 * they never collide with movie numeric ids.
 */
import { safeError, safeInfo, sanitizeForLog } from "./rotation.js";
import { Media } from "../database/models/Media.js";
import { ensureDynamicColumns } from "../database/migrations/dynamicColumns.js";

const TMDB_BASE = "https://api.themoviedb.org/3";

function parseBool(raw, defaultVal = true) {
  if (raw === undefined || raw === null || String(raw).trim() === "") return defaultVal;
  const s = String(raw).trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(s)) return false;
  if (["1", "true", "yes", "on"].includes(s)) return true;
  return defaultVal;
}

function getTmdbAuth() {
  const TMDB_TOKEN = process.env.TMDB_TOKEN?.trim();
  const TMDB_API_KEY = process.env.TMDB_API_KEY?.trim();
  if (!TMDB_TOKEN && !TMDB_API_KEY) return null;
  const isJwtLike = !!TMDB_TOKEN && /^eyJ[A-Za-z0-9_-]+\./.test(TMDB_TOKEN);
  const effectiveApiKey = TMDB_API_KEY || (!isJwtLike ? TMDB_TOKEN : null);
  return {
    token: TMDB_TOKEN,
    apiKey: effectiveApiKey,
    useBearer: isJwtLike,
  };
}

function buildTmdbUrl(path, query = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    qs.set(k, String(v));
  }
  const auth = getTmdbAuth();
  if (auth?.apiKey) qs.set("api_key", auth.apiKey);
  const qstr = qs.toString();
  return `${TMDB_BASE}/${path.replace(/^\//, "")}${qstr ? `?${qstr}` : ""}`;
}

async function tmdbGet(path, query = {}) {
  const auth = getTmdbAuth();
  if (!auth) throw new Error("TMDB not configured");

  const url = buildTmdbUrl(path, query);
  const res = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      ...(auth.useBearer && auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TMDB HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

function tmdbImageUrl(path, size = "w780") {
  if (!path || typeof path !== "string") return null;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `https://image.tmdb.org/t/p/${size}${p}`;
}

function youtubeTrailerUrl(detail) {
  const results = detail?.videos?.results;
  if (!Array.isArray(results)) return null;
  const trailer = results.find((v) => v.site === "YouTube" && v.type === "Trailer");
  const tease = results.find((v) => v.site === "YouTube" && v.type === "Teaser");
  const key = trailer?.key || tease?.key;
  return key ? `https://www.youtube.com/watch?v=${key}` : null;
}

function releaseYearFromDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const y = parseInt(dateStr.slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

function mapTmdbTvStatus(status) {
  const x = String(status || "").toLowerCase();
  if (x.includes("cancel")) return "canceled";
  if (x.includes("end")) return "ended";
  return "ongoing";
}

function episodeRuntimeMinutes(detail) {
  const arr = detail?.episode_run_time;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const sum = arr.reduce((a, b) => a + (Number(b) || 0), 0);
  return Math.round(sum / arr.length) || null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function seedMoviesFromTmdb(maxMovies, delayMs) {
  let genreList = {};
  try {
    const g = await tmdbGet("genre/movie/list");
    genreList = Object.fromEntries((g.genres || []).map((x) => [x.id, x.name]));
  } catch (e) {
    safeError("TMDB genre/movie/list failed:", sanitizeForLog({ message: e.message }));
  }

  const seenIds = new Set();
  const toFetch = [];
  for (let page = 1; toFetch.length < maxMovies; page++) {
    const popular = await tmdbGet("movie/popular", { language: "en-US", page });
    const results = popular.results || [];
    if (results.length === 0) break;
    for (const r of results) {
      if (r?.id && !seenIds.has(r.id)) {
        seenIds.add(r.id);
        toFetch.push(r.id);
        if (toFetch.length >= maxMovies) break;
      }
    }
    if (results.length < 20) break;
    if (page >= 15) break;
  }

  let imported = 0;
  let skippedDup = 0;
  let failed = 0;

  for (const tmdbNumericId of toFetch) {
    const tmdbId = String(tmdbNumericId);
    try {
      const dup = await Media.findByTmdbId(tmdbId);
      if (dup) {
        skippedDup++;
        continue;
      }

      const detail = await tmdbGet(`movie/${tmdbNumericId}`, {
        language: "en-US",
        append_to_response: "videos",
      });

      if (!detail || detail.success === false) {
        failed++;
        continue;
      }

      const genreNames = (detail.genres || []).map((g) => g.name).filter(Boolean);
      if (genreNames.length === 0 && Array.isArray(detail.genre_ids)) {
        for (const gid of detail.genre_ids) {
          const n = genreList[gid];
          if (n) genreNames.push(n);
        }
      }

      await Media.createMovie({
        title: detail.title || detail.original_title || "Untitled",
        plotSummary: detail.overview || null,
        releaseDate: detail.release_date || null,
        releaseYear: releaseYearFromDate(detail.release_date),
        runtimeMinutes: detail.runtime != null ? detail.runtime : null,
        originalLanguage: detail.original_language || null,
        posterUrl: tmdbImageUrl(detail.poster_path, "w780"),
        backdropUrl: tmdbImageUrl(detail.backdrop_path, "w1280"),
        trailerUrl: youtubeTrailerUrl(detail),
        tagline: detail.tagline || null,
        boxOfficeWorldwide: detail.revenue != null ? detail.revenue : null,
        productionBudget: detail.budget != null ? detail.budget : null,
        aspectRatio: null,
        genreNames,
        initialRating: detail.vote_average != null ? Number(detail.vote_average) : 0,
        initialNumVotes: detail.vote_count != null ? Number(detail.vote_count) : 0,
        tmdbId,
        tmdbData: detail,
      });

      imported++;
      if (delayMs > 0) await sleep(delayMs);
    } catch (e) {
      failed++;
      safeError("TMDB movie seed error:", sanitizeForLog({ tmdbId, message: e.message }));
    }
  }

  return { imported, skippedDup, failed };
}

async function seedTvFromTmdb(maxSeries, delayMs) {
  let genreList = {};
  try {
    const g = await tmdbGet("genre/tv/list");
    genreList = Object.fromEntries((g.genres || []).map((x) => [x.id, x.name]));
  } catch (e) {
    safeError("TMDB genre/tv/list failed:", sanitizeForLog({ message: e.message }));
  }

  const seenIds = new Set();
  const toFetch = [];
  for (let page = 1; toFetch.length < maxSeries; page++) {
    const popular = await tmdbGet("tv/popular", { language: "en-US", page });
    const results = popular.results || [];
    if (results.length === 0) break;
    for (const r of results) {
      if (r?.id && !seenIds.has(r.id)) {
        seenIds.add(r.id);
        toFetch.push(r.id);
        if (toFetch.length >= maxSeries) break;
      }
    }
    if (results.length < 20) break;
    if (page >= 15) break;
  }

  let imported = 0;
  let skippedDup = 0;
  let failed = 0;

  for (const tmdbNumericId of toFetch) {
    const tmdbKey = `tv-${tmdbNumericId}`;
    try {
      const dup = await Media.findByTmdbId(tmdbKey);
      if (dup) {
        skippedDup++;
        continue;
      }

      const detail = await tmdbGet(`tv/${tmdbNumericId}`, {
        language: "en-US",
        append_to_response: "videos",
      });

      if (!detail || detail.success === false) {
        failed++;
        continue;
      }

      const genreNames = (detail.genres || []).map((g) => g.name).filter(Boolean);
      if (genreNames.length === 0 && Array.isArray(detail.genre_ids)) {
        for (const gid of detail.genre_ids) {
          const n = genreList[gid];
          if (n) genreNames.push(n);
        }
      }

      await Media.createTvSeries({
        title: detail.name || detail.original_name || "Untitled",
        plotSummary: detail.overview || null,
        releaseDate: detail.first_air_date || null,
        releaseYear: releaseYearFromDate(detail.first_air_date),
        runtimeMinutes: episodeRuntimeMinutes(detail),
        originalLanguage: detail.original_language || null,
        posterUrl: tmdbImageUrl(detail.poster_path, "w780"),
        backdropUrl: tmdbImageUrl(detail.backdrop_path, "w1280"),
        trailerUrl: youtubeTrailerUrl(detail),
        genreNames,
        initialRating: detail.vote_average != null ? Number(detail.vote_average) : 0,
        initialNumVotes: detail.vote_count != null ? Number(detail.vote_count) : 0,
        tmdbId: tmdbKey,
        tmdbData: detail,
        totalSeasons: detail.number_of_seasons != null ? detail.number_of_seasons : 0,
        totalEpisodes: detail.number_of_episodes != null ? detail.number_of_episodes : 0,
        seriesStart: detail.first_air_date || null,
        seriesEnd: detail.last_air_date || null,
        status: mapTmdbTvStatus(detail.status),
      });

      imported++;
      if (delayMs > 0) await sleep(delayMs);
    } catch (e) {
      failed++;
      safeError("TMDB TV seed error:", sanitizeForLog({ tmdbKey, message: e.message }));
    }
  }

  return { imported, skippedDup, failed };
}

/**
 * @returns {Promise<{ ok: boolean, skipped?: string, imported?: number, importedSeries?: number, error?: string }>}
 */
export async function seedCatalogFromTmdbIfEmpty() {
  if (!parseBool(process.env.TMDB_AUTO_SEED, true)) {
    return { ok: true, skipped: "TMDB_AUTO_SEED disabled" };
  }

  await ensureDynamicColumns();

  const movieCount = await Media.countCatalogMovies();
  const seriesCount = await Media.countCatalogSeries();

  if (!getTmdbAuth()) {
    if (movieCount === 0 || seriesCount === 0) {
      safeInfo(
        "Catalog has empty movie/TV tables and TMDB is not configured — skipping auto-seed. Set TMDB_TOKEN or TMDB_API_KEY in backend/.env."
      );
    }
    return { ok: true, skipped: "no_tmdb_credentials", movieCount, seriesCount };
  }

  const maxMovies = Math.min(
    200,
    Math.max(0, parseInt(String(process.env.TMDB_SEED_MAX || "50"), 10) || 50)
  );
  const maxSeries = Math.min(
    200,
    Math.max(0, parseInt(String(process.env.TMDB_SEED_TV_MAX || "30"), 10) || 30)
  );
  const delayMs = Math.max(0, parseInt(String(process.env.TMDB_SEED_DELAY_MS || "45"), 10) || 45);

  try {
    let imported = 0;
    let importedSeries = 0;

    if (movieCount === 0 && maxMovies > 0) {
      safeInfo(`Movie catalog empty — seeding up to ${maxMovies} movies from TMDB…`);
      const r = await seedMoviesFromTmdb(maxMovies, delayMs);
      imported = r.imported;
      safeInfo(
        `TMDB movie seed: imported ${r.imported}` +
          (r.skippedDup ? `, skipped ${r.skippedDup} duplicates` : "") +
          (r.failed ? `, ${r.failed} failed` : "")
      );
    }

    if (seriesCount === 0 && maxSeries > 0) {
      safeInfo(`TV catalog empty — seeding up to ${maxSeries} series from TMDB…`);
      const r = await seedTvFromTmdb(maxSeries, delayMs);
      importedSeries = r.imported;
      safeInfo(
        `TMDB TV seed: imported ${r.imported}` +
          (r.skippedDup ? `, skipped ${r.skippedDup} duplicates` : "") +
          (r.failed ? `, ${r.failed} failed` : "")
      );
    }

    return { ok: true, imported, importedSeries, movieCount, seriesCount };
  } catch (err) {
    safeError("TMDB auto-seed failed:", sanitizeForLog({ message: err.message }));
    return { ok: false, error: err.message };
  }
}
