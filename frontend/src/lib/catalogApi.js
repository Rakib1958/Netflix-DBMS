/**
 * Catalog API: movies and TV series from PostgreSQL.
 */
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

export async function fetchCatalogMovies(section = "all", { genre = "", limit = 30 } = {}) {
  const res = await axios.get(`${API_URL}/catalog/movies`, {
    params: { section, genre, limit },
  });
  return res.data?.results || [];
}

export async function fetchCatalogSeries(section = "all", { genre = "", limit = 30 } = {}) {
  const res = await axios.get(`${API_URL}/catalog/series`, {
    params: { section, genre, limit },
  });
  return res.data?.results || [];
}

export async function fetchMovieDetail(mediaId) {
  const res = await axios.get(`${API_URL}/catalog/movies/${mediaId}`);
  return res.data;
}

export async function fetchSeriesDetail(mediaId) {
  const res = await axios.get(`${API_URL}/catalog/series/${mediaId}`);
  return res.data;
}

export async function fetchMovieRecommendations(mediaId, limit = 12) {
  const res = await axios.get(`${API_URL}/catalog/movies/${mediaId}/recommendations`, {
    params: { limit },
  });
  return res.data?.results || [];
}

export async function fetchSeriesRecommendations(mediaId, limit = 12) {
  const res = await axios.get(`${API_URL}/catalog/series/${mediaId}/recommendations`, {
    params: { limit },
  });
  return res.data?.results || [];
}

export async function searchCatalog(query, limit = 40) {
  const q = String(query || "").trim();
  if (!q) return [];
  const res = await axios.get(`${API_URL}/catalog/search`, { params: { q, limit } });
  return res.data?.results || [];
}

export async function matchCatalogTitles(titles) {
  const res = await axios.post(`${API_URL}/catalog/match-titles`, {
    titles: Array.isArray(titles) ? titles : [],
  });
  return res.data?.matches || res.data?.movies || [];
}
