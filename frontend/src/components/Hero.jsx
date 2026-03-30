import { Bookmark } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "react-hot-toast";
import { useAuthStore } from "../store/authStore";
import { isFutureReleaseDate, tmdbGet } from "../lib/tmdbClient";

const Hero = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const addToWatchlist = useAuthStore((s) => s.addToWatchlist);
  const [movies, setMovies] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [incomingIndex, setIncomingIndex] = useState(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const currentMovie = useMemo(() => movies[currentIndex] || null, [movies, currentIndex]);
  const incomingMovie = useMemo(
    () => (incomingIndex === null ? null : movies[incomingIndex] || null),
    [movies, incomingIndex]
  );

  const currentIndexRef = useRef(currentIndex);
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    (async () => {
      try {
        const res = await tmdbGet("movie/upcoming", { language: "en-US", page: 1 });
        const list = res?.results || [];
        if (list.length > 0) {
          setMovies(list);
          setCurrentIndex(Math.floor(Math.random() * list.length));
          setIncomingIndex(null);
          setIsTransitioning(false);
        }
      } catch (err) {
        if (err?.name !== "AbortError") console.error(err);
      }
    })();
    return () => {};
  }, []);

  // Rotate the hero movie every 5 seconds.
  useEffect(() => {
    if (!movies || movies.length <= 1) return;
    const t = setInterval(() => {
      if (isTransitioning) return;
      const nextIndex = (currentIndexRef.current + 1) % movies.length;
      setIncomingIndex(nextIndex);
      setIsTransitioning(true);
    }, 5000);

    return () => clearInterval(t);
  }, [movies, isTransitioning]);

  // Finish the transition and commit to the incoming movie.
  useEffect(() => {
    if (!isTransitioning || incomingIndex === null) return;
    const t = setTimeout(() => {
      setCurrentIndex(incomingIndex);
      setIncomingIndex(null);
      setIsTransitioning(false);
    }, 650);

    return () => clearTimeout(t);
  }, [incomingIndex, isTransitioning]);

  if (!currentMovie || !currentMovie.backdrop_path) {
    return <p className="text-white">Loading...</p>;
  }

  const handleSaveForLater = async (movie, e) => {
    e?.stopPropagation?.();
    if (!movie?.id) return;
    if (!user) {
      toast.error("Sign in to save titles to your watchlist.");
      navigate("/signin");
      return;
    }
    const already = user.watchlist?.some((m) => m && (m.id === movie.id || String(m.id) === String(movie.id)));
    if (already) {
      toast.success("Already in your watchlist.");
      return;
    }
    try {
      await addToWatchlist(movie);
      toast.success("Saved to watchlist.");
    } catch (err) {
      const msg = err.response?.data?.message || "Could not add to watchlist.";
      if (String(msg).toLowerCase().includes("already")) toast.success(msg);
      else toast.error(msg);
    }
  };

  const HeroLayer = ({ movie, layerClassName }) => (
    <div className={layerClassName}>
      <img
        src={`https://image.tmdb.org/t/p/original/${movie.backdrop_path || movie.poster_path}`}
        alt="bg-img"
        className="w-full h-[480px] object-center object-cover"
      />

      <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

      <div className="absolute bottom-3 left-4 md:bottom-10 md:left-10 right-4 md:right-auto">
        <h1 className="hero-title text-3xl md:text-5xl font-extrabold tracking-tight drop-shadow mb-3">
          {movie.original_title || movie.title || movie.name}
        </h1>

        <div className="flex space-x-2 md:space-x-4 font-medium">
          <button
            type="button"
            onClick={(e) => handleSaveForLater(movie, e)}
            className="flex justify-center items-center bg-white hover:bg-gray-200 text-[#e50914] py-3 px-4 rounded-full cursor-pointer text-sm md:text-base transition hover:scale-[1.03]"
          >
            <Bookmark className="mr-2 w-4 h-5 md:w-5 md:h-5" /> Save for Later
          </button>
          {isFutureReleaseDate(movie.release_date) ? (
            <button
              type="button"
              disabled
              className="flex justify-center items-center bg-[#e50914]/70 text-white py-3 px-4 rounded-full cursor-not-allowed text-sm md:text-base opacity-90"
              title={`Releases on ${movie.release_date}`}
            >
              Coming soon
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate(`/movie/${movie.id}`)}
              className="flex justify-center items-center bg-[#e50914] hover:bg-[#b20710] text-white py-3 px-4 rounded-full cursor-pointer text-sm md:text-base transition hover:scale-[1.03]"
            >
              Watch Now
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="text-white relative rounded-2xl overflow-hidden hero-swap h-[480px]">
      {currentMovie && (
        <HeroLayer
          movie={currentMovie}
          layerClassName={`hero-layer ${isTransitioning ? "hero-exit-left" : "hero-static"}`}
        />
      )}
      {incomingMovie && (
        <HeroLayer
          movie={incomingMovie}
          layerClassName="hero-layer hero-enter-right"
        />
      )}
    </div>
  );
};

export default Hero;
