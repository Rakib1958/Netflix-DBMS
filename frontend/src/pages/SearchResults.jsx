import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { tmdbGet } from "../lib/tmdbClient";

const SearchResults = () => {
  const [searchParams] = useSearchParams();
  const query = (searchParams.get("query") || "").trim();

  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query) {
      setResults([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const data = await tmdbGet("search/movie", {
          query,
          include_adult: "false",
          language: "en-US",
          page: 1,
        });
        if (cancelled) return;
        setResults(data.results || []);
      } catch {
        if (cancelled) return;
        setResults([]);
      } finally {
        if (cancelled) return;
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [query]);

  return (
    <div className="p-5">
      <h1 className="pt-10 pb-5 text-2xl md:text-3xl text-white font-semibold">
        Search {query ? `: “${query}”` : ""}
      </h1>

      {loading && <p className="text-gray-400">Searching...</p>}

      {!loading && !query && (
        <p className="text-gray-400">Type something in the search bar.</p>
      )}

      {!loading && query && results.length === 0 && (
        <p className="text-gray-400">No results found.</p>
      )}

      {!loading && results.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {results.slice(0, 24).map((m) => (
            <Link
              to={`/movie/${m.id}`}
              key={m.id}
              className="bg-[#232323] rounded-lg overflow-hidden hover:scale-[1.08] transition"
            >
              <img
                src={`https://image.tmdb.org/t/p/w300/${m.poster_path || m.backdrop_path}`}
                alt=""
                className="w-full h-44 object-cover"
              />
              <div className="p-2">
                <p className="text-sm font-semibold text-white truncate">
                  {m.title || m.original_title || m.name || ""}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default SearchResults;

