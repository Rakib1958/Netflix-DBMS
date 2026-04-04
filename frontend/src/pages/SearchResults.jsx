import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { searchCatalog } from "../lib/catalogApi";
import { catalogImageUrl } from "../lib/mediaUrls";
import { formatDateOnly } from "../lib/dateDisplay";

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
        const list = await searchCatalog(query, 40);
        if (cancelled) return;
        setResults(list);
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

      {loading && <p className="text-gray-400">Searching catalog…</p>}

      {!loading && !query && (
        <p className="text-gray-400">Type something in the search bar.</p>
      )}

      {!loading && query && results.length === 0 && (
        <p className="text-gray-400">No results in the database.</p>
      )}

      {!loading && results.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {results.slice(0, 24).map((m) => (
            <Link
              to={m.kind === "series" ? `/series/${m.id}` : `/movie/${m.id}`}
              key={m.id}
              className="bg-[#232323] rounded-lg overflow-hidden hover:scale-[1.08] transition"
            >
              <img
                src={catalogImageUrl(m) || undefined}
                alt=""
                className="w-full h-44 object-cover bg-[#181818]"
              />
              <div className="p-2">
                <p className="text-sm font-semibold text-white truncate">
                  {m.kind === "series" ? `${m.title || ""} · TV` : m.title || ""}
                </p>
                <p className="text-xs text-gray-500">{formatDateOnly(m.release_date) || ""}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default SearchResults;
