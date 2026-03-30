import React from "react";
import { useAuthStore } from "../store/authStore";
import { Link } from "react-router";
import { Trash2, Film } from "lucide-react";
import { toast } from "react-hot-toast";

const Watchlist = () => {
  const { user, removeFromWatchlist } = useAuthStore();
  const watchlist = user?.watchlist || [];

  const handleRemove = async (movieId) => {
    try {
      await removeFromWatchlist(movieId);
      toast.success("Removed from watchlist");
    } catch (error) {
      toast.error("Failed to remove movie");
    }
  };

  return (
    <div className="min-h-screen bg-[#141414] text-white pt-24 px-8 md:px-24">
      <h1 className="text-3xl font-bold mb-8 flex items-center gap-3">
        <Film className="w-8 h-8 text-[#e50914]" /> My Watchlist
      </h1>

      {watchlist.length === 0 ? (
        <div className="text-center py-20 bg-[#181818] rounded-xl border border-[#333333]">
          <Film className="w-16 h-16 mx-auto mb-4 text-gray-600" />
          <p className="text-xl text-gray-400">Your watchlist is empty.</p>
          <Link to="/" className="text-[#e50914] hover:underline mt-4 inline-block">
            Browse movies to add some!
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {watchlist.map((movie) => (
            <div key={movie.id} className="relative group bg-[#181818] rounded-lg overflow-hidden border border-[#333333] hover:scale-[1.08] transition duration-300">
              <Link to={`/movie/${movie.id}`}>
                <img
                  src={`https://image.tmdb.org/t/p/w500/${movie.backdrop_path || movie.poster_path}`}
                  alt={movie.title}
                  className="h-40 w-full object-cover"
                />
                <div className="p-3">
                  <p className="text-sm font-medium truncate">{movie.title || movie.original_title}</p>
                  <p className="text-xs text-gray-400">{movie.release_date?.split("-")[0]}</p>
                </div>
              </Link>
              <button
                onClick={() => handleRemove(movie.id)}
                className="absolute top-2 right-2 bg-black bg-opacity-70 p-2 rounded-full text-white hover:text-[#e50914] transition"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Watchlist;
