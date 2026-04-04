import React, { useEffect, useState } from "react";
import { Link } from "react-router";
import { matchCatalogTitles } from "../lib/catalogApi";
import { catalogImageUrl } from "../lib/mediaUrls";
import { formatDateOnly } from "../lib/dateDisplay";

const RecommendedMovies = ({ movieTitles }) => {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadMovies = async () => {
      setLoading(true);
      try {
        const results = await matchCatalogTitles(movieTitles);
        setMovies(results);
      } catch {
        setMovies([]);
      }
      setLoading(false);
    };

    if (movieTitles?.length) {
      loadMovies();
    } else {
      setMovies([]);
      setLoading(false);
    }
  }, [movieTitles]);

  if (loading) {
    return <p className="text-gray-400">Loading matches from your catalog…</p>;
  }

  if (movies.length === 0) {
    return (
      <p className="text-gray-400 text-sm">
        No matching titles in your database yet. Add those movies in the admin panel to see them here.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {movies.map((movie) => (
        <Link
          to={movie.kind === "series" ? `/series/${movie.id}` : `/movie/${movie.id}`}
          key={movie.id}
          className="bg-[#232323] rounded-lg overflow-hidden"
        >
          <img
            src={catalogImageUrl(movie)}
            className="w-full h-48 object-cover bg-[#181818]"
            alt=""
          />

          <div className="p-2">
            <h3 className="text-sm font-semibold text-white truncate">{movie.title}</h3>
            <p className="text-xs text-gray-400">
              {movie.kind === "series" ? "TV · " : ""}
              {formatDateOnly(movie.release_date)?.slice(0, 4) || "N/A"}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
};

export default RecommendedMovies;
