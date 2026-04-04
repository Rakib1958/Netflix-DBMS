import { Play, Plus, Check, ThumbsUp, ThumbsDown } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { useAuthStore } from "../store/authStore";
import { toast } from "react-hot-toast";
import axios from "axios";
import { resolveImageUrl, youtubeKeyFromUrl, catalogImageUrl } from "../lib/mediaUrls";
import { fetchSeriesDetail, fetchSeriesRecommendations, fetchSeriesSeasons } from "../lib/catalogApi";
import { formatDateOnly } from "../lib/dateDisplay";
import { API_URL, getSiteOrigin } from "../lib/apiBase.js";

const SITE_ORIGIN = getSiteOrigin();

function EpisodeTitleWithDetails({ ep, epTitle }) {
  const overview = ep.overview?.trim();
  const hasDetails = Boolean(overview);
  return (
    <div className="group/ep relative inline-block max-w-full align-top">
      <span
        tabIndex={hasDetails ? 0 : undefined}
        className={
          hasDetails
            ? "font-semibold text-white cursor-help border-b border-dotted border-gray-500 hover:border-gray-300 outline-none rounded-sm focus-visible:ring-2 focus-visible:ring-[#e50914]/70"
            : "font-semibold text-white"
        }
      >
        {ep.episode_number}. {epTitle}
      </span>
      {hasDetails ? (
        <div
          role="tooltip"
          className="pointer-events-none absolute left-0 top-full z-50 mt-2 max-h-64 w-[min(22rem,calc(100vw-3rem))] overflow-y-auto rounded-lg border border-[#444] bg-[#1f1f1f] p-3 text-left text-sm font-normal font-sans leading-snug text-gray-300 shadow-xl opacity-0 transition-opacity duration-150 group-hover/ep:opacity-100 group-focus-within/ep:opacity-100"
        >
          {overview}
        </div>
      ) : null}
    </div>
  );
}

const Seriespage = () => {
  const { id } = useParams();
  const [show, setShow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [selectedSeasonNumber, setSelectedSeasonNumber] = useState(null);

  const [reviews, setReviews] = useState([]);
  const [reviewContent, setReviewContent] = useState("");
  const [rating, setRating] = useState(0);
  const [internalRating, setInternalRating] = useState(0);
  const [internalVotes, setInternalVotes] = useState(0);
  const [mediaExtras, setMediaExtras] = useState({
    admin_metadata: null,
    poster_url: null,
    backdrop_url: null,
    trailer_url: null,
  });

  const { user, addToWatchlist, removeFromWatchlist } = useAuthStore();
  const isInWatchlist = user?.watchlist?.some((m) => m && String(m.id) === String(id));

  const adminMeta = mediaExtras.admin_metadata;

  const posterSrc = useMemo(
    () => resolveImageUrl(show?.poster_path, mediaExtras.poster_url),
    [show, mediaExtras.poster_url]
  );
  const backdropSrc = useMemo(
    () => resolveImageUrl(show?.backdrop_path, mediaExtras.backdrop_url),
    [show, mediaExtras.backdrop_url]
  );
  const effectiveTrailerKey = useMemo(() => youtubeKeyFromUrl(mediaExtras.trailer_url), [mediaExtras.trailer_url]);

  const handleWatchlistToggle = async () => {
    try {
      if (isInWatchlist) {
        await removeFromWatchlist(id);
        toast.success("Removed from watchlist");
      } else {
        await addToWatchlist(id);
        toast.success("Added to watchlist");
      }
    } catch {
      toast.error("An error occurred");
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        setSeasons([]);
        const detail = await fetchSeriesDetail(id);
        if (cancelled) return;
        setShow(detail);
        const [recR, seaR] = await Promise.allSettled([
          fetchSeriesRecommendations(id),
          fetchSeriesSeasons(id),
        ]);
        if (cancelled) return;
        setRecommendations(recR.status === "fulfilled" ? recR.value : []);
        setSeasons(
          seaR.status === "fulfilled" && Array.isArray(seaR.value) ? seaR.value : []
        );
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          console.error("Error loading series:", err);
          setError(err.response?.status === 404 ? "Series not found" : "Failed to load series");
          setLoading(false);
        }
      }
    })();

    axios
      .get(`${API_URL}/media/${id}/reviews`)
      .then((res) => setReviews(res.data.reviews || []))
      .catch((err) => console.error("Reviews fetch error:", err));

    axios
      .get(`${API_URL}/media/${id}/rating-stats`)
      .then((res) => {
        setInternalRating(res.data.rating || 0);
        setInternalVotes(res.data.num_votes || 0);
      })
      .catch((err) => console.error("Rating stats fetch error:", err));

    axios
      .get(`${API_URL}/media/${id}/admin-meta`)
      .then((res) =>
        setMediaExtras({
          admin_metadata: res.data.admin_metadata,
          poster_url: res.data.poster_url,
          backdrop_url: res.data.backdrop_url,
          trailer_url: res.data.trailer_url,
        })
      )
      .catch(() => {
        setMediaExtras({
          admin_metadata: null,
          poster_url: null,
          backdrop_url: null,
          trailer_url: null,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const sortedSeasons = useMemo(
    () => [...seasons].sort((a, b) => (a.season_number ?? 0) - (b.season_number ?? 0)),
    [seasons]
  );

  useEffect(() => {
    if (!sortedSeasons.length) {
      setSelectedSeasonNumber(null);
      return;
    }
    setSelectedSeasonNumber((prev) => {
      if (prev != null && sortedSeasons.some((s) => s.season_number === prev)) return prev;
      return sortedSeasons[0].season_number;
    });
  }, [sortedSeasons]);

  const activeSeason = useMemo(
    () => sortedSeasons.find((s) => s.season_number === selectedSeasonNumber) ?? null,
    [sortedSeasons, selectedSeasonNumber]
  );

  const submitRating = async (val) => {
    if (!user) return toast.error("Sign in to rate!");
    if (!show) return toast.error("Series data not loaded");
    if (!val || val < 1 || val > 10) return toast.error("Invalid rating");
    try {
      const response = await axios.post(`${API_URL}/media/${id}/ratings`, { rating: val });
      if (response?.status === 200 && response?.data) {
        setRating(val);
        const d = response.data;
        const newRating = d.rating != null ? parseFloat(d.rating) : 0;
        const newVotes = d.num_votes != null ? parseInt(d.num_votes, 10) : 0;
        if (!isNaN(newRating)) setInternalRating(newRating);
        if (!isNaN(newVotes)) setInternalVotes(newVotes);
        toast.success("Rating submitted");
      }
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || "Error rating");
    }
  };

  const submitReview = async (e) => {
    e.preventDefault();
    if (!user) return toast.error("Sign in to review!");
    try {
      const res = await axios.post(`${API_URL}/media/${id}/reviews`, { content: reviewContent });
      setReviews(res.data.reviews);
      setReviewContent("");
      toast.success("Review posted");
    } catch (err) {
      const msg = err.response?.data?.message || err.message || "Error posting review";
      toast.error(msg);
    }
  };

  const voteReview = async (reviewId, voteType) => {
    if (!user) return toast.error("Sign in to vote!");
    try {
      await axios.post(`${API_URL}/reviews/${reviewId}/vote`, { voteType });
      const refresh = await axios.get(`${API_URL}/media/${id}/reviews`);
      setReviews(refresh.data.reviews || []);
      toast.success("Vote saved");
    } catch {
      toast.error("Error voting");
    }
  };

  const profileSrc = (pic) => {
    if (!pic) return null;
    if (pic.startsWith("http")) return pic;
    return `${SITE_ORIGIN}${pic}`;
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <span className="text-xl text-red-500">{error}</span>
      </div>
    );
  }

  if (loading || !show) {
    return (
      <div className="flex items-center justify-center h-screen">
        <span className="text-xl text-gray-400">Loading...</span>
      </div>
    );
  }

  const firstAir = formatDateOnly(show.first_air_date || show.release_date);
  const lastAir = formatDateOnly(show.last_air_date);

  return (
    <div className="min-h-screen bg-[#181818] text-white">
      <div
        className="relative h-[60vh] flex item-end"
        style={{
          backgroundImage: backdropSrc ? `url(${backdropSrc})` : undefined,
          backgroundColor: "#181818",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-[#181818] via-transparent to-transparent" />
        <div className="relative z-10 flex items-end p-8 gap-8">
          {posterSrc && (
            <img src={posterSrc} alt="" className="rounded-lg shadow-lg w-48 hidden md:block object-cover aspect-[2/3]" />
          )}
          <div>
            <p className="text-sm text-gray-400 mb-1">TV Series</p>
            <h1 className="text-4xl font-bold mb-2">{show.title}</h1>
            <div className="flex flex-wrap items-center gap-4 mb-2">
              <span>
                ⭐ {internalRating > 0 ? internalRating.toFixed(1) : show.vote_average?.toFixed(1) || "N/A"} (
                {internalVotes} ratings)
              </span>
              <span>{show.status}</span>
              {show.number_of_seasons != null ? (
                <span>
                  {show.number_of_seasons} season{show.number_of_seasons !== 1 ? "s" : ""}
                  {show.number_of_episodes != null ? ` · ${show.number_of_episodes} episodes` : ""}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              {show.genres?.map((genre) => (
                <span key={genre.id} className="bg-gray-800 px-3 py-1 rounded-full text-sm">
                  {genre.name}
                </span>
              ))}
            </div>
            <p className="max-w-2xl text-gray-200">{show.overview}</p>
            {(firstAir || lastAir) && (
              <p className="text-sm text-gray-400 mt-2">
                {firstAir ? <>First aired {firstAir}</> : null}
                {firstAir && lastAir ? " · " : null}
                {lastAir ? <>Last aired {lastAir}</> : null}
              </p>
            )}
            {adminMeta && (adminMeta.awards || adminMeta.secondary_info) && (
              <div className="mt-4 max-w-2xl space-y-2 text-sm border border-[#333] rounded-lg p-4 bg-black/30">
                {adminMeta.awards && (
                  <p>
                    <span className="font-semibold text-amber-200">Awards: </span>
                    <span className="text-gray-300 whitespace-pre-wrap">{adminMeta.awards}</span>
                  </p>
                )}
                {adminMeta.secondary_info && (
                  <p>
                    <span className="font-semibold text-gray-300">Editorial: </span>
                    <span className="text-gray-400 whitespace-pre-wrap">{adminMeta.secondary_info}</span>
                  </p>
                )}
              </div>
            )}
            <div className="flex flex-wrap gap-4 mt-4">
              {effectiveTrailerKey ? (
                <a
                  href={`https://www.youtube.com/watch?v=${effectiveTrailerKey}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex justify-center items-center bg-[#e50914] text-white py-3 px-6 rounded-full cursor-pointer text-sm md:text-base transition hover:bg-[#b20710]"
                >
                  <Play className="mr-2 w-4 h-5 md:w-5 md:h-5 fill-current" /> Watch trailer
                </a>
              ) : (
                <span className="text-gray-500 text-sm self-center">No trailer available</span>
              )}
              <button
                type="button"
                onClick={handleWatchlistToggle}
                className="flex justify-center items-center bg-gray-600 bg-opacity-70 text-white py-3 px-6 rounded-full cursor-pointer text-sm md:text-base transition hover:bg-gray-500"
              >
                {isInWatchlist ? (
                  <>
                    <Check className="mr-2 w-4 h-5 md:w-5 md:h-5" /> In Watchlist
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 w-4 h-5 md:w-5 md:h-5" /> Add to Watchlist
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="p-8">
        <h2 className="text-2xl font-semibold mb-4">Episodes</h2>
        {sortedSeasons.length === 0 ? (
          <p className="text-gray-500 mb-10 max-w-2xl">
            No seasons or episodes are stored for this series yet. With TMDB configured, new TV catalog seeds import
            all seasons (optional cap via <code className="text-gray-400">TMDB_SEED_TV_SEASONS_MAX</code> in the backend
            for faster test seeds).
          </p>
        ) : (
          <div className="mb-10 rounded-lg border border-[#333] bg-[#232323] overflow-visible">
            <div className="bg-[#2a2a2a] px-4 py-3 flex flex-col gap-3 border-b border-[#333] sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
              <label className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:gap-3">
                <span className="font-medium text-gray-300 shrink-0">Season</span>
                <select
                  value={selectedSeasonNumber ?? ""}
                  onChange={(e) => setSelectedSeasonNumber(Number(e.target.value))}
                  className="min-w-[10rem] rounded-md border border-[#444] bg-[#181818] px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-[#e50914]"
                >
                  {sortedSeasons.map((s) => (
                    <option key={s.season_id} value={s.season_number}>
                      Season {s.season_number}
                      {s.episodes?.length != null ? ` (${s.episodes.length} eps)` : ""}
                    </option>
                  ))}
                </select>
              </label>
              {activeSeason ? (
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-gray-400">
                  {activeSeason.air_date ? <span>Aired {formatDateOnly(activeSeason.air_date)}</span> : null}
                  <span>
                    {activeSeason.episodes?.length ?? 0} episode
                    {(activeSeason.episodes?.length ?? 0) !== 1 ? "s" : ""}
                  </span>
                </div>
              ) : null}
            </div>
            {activeSeason?.overview?.trim() ? (
              <div className="group/sv relative border-b border-[#333] px-4 py-2">
                <span className="text-sm text-gray-500">
                  <span className="cursor-help border-b border-dotted border-gray-600 text-gray-400 hover:border-gray-400">
                    Season synopsis
                  </span>
                </span>
                <div className="pointer-events-none absolute left-4 top-full z-40 mt-2 hidden max-h-48 w-[min(28rem,calc(100vw-3rem))] overflow-y-auto rounded-lg border border-[#444] bg-[#1f1f1f] p-3 text-sm text-gray-300 shadow-xl group-hover/sv:block">
                  {activeSeason.overview}
                </div>
              </div>
            ) : null}
            <ul className="divide-y divide-[#333]">
              {!activeSeason || (activeSeason.episodes || []).length === 0 ? (
                <li className="px-4 py-4 text-gray-500 text-sm">No episodes listed for this season.</li>
              ) : (
                activeSeason.episodes.map((ep) => {
                  const stillSrc = ep.still_url ? resolveImageUrl(null, ep.still_url) : "";
                  const epTitle = ep.title?.trim() || `Episode ${ep.episode_number}`;
                  return (
                    <li
                      key={ep.episode_id}
                      className="flex flex-col sm:flex-row gap-4 p-4 hover:bg-[#1c1c1c] transition"
                    >
                      {stillSrc ? (
                        <img
                          src={stillSrc}
                          alt=""
                          className="w-full sm:w-40 shrink-0 h-24 object-cover rounded bg-[#181818]"
                        />
                      ) : (
                        <div className="w-full sm:w-40 shrink-0 h-24 rounded bg-[#181818] flex items-center justify-center text-xs text-gray-600">
                          No still
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <EpisodeTitleWithDetails ep={ep} epTitle={epTitle} />
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 mt-1">
                          {ep.air_date ? <span>{formatDateOnly(ep.air_date)}</span> : null}
                          {ep.runtime_minutes != null ? <span>{ep.runtime_minutes} min</span> : null}
                          {ep.rating > 0 ? (
                            <span>
                              ⭐ {Number(ep.rating).toFixed(1)}
                              {ep.num_votes > 0 ? ` (${ep.num_votes} votes)` : ""}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        )}

        <h2 className="text-2xl font-semibold mb-4">Rate & review</h2>
        <div className="bg-[#232323] rounded-lg p-6 mb-8 border border-[#333]">
          <p className="text-sm text-gray-400 mb-3">Your rating (1–10)</p>
          <div className="flex flex-wrap gap-2 mb-6">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => submitRating(n)}
                className={`min-w-[2.25rem] py-2 rounded text-sm font-semibold transition ${
                  rating === n ? "bg-[#e50914] text-white" : "bg-[#333] text-gray-200 hover:bg-[#444]"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <form onSubmit={submitReview} className="space-y-3">
            <textarea
              value={reviewContent}
              onChange={(e) => setReviewContent(e.target.value)}
              placeholder={user ? "Write a review…" : "Sign in to write a review"}
              disabled={!user}
              rows={4}
              className="w-full bg-[#333] px-4 py-3 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-[#e50914] disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!user}
              className="bg-[#e50914] text-white font-semibold px-6 py-2 rounded hover:bg-[#b20710] disabled:opacity-50"
            >
              Post review
            </button>
          </form>
        </div>

        <h2 className="text-2xl font-semibold mb-4">Reviews ({reviews.length})</h2>
        <div className="flex flex-col gap-4 mb-10">
          {reviews.length === 0 && <p className="text-gray-500">No reviews yet.</p>}
          {reviews.map((r) => (
            <div key={r.review_id} className="bg-[#232323] rounded-lg p-4 border border-[#333] flex gap-4">
              <div className="shrink-0">
                {r.profile_picture ? (
                  <img src={profileSrc(r.profile_picture)} alt="" className="w-12 h-12 rounded-full object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-[#444] flex items-center justify-center text-lg font-bold text-gray-300">
                    {r.username?.[0]?.toUpperCase() || "?"}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-baseline gap-2 mb-1">
                  <span className="font-semibold">{r.username}</span>
                  <span className="text-xs text-gray-500">
                    {r.posted_at ? new Date(r.posted_at).toLocaleString() : ""}
                  </span>
                </div>
                <p className="text-gray-300 whitespace-pre-wrap break-words">{r.content}</p>
                <div className="flex gap-4 mt-3 text-sm text-gray-400">
                  <button
                    type="button"
                    disabled={!user}
                    onClick={() => voteReview(r.review_id, "like")}
                    className="flex items-center gap-1 hover:text-white disabled:opacity-40"
                  >
                    <ThumbsUp className="w-4 h-4" /> {r.likes ?? 0}
                  </button>
                  <button
                    type="button"
                    disabled={!user}
                    onClick={() => voteReview(r.review_id, "dislike")}
                    className="flex items-center gap-1 hover:text-white disabled:opacity-40"
                  >
                    <ThumbsDown className="w-4 h-4" /> {r.dislikes ?? 0}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <h2 className="text-2xl font-semibold mb-4">Details</h2>
        <div className="bg-[#232323] rounded-lg shadow-lg p-6">
          <ul className="text-gray-300 space-y-3">
            <li>
              <span className="font-semibold text-white">Status: </span>
              {show.status || "N/A"}
            </li>
            <li>
              <span className="font-semibold text-white">Original language: </span>
              {show.original_language?.toUpperCase() || "N/A"}
            </li>
            <li>
              <span className="font-semibold text-white">Typical episode length: </span>
              {show.runtime != null ? `${show.runtime} min` : "N/A"}
            </li>
          </ul>
        </div>
      </div>

      {recommendations.length > 0 && (
        <div className="p-8">
          <h2 className="text-2xl font-semibold mb-4">You might also like…</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {recommendations.slice(0, 10).map((rec) => (
              <div key={rec.id} className="bg-[#232323] rounded-lg overflow-hidden hover:scale-[1.08] transition">
                <Link to={`/series/${rec.id}`}>
                  <img
                    src={catalogImageUrl(rec)}
                    className="w-full h-48 object-cover bg-[#181818]"
                    alt=""
                  />
                  <div className="p-2">
                    <h3 className="text-sm font-semibold">{rec.title}</h3>
                    <span className="text-xs text-gray-400">{formatDateOnly(rec.release_date)?.slice(0, 4) || ""}</span>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Seriespage;
