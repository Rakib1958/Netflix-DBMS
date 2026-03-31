import { HelpCircle, LogOut, Search, Settings } from "lucide-react";
import Logo from "../assets/logo.png";
import { Link, useLocation, useNavigate } from "react-router";
import { useAuthStore } from "../store/authStore";
import { useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { tmdbGet } from "../lib/tmdbClient";

const Navbar = () => {
  const { user, logout } = useAuthStore();
  const [showMenu, setShowMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const menuIconRef = useRef(null);
  const menuPanelRef = useRef(null);
  const searchWrapRef = useRef(null);

  const dicebearUrl = user
    ? `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.username || "")}`
    : "";
  const initials = user?.username
    ? user.username
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase())
        .join("")
    : "U";
  const initialsFallback = `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"><rect width="80" height="80" rx="40" fill="#e50914"/><text x="40" y="48" text-anchor="middle" font-size="26" font-family="Arial, Helvetica, sans-serif" fill="#ffffff" font-weight="700">${initials}</text></svg>`
  )}`;
  const [avatarSrc, setAvatarSrc] = useState(user?.profilePic || dicebearUrl);

  useEffect(() => {
    setAvatarSrc(user?.profilePic || dicebearUrl);
  }, [user?.profilePic, dicebearUrl]);

  const avatarUrl = user?.profilePic || dicebearUrl;

  useEffect(() => {
    const handleMouseDown = (e) => {
      const target = e.target;

      if (showMenu) {
        const iconInside = menuIconRef.current?.contains(target);
        const panelInside = menuPanelRef.current?.contains(target);
        if (!iconInside && !panelInside) setShowMenu(false);
      }

      if (showSuggestions) {
        const insideSearch = searchWrapRef.current?.contains(target);
        if (!insideSearch) setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [showMenu, showSuggestions]);

  useEffect(() => {
    if (location.pathname.startsWith("/movie/")) {
      setSearchQuery("");
      setShowSuggestions(false);
    }
  }, [location.pathname]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q || q.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const data = await tmdbGet("search/movie", {
          query: q,
          include_adult: "false",
          language: "en-US",
          page: 1,
        });
        const list = data?.results || [];
        setSuggestions(list.slice(0, 7));
        setShowSuggestions(list.length > 0);
      } catch {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 350);

    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [searchQuery]);

  const handleLogout = async () => {
    const { message } = await logout();
    toast.success(message);
    setShowMenu(false);
  };

  return (
    <nav className="bg-black text-gray-200 flex justify-between items-center p-4 h-20 text-sm md:text-[15px] font-medium text-nowrap">
      <Link to={"/"}>
        <img
          src={Logo}
          alt="Logo"
          className="w-24 cursor-pointer brightness-125"
        />
      </Link>

      <ul className="hidden xl:flex space-x-6">
        <li className="cursor-pointer hover:text-[#e50914] transition hover:scale-[1.05] inline-flex items-center">
          <Link to="/">Home</Link>
        </li>
        <li className="cursor-pointer hover:text-[#e50914] transition hover:scale-[1.05] inline-flex items-center">
          <Link to="/browse/tv">Tv Shows</Link>
        </li>
        <li className="cursor-pointer hover:text-[#e50914] transition hover:scale-[1.05] inline-flex items-center">
          <Link to="/browse/movies">Movies</Link>
        </li>
        <li className="cursor-pointer hover:text-[#e50914] transition hover:scale-[1.05] inline-flex items-center">
          <Link to="/browse/anime">Anime</Link>
        </li>
        <li className="cursor-pointer hover:text-[#e50914] transition hover:scale-[1.05] inline-flex items-center">
          <Link to="/browse/popular">New & Popular</Link>
        </li>
        <li className="cursor-pointer hover:text-[#e50914] transition hover:scale-[1.05] inline-flex items-center">
          <Link to="/browse/upcoming">Upcoming</Link>
        </li>
      </ul>

        <div className="flex items-center space-x-4 relative">
        <div className="relative hidden md:inline-flex" ref={searchWrapRef}>
          <form
            className="relative"
            onSubmit={(e) => {
              e.preventDefault();
              const q = searchQuery.trim();
              if (!q) return;
              navigate(`/search?query=${encodeURIComponent(q)}`);
              setShowSuggestions(false);
            }}
          >
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-[#333333] px-4 py-2 rounded-full min-w-72 pr-10 outline-none"
              placeholder="Search..."
              onFocus={() => {
                if (suggestions.length > 0) setShowSuggestions(true);
              }}
            />
            <button
              type="submit"
              className="absolute top-2 right-4 w-7 h-7 flex items-center justify-center text-gray-200 hover:text-white"
              aria-label="Search"
            >
              <Search className="w-5 h-5" />
            </button>
          </form>

          {showSuggestions && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-[#232323] border border-[#333] rounded-lg shadow-lg z-[60] overflow-hidden">
              {suggestions.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setShowSuggestions(false);
                    setSearchQuery("");
                    navigate(`/movie/${m.id}`);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-[#1d1c1c] transition"
                >
                  {m.poster_path ? (
                    <img
                      src={`https://image.tmdb.org/t/p/w92${m.poster_path}`}
                      alt=""
                      className="w-10 h-14 object-cover rounded"
                    />
                  ) : (
                    <div className="w-10 h-14 rounded bg-[#181818]" />
                  )}
                  <div className="min-w-0 text-left">
                    <div className="text-sm text-white font-semibold truncate">
                      {m.title || m.original_title || m.name}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <Link to={user ? "/ai-recommendations" : "/signin"}>
          <button className="bg-[#e50914] px-5 py-2 text-white cursor-pointer transition hover:bg-[#b20710] hover:scale-[1.03]">
            Get AI Movie Picks
          </button>
        </Link>

        {!user ? (
          <Link to={"/signin"}>
            <button className="border border-[#333333] py-2 px-4 cursor-pointer transition hover:border-[#e50914] hover:text-white">
              Sign In
            </button>
          </Link>
        ) : (
          <div className="text-white">
            <img
              ref={menuIconRef}
              src={avatarSrc || avatarUrl}
              alt=""
              className="w-10 h-10 rounded-full border-2 border-[#e50914] cursor-pointer"
              onClick={() => setShowMenu(!showMenu)}
              onError={() => {
                if (avatarSrc !== dicebearUrl) setAvatarSrc(dicebearUrl);
                else setAvatarSrc(initialsFallback);
              }}
            />

            {showMenu && (
              <div
                ref={menuPanelRef}
                className="absolute right-0 mt-2 w-64 bg-[#232323] bg-opacity-95 rounded-lg z-50 shadow-lg py-4 px-3 flex flex-col gap-2 border border-[#333333]"
              >
                <div className="flex flex-col items-center mb-2">
                  <span className="text-white font-semibold text-base">
                    {user.username}
                  </span>
                  <span className="text-xs text-gray-400">{user.email}</span>
                </div>

                {user.role === 'admin' && (
                  <Link
                    to="/admin"
                    onClick={() => setShowMenu(false)}
                    className="flex items-center px-4 py-3 rounded-lg text-white bg-[#181818] hover:bg-[#1d1c1c] gap-3 cursor-pointer"
                  >
                    <Settings className="w-5 h-5 text-[#e50914]" />
                    Admin Panel
                  </Link>
                )}

                <Link
                  to="/help-center"
                  onClick={() => setShowMenu(false)}
                  className="flex items-center px-4 py-3 rounded-lg text-white bg-[#181818] hover:bg-[#1d1c1c] gap-3 cursor-pointer"
                >
                  <HelpCircle className="w-5 h-5" />
                  Help Center
                </Link>

                <Link
                  to="/watchlist"
                  onClick={() => setShowMenu(false)}
                  className="flex items-center px-4 py-3 rounded-lg text-white bg-[#181818] hover:bg-[#1d1c1c] gap-3 cursor-pointer"
                >
                  <Settings className="w-5 h-5" />
                  My Watchlist
                </Link>

                <Link
                  to="/profile"
                  onClick={() => setShowMenu(false)}
                  className="flex items-center px-4 py-3 rounded-lg text-white bg-[#181818] hover:bg-[#1d1c1c] gap-3 cursor-pointer"
                >
                  <Settings className="w-5 h-5" />
                  Settings
                </Link>

                <button
                  onClick={handleLogout}
                  className="flex items-center px-4 py-3 rounded-lg text-white bg-[#181818] hover:bg-[#1d1c1c] gap-3 cursor-pointer"
                >
                  <LogOut className="w-5 h-5" />
                  Log Out
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
