import React, { useEffect, useState } from "react";
import { Link } from "react-router";
import { tmdbGet } from "../lib/tmdbClient";

const RecommendedMovies = ({ movieTitles }) => {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchMovie = async (title) => {
    try {
      const data = await tmdbGet("search/movie", {
        query: title,
        include_adult: "false",
        language: "en-US",
        page: 1,
      });
      return data.results?.[0] || null;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    const loadMovies = async () => {
      setLoading(true);
      const results = await Promise.all(
        movieTitles.map((title) => fetchMovie(title))
      );
      setMovies(results.filter(Boolean));
      setLoading(false);
    };

    if (movieTitles?.length) {
      loadMovies();
    }
  }, [movieTitles]);

  if (loading) {
    return <p>Loading...</p>;
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {movies.map((movie) => (
        <Link
          to={`/movie/${movie.id}`}
          key={movie.id}
          className="bg-[#232323] rounded-lg overflow-hidden"
        >
          {movie.poster_path ? (
            <img
              src={`https://image.tmdb.org/t/p/w300${movie.poster_path}`}
              className="w-full h-48 object-cover"
            />
          ) : (
            <>No Image</>
          )}

          <div className="p-2">
            <h3 className="text-sm font-semibold text-white truncate">
              {movie.title}
            </h3>
            <p className="text-xs text-gray-400">
              {movie.release_date ? movie.release_date.slice(0, 4) : "N/A"}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
};

export default RecommendedMovies;
