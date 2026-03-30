import { Play, Plus, Check, ThumbsUp, ThumbsDown } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { useAuthStore } from "../store/authStore";
import { toast } from "react-hot-toast";
import axios from "axios";
import { resolveImageUrl, youtubeKeyFromUrl } from "../lib/mediaUrls";
import { tmdbGet } from "../lib/tmdbClient";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const SITE_ORIGIN = API_URL.replace(/\/api\/?$/, "");

const Moviepage = () => {
  const { id } = useParams();
  const [movie, setMovie] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [trailerKey, setTrailerKey] = useState(null);

  const [reviews, setReviews] = useState([]);
  const [reviewContent, setReviewContent] = useState("");
  const [rating, setRating] = useState(0);
  const [mediaExtras, setMediaExtras] = useState({
    admin_metadata: null,
    poster_url: null,
    backdrop_url: null,
    trailer_url: null,
  });

  const { user, addToWatchlist, removeFromWatchlist } = useAuthStore();
  const isInWatchlist = user?.watchlist?.some((m) => m.id === parseInt(id) || m.id === id);

  const adminMeta = mediaExtras.admin_metadata;

  const posterSrc = useMemo(
    () => resolveImageUrl(movie?.poster_path, mediaExtras.poster_url),
    [movie, mediaExtras.poster_url]
  );
  const backdropSrc = useMemo(
    () => resolveImageUrl(movie?.backdrop_path, mediaExtras.backdrop_url),
    [movie, mediaExtras.backdrop_url]
  );
  const effectiveTrailerKey = useMemo(() => {
    const fromDb = youtubeKeyFromUrl(mediaExtras.trailer_url);
    return fromDb || trailerKey;
  }, [mediaExtras.trailer_url, trailerKey]);

  const handleWatchlistToggle = async () => {
    try {
      if (isInWatchlist) {
        await removeFromWatchlist(id);
        toast.success("Removed from watchlist");
      } else {
        await addToWatchlist(movie);
        toast.success("Added to watchlist");
      }
    } catch (error) {
      toast.error("An error occurred");
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [movieRes, recRes, vidRes] = await Promise.all([
          tmdbGet(`movie/${id}`, { language: "en-US" }),
          tmdbGet(`movie/${id}/recommendations`, { language: "en-US", page: 1 }),
          tmdbGet(`movie/${id}/videos`, { language: "en-US" }),
        ]);
        if (cancelled) return;
        setMovie(movieRes);
        setRecommendations(recRes?.results || []);
        const trailer = vidRes?.results?.find(
          (vid) => vid.site === "YouTube" && vid.type === "Trailer"
        );
        setTrailerKey(trailer?.key || null);
      } catch (err) {
        if (!cancelled) console.error(err);
      }
    })();

    axios
      .get(`${API_URL}/media/${id}/reviews`)
      .then((res) => setReviews(res.data.reviews || []))
      .catch(() => {});

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
      .catch(() =>
        setMediaExtras({
          admin_metadata: null,
          poster_url: null,
          backdrop_url: null,
          trailer_url: null,
        })
      );
    return () => {
      cancelled = true;
    };
  }, [id]);

  const submitRating = async (val) => {
    if (!user) return toast.error("Sign in to rate!");
    try {
      await axios.post(`${API_URL}/media/${id}/ratings`, { movie, rating: val });
      setRating(val);
      toast.success("Rating submitted");
    } catch {
      toast.error("Error rating");
    }
  };

  const submitReview = async (e) => {
    e.preventDefault();
    if (!user) return toast.error("Sign in to review!");
    try {
      const res = await axios.post(`${API_URL}/media/${id}/reviews`, { movie, content: reviewContent });
      setReviews(res.data.reviews);
      setReviewContent("");
      toast.success("Review posted");
    } catch (err) {
      toast.error(err.response?.data?.message || "Error posting review");
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

  if (!movie) {
    return (
      <div className="flex items-center justify-center h-screen">
        <span className="text-xl text-red-500">Loading...</span>
      </div>
    );
  }

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
        <div className="absolute inset-0 bg-gradient-to-t from-[#181818] via-transparent to-transparent"></div>

        <div className="relative z-10 flex items-end p-8 gap-8">
          {posterSrc && (
            <img src={posterSrc} alt="" className="rounded-lg shadow-lg w-48 hidden md:block object-cover aspect-[2/3]" />
          )}

          <div>
            <h1 className="text-4xl font-bold mb-2">{movie.title}</h1>
            <div className="flex items-center gap-4 mb-2">
              <span>⭐ {movie.vote_average?.toFixed(1)}</span>
              <span>{movie.release_date}</span>
              <span>{movie.runtime} min</span>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              {movie.genres?.map((genre) => (
                <span key={genre.id} className="bg-gray-800 px-3 py-1 rounded-full text-sm">
                  {genre.name}
                </span>
              ))}
            </div>
            <p className="max-w-2xl text-gray-200">{movie.overview}</p>
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
            <div className="flex flex-wrap gap-4 mt-2 md:mt-4">
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
              placeholder={user ? "Write a review (no profanity)…" : "Sign in to write a review"}
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
        <div className="bg-[#232323] rounded-lg shadow-lg p-6 flex flex-col md:flex-row gap-8">
          <div className="flex-1">
            <ul className="text-gray-300 space-y-3">
              <li>
                <span className="font-semibold text-white">Status: </span>
                <span className="ml-2">{movie.status}</span>
              </li>

              <li>
                <span className="font-semibold text-white">Release Date: </span>
                <span className="ml-2">{movie.release_date}</span>
              </li>

              <li>
                <span className="font-semibold text-white">Original Language:</span>
                <span className="ml-2">{movie.original_language?.toUpperCase()}</span>
              </li>

              <li>
                <span className="font-semibold text-white">Budget: </span>
                <span className="ml-2">{movie.budget ? `$${movie.budget.toLocaleString()}` : "N/A"}</span>
              </li>

              <li>
                <span className="font-semibold text-white">Revenue:</span>{" "}
                <span className="ml-2">{movie.revenue ? `$${movie.revenue.toLocaleString()}` : "N/A"}</span>
              </li>

              <li>
                <span className="font-semibold text-white">Production Companies:</span>
                <span className="ml-2">
                  {movie.production_companies?.length > 0
                    ? movie.production_companies.map((c) => c.name).join(", ")
                    : "N/A"}
                </span>
              </li>

              <li>
                <span className="font-semibold text-white">Countries:</span>
                <span className="ml-2">
                  {movie.production_countries?.length > 0
                    ? movie.production_countries.map((c) => c.name).join(", ")
                    : "N/A"}
                </span>
              </li>

              <li>
                <span className="font-semibold text-white">Spoken Languages:</span>
                <span className="ml-2">
                  {movie.spoken_languages?.length > 0
                    ? movie.spoken_languages.map((l) => l.english_name).join(", ")
                    : "N/A"}
                </span>
              </li>
            </ul>
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-white mb-2">Tagline</h3>
            <p className="italic text-gray-400 mb-6">{movie.tagline || "No tagline available."}</p>

            <h3 className="font-semibold text-white mb-2">Overview</h3>
            <p className="text-gray-200">{movie.overview}</p>
          </div>
        </div>
      </div>

      {recommendations.length > 0 && (
        <div className="p-8">
          <h2 className="text-2xl font-semibold mb-4">You might also like...</h2>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {recommendations.slice(0, 10).map((rec) => (
              <div key={rec.id} className="bg-[#232323] rounded-lg overflow-hidden hover:scale-[1.08] transition">
                <Link to={`/movie/${rec.id}`}>
                  <img
                    src={`https://image.tmdb.org/t/p/w300${rec.poster_path}`}
                    className="w-full h-48 object-cover"
                    alt=""
                  />
                  <div className="p-2">
                    <h3 className="text-sm font-semibold">{rec.title}</h3>
                    <span className="text-xs text-gray-400">{rec.release_date?.slice(0, 4)}</span>
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

export default Moviepage;
