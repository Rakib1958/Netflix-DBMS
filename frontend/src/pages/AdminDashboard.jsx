import React, { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "react-hot-toast";
import { useAuthStore } from "../store/authStore";
import { Users, MessageSquare, Edit3, Trash2 } from "lucide-react";
import { tmdbGet } from "../lib/tmdbClient";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const AdminDashboard = () => {
  const { user } = useAuthStore();
  const [usersList, setUsersList] = useState([]);
  const [reviewsList, setReviewsList] = useState([]);
  const [activeTab, setActiveTab] = useState("users");

  // Custom movie fields
  const [tmdbId, setTmdbId] = useState("");
  const [posterUrl, setPosterUrl] = useState("");
  const [backdropUrl, setBackdropUrl] = useState("");
  const [trailerUrl, setTrailerUrl] = useState("");
  const [awards, setAwards] = useState("");
  const [secondaryInfo, setSecondaryInfo] = useState("");
  
  const [movieStub, setMovieStub] = useState(null);

  const fetchUsers = async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/users`);
      setUsersList(res.data.users);
    } catch (err) {
      toast.error("Failed to load users");
    }
  };

  const fetchReviews = async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/reviews`);
      setReviewsList(res.data.reviews);
    } catch (err) {
      toast.error("Failed to load reviews");
    }
  };

  useEffect(() => {
    if (activeTab === "users") fetchUsers();
    if (activeTab === "reviews") fetchReviews();
  }, [activeTab]);

  const deleteUser = async (id) => {
    if (!window.confirm("Are you sure?")) return;
    try {
      await axios.delete(`${API_URL}/admin/users/${id}`);
      toast.success("User deleted");
      fetchUsers();
    } catch {
      toast.error("Error deleting user");
    }
  };

  const setBan = async (id, payload) => {
    try {
      const res = await axios.patch(`${API_URL}/admin/users/${id}/ban`, payload);
      toast.success(res.data?.message || "Updated");
      fetchUsers();
    } catch {
      toast.error("Failed to update ban status");
    }
  };

  const deleteReview = async (id) => {
    if (!window.confirm("Delete this review?")) return;
    try {
      await axios.delete(`${API_URL}/admin/reviews/${id}`);
      toast.success("Review deleted");
      fetchReviews();
    } catch {
      toast.error("Error deleting review");
    }
  };

  const verifyTmdb = async () => {
    if (!tmdbId) return;
    try {
      const data = await tmdbGet(`movie/${tmdbId}`, { language: "en-US" });
      if (data.id) {
          setMovieStub(data);
          toast.success(`Found: ${data.title}`);
      } else {
          toast.error("Movie not found on TMDB");
      }
    } catch {
      toast.error("Error fetching");
    }
  };

  const updateMediaCustoms = async () => {
    if(!movieStub) return toast.error("Find movie first");
    try {
      await axios.put(`${API_URL}/admin/media/${tmdbId}/custom`, {
          movie: movieStub,
          poster_url: posterUrl || undefined,
          backdrop_url: backdropUrl || undefined,
          trailer_url: trailerUrl || undefined,
          awards: awards.trim() || undefined,
          secondary_info: secondaryInfo.trim() || undefined,
      });
      toast.success("Custom details added successfully");
      setTmdbId("");
      setPosterUrl("");
      setBackdropUrl("");
      setTrailerUrl("");
      setAwards("");
      setSecondaryInfo("");
      setMovieStub(null);
    } catch {
      toast.error("Failed to add custom details");
    }
  };

  if(!user || user.role !== 'admin') return <div className="text-white mt-32 text-center text-3xl">Access Denied</div>;

  return (
    <div className="min-h-screen bg-[#141414] text-white pt-24 px-8 md:px-24">
      <h1 className="text-3xl font-bold mb-8">Admin Control Panel</h1>
      
      <div className="flex gap-4 mb-8">
        <button 
          onClick={() => setActiveTab("users")} 
          className={`flex items-center gap-2 px-6 py-3 rounded font-semibold transition ${activeTab === "users" ? "bg-[#e50914]" : "bg-[#232323] hover:bg-[#333]"}`}
        >
          <Users className="w-5 h-5" /> Manage Users
        </button>
        <button 
          onClick={() => setActiveTab("reviews")} 
          className={`flex items-center gap-2 px-6 py-3 rounded font-semibold transition ${activeTab === "reviews" ? "bg-[#e50914]" : "bg-[#232323] hover:bg-[#333]"}`}
        >
          <MessageSquare className="w-5 h-5" /> Moderation
        </button>
        <button 
          onClick={() => setActiveTab("media")} 
          className={`flex items-center gap-2 px-6 py-3 rounded font-semibold transition ${activeTab === "media" ? "bg-[#e50914]" : "bg-[#232323] hover:bg-[#333]"}`}
        >
          <Edit3 className="w-5 h-5" /> Custom Media Data
        </button>
      </div>

      <div className="bg-[#181818] rounded-xl p-6 border border-[#333]">
        {activeTab === "users" && (
          <div>
            <h2 className="text-xl font-bold mb-4">Registered Users</h2>
            <div className="flex flex-col gap-3">
              {usersList.map((u) => (
                <div key={u.user_id} className="flex justify-between items-center bg-[#232323] p-4 rounded">
                  <div>
                    <span className="font-semibold text-lg mr-4">{u.username}</span>
                    <span className="text-sm text-gray-400">{u.email}</span>
                    {u.role === 'admin' && <span className="ml-4 bg-red-900 text-red-100 text-xs px-2 py-1 rounded">Admin</span>}
                    {!u.is_verified && <span className="ml-4 bg-yellow-900 text-yellow-100 text-xs px-2 py-1 rounded">Unverified</span>}
                    {u.is_banned && (
                      <span className="ml-4 bg-orange-900 text-orange-100 text-xs px-2 py-1 rounded">
                        Banned{u.banned_until ? ` until ${new Date(u.banned_until).toLocaleString()}` : " (permanent)"}
                      </span>
                    )}
                  </div>
                  {u.role !== 'admin' && (
                      <div className="flex items-center gap-2">
                        {u.is_banned ? (
                          <button
                            type="button"
                            onClick={() => setBan(u.user_id, { banned: false })}
                            className="bg-orange-700 px-3 py-2 rounded hover:bg-orange-600 text-xs font-semibold"
                            title="Lift ban"
                          >
                            Unban
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => setBan(u.user_id, { durationDays: 1 })}
                              className="bg-orange-700 px-3 py-2 rounded hover:bg-orange-600 text-xs font-semibold"
                              title="Ban for 1 day"
                            >
                              Ban 1d
                            </button>
                            <button
                              type="button"
                              onClick={() => setBan(u.user_id, { durationDays: 7 })}
                              className="bg-orange-700 px-3 py-2 rounded hover:bg-orange-600 text-xs font-semibold"
                              title="Ban for 7 days"
                            >
                              Ban 7d
                            </button>
                            <button
                              type="button"
                              onClick={() => setBan(u.user_id, { permanent: true })}
                              className="bg-orange-800 px-3 py-2 rounded hover:bg-orange-700 text-xs font-semibold"
                              title="Permanent ban"
                            >
                              Ban ∞
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const hours = window.prompt("Ban duration in hours (e.g. 12):", "24");
                                if (!hours) return;
                                const n = Number(hours);
                                if (!Number.isFinite(n) || n <= 0) return toast.error("Invalid number of hours");
                                setBan(u.user_id, { durationHours: n });
                              }}
                              className="bg-[#2c2c2c] px-3 py-2 rounded hover:bg-[#3a3a3a] text-xs font-semibold"
                              title="Custom ban duration"
                            >
                              Custom
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const until = window.prompt("Ban until (ISO date/time), e.g. 2026-04-01T12:00:00Z");
                                if (!until) return;
                                setBan(u.user_id, { until });
                              }}
                              className="bg-[#2c2c2c] px-3 py-2 rounded hover:bg-[#3a3a3a] text-xs font-semibold"
                              title="Ban until a date/time"
                            >
                              Until…
                            </button>
                          </>
                        )}
                        <button onClick={() => deleteUser(u.user_id)} className="bg-red-600 p-2 rounded hover:bg-red-700">
                            <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "reviews" && (
          <div>
            <h2 className="text-xl font-bold mb-4">Moderate Content</h2>
            <div className="flex flex-col gap-4">
              {reviewsList.map((r) => (
                <div key={r.review_id} className="bg-[#232323] p-4 rounded flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-[#e50914] text-sm mb-1">{r.title}</h4>
                    <span className="text-xs text-gray-500 mb-2 block">Posted by {r.username}</span>
                    <p className="text-gray-300">"{r.content}"</p>
                  </div>
                  <button onClick={() => deleteReview(r.review_id)} className="text-red-500 hover:text-red-400 p-2">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "media" && (
          <div className="max-w-xl">
            <h2 className="text-xl font-bold mb-4">Override TMDB Data</h2>
            <p className="text-gray-400 text-sm mb-6">If TMDB is missing a trailer or poster, you can inject it directly into our PostgreSQL Database. Our app prefers DB values over TMDB values.</p>
            
            <div className="flex gap-2 mb-6">
                <input 
                    type="text" 
                    value={tmdbId} onChange={e=>setTmdbId(e.target.value)} 
                    placeholder="Enter TMDB ID" 
                    className="w-full bg-[#333] px-4 py-2 rounded focus:outline-none focus:ring-1 focus:ring-[#e50914]"
                />
                <button onClick={verifyTmdb} className="bg-[#e50914] px-4 py-2 rounded font-semibold text-nowrap">Find Movie</button>
            </div>

            {movieStub && (
              <div className="flex flex-col gap-4">
                  <div className="bg-[#232323] p-3 rounded text-sm text-green-400">Selected: {movieStub.title}</div>
                  
                  <div>
                      <label className="text-sm text-gray-400 mb-1 block">Custom Poster URL (Overrides TMDB)</label>
                      <input 
                          type="text" 
                          value={posterUrl} onChange={e=>setPosterUrl(e.target.value)} 
                          placeholder="https://imgur.com/your-custom-poster.jpg" 
                          className="w-full bg-[#333] px-4 py-2 rounded focus:outline-none"
                      />
                  </div>

                  <div>
                      <label className="text-sm text-gray-400 mb-1 block">Custom Backdrop URL (Overrides TMDB)</label>
                      <input
                          type="text"
                          value={backdropUrl}
                          onChange={(e) => setBackdropUrl(e.target.value)}
                          placeholder="https://... or path starting with /"
                          className="w-full bg-[#333] px-4 py-2 rounded focus:outline-none"
                      />
                  </div>

                  <div>
                      <label className="text-sm text-gray-400 mb-1 block">Custom Trailer URL (YouTube link)</label>
                      <input 
                          type="text" 
                          value={trailerUrl} onChange={e=>setTrailerUrl(e.target.value)} 
                          placeholder="https://youtube.com/watch?v=..." 
                          className="w-full bg-[#333] px-4 py-2 rounded focus:outline-none"
                      />
                  </div>

                  <div>
                      <label className="text-sm text-gray-400 mb-1 block">Awards &amp; recognition (shown on movie page)</label>
                      <textarea
                          value={awards}
                          onChange={(e) => setAwards(e.target.value)}
                          placeholder="e.g. Academy Award for Best Picture (2020)"
                          rows={3}
                          className="w-full bg-[#333] px-4 py-2 rounded focus:outline-none resize-y"
                      />
                  </div>

                  <div>
                      <label className="text-sm text-gray-400 mb-1 block">Secondary info / editorial notes</label>
                      <textarea
                          value={secondaryInfo}
                          onChange={(e) => setSecondaryInfo(e.target.value)}
                          placeholder="Extra context, trivia, or curated notes"
                          rows={3}
                          className="w-full bg-[#333] px-4 py-2 rounded focus:outline-none resize-y"
                      />
                  </div>

                  <button onClick={updateMediaCustoms} className="bg-white text-black font-bold py-3 mt-4 rounded hover:bg-gray-200 transition">Save Overrides to Database</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
