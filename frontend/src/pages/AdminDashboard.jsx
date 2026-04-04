import React, { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "react-hot-toast";
import { useAuthStore } from "../store/authStore";
import { Users, MessageSquare, Film, Trash2, Pencil, Plus } from "lucide-react";
import { fetchMovieDetail } from "../lib/catalogApi";

axios.defaults.withCredentials = true;

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const emptyForm = () => ({
  title: "",
  plot_summary: "",
  release_date: "",
  release_year: "",
  runtime_minutes: "",
  original_language: "en",
  genres: "",
  poster_url: "",
  backdrop_url: "",
  trailer_url: "",
  tagline: "",
  box_office_worldwide: "",
  production_budget: "",
  aspect_ratio: "",
  awards: "",
  secondary_info: "",
});

const AdminDashboard = () => {
  const { user } = useAuthStore();
  const [usersList, setUsersList] = useState([]);
  const [reviewsList, setReviewsList] = useState([]);
  const [moviesList, setMoviesList] = useState([]);
  const [activeTab, setActiveTab] = useState("users");

  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [posterFile, setPosterFile] = useState(null);
  const [backdropFile, setBackdropFile] = useState(null);

  const fetchUsers = async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/users`);
      setUsersList(res.data.users);
    } catch {
      toast.error("Failed to load users");
    }
  };

  const fetchReviews = async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/reviews`);
      setReviewsList(res.data.reviews);
    } catch {
      toast.error("Failed to load reviews");
    }
  };

  const fetchMovies = async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/movies`);
      setMoviesList(res.data.movies || []);
    } catch {
      toast.error("Failed to load catalog");
    }
  };

  useEffect(() => {
    if (activeTab === "users") fetchUsers();
    if (activeTab === "reviews") fetchReviews();
    if (activeTab === "media") fetchMovies();
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

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm());
    setPosterFile(null);
    setBackdropFile(null);
  };

  const loadMovieForEdit = async (mediaId) => {
    try {
      const [detail, metaRes] = await Promise.all([
        fetchMovieDetail(mediaId),
        axios.get(`${API_URL}/media/${mediaId}/admin-meta`),
      ]);
      const meta = metaRes.data || {};
      const genres = (detail.genres || []).map((g) => g.name).join(", ");
      const am = meta.admin_metadata || {};
      setEditingId(mediaId);
      setForm({
        ...emptyForm(),
        title: detail.title || "",
        plot_summary: detail.overview || "",
        release_date: detail.release_date || "",
        release_year: detail.release_date ? detail.release_date.slice(0, 4) : "",
        runtime_minutes: detail.runtime != null ? String(detail.runtime) : "",
        original_language: detail.original_language || "",
        genres,
        poster_url: detail.poster_path || "",
        backdrop_url: detail.backdrop_path || "",
        trailer_url: meta.trailer_url || "",
        tagline: detail.tagline || "",
        box_office_worldwide: detail.revenue != null ? String(detail.revenue) : "",
        production_budget: detail.budget != null ? String(detail.budget) : "",
        aspect_ratio: "",
        awards: typeof am.awards === "string" ? am.awards : "",
        secondary_info: typeof am.secondary_info === "string" ? am.secondary_info : "",
      });
      setPosterFile(null);
      setBackdropFile(null);
    } catch {
      toast.error("Could not load movie");
    }
  };

  const buildPayloadBody = () => {
    const fd = new FormData();
    fd.append("title", form.title.trim());
    if (form.plot_summary) fd.append("plot_summary", form.plot_summary);
    if (form.release_date) fd.append("release_date", form.release_date);
    if (form.release_year) fd.append("release_year", form.release_year);
    if (form.runtime_minutes) fd.append("runtime_minutes", form.runtime_minutes);
    if (form.original_language) fd.append("original_language", form.original_language);
    if (form.trailer_url) fd.append("trailer_url", form.trailer_url);
    if (form.tagline) fd.append("tagline", form.tagline);
    if (form.box_office_worldwide) fd.append("box_office_worldwide", form.box_office_worldwide);
    if (form.production_budget) fd.append("production_budget", form.production_budget);
    if (form.aspect_ratio) fd.append("aspect_ratio", form.aspect_ratio);
    if (form.genres.trim()) fd.append("genres", form.genres.trim());
    if (form.poster_url && !posterFile) fd.append("poster_url", form.poster_url);
    if (form.backdrop_url && !backdropFile) fd.append("backdrop_url", form.backdrop_url);
    if (posterFile) fd.append("poster", posterFile);
    if (backdropFile) fd.append("backdrop", backdropFile);
    return fd;
  };

  const saveMovie = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return toast.error("Title is required");
    try {
      const fd = buildPayloadBody();
      if (editingId) {
        await axios.put(`${API_URL}/admin/movies/${editingId}`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        await axios.put(`${API_URL}/admin/media/${editingId}/custom`, {
          trailer_url: form.trailer_url.trim() || undefined,
          awards: form.awards.trim() || undefined,
          secondary_info: form.secondary_info.trim() || undefined,
        });
        toast.success("Movie updated");
      } else {
        const res = await axios.post(`${API_URL}/admin/movies`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        const newId = res.data?.media_id;
        if (newId) {
          await axios.put(`${API_URL}/admin/media/${newId}/custom`, {
            trailer_url: form.trailer_url.trim() || undefined,
            awards: form.awards.trim() || undefined,
            secondary_info: form.secondary_info.trim() || undefined,
          });
        }
        toast.success("Movie created");
      }
      resetForm();
      fetchMovies();
    } catch (err) {
      toast.error(err.response?.data?.message || "Save failed");
    }
  };

  const deleteMovie = async (mediaId) => {
    if (!window.confirm("Delete this movie from the catalog? Ratings and reviews will be removed.")) return;
    try {
      await axios.delete(`${API_URL}/admin/movies/${mediaId}`);
      toast.success("Deleted");
      if (editingId === mediaId) resetForm();
      fetchMovies();
    } catch {
      toast.error("Delete failed");
    }
  };

  if (!user || user.role !== "admin")
    return <div className="text-white mt-32 text-center text-3xl">Access Denied</div>;

  return (
    <div className="min-h-screen bg-[#141414] text-white pt-24 px-8 md:px-24">
      <h1 className="text-3xl font-bold mb-8">Admin Control Panel</h1>

      <div className="flex flex-wrap gap-4 mb-8">
        <button
          type="button"
          onClick={() => setActiveTab("users")}
          className={`flex items-center gap-2 px-6 py-3 rounded font-semibold transition ${activeTab === "users" ? "bg-[#e50914]" : "bg-[#232323] hover:bg-[#333]"}`}
        >
          <Users className="w-5 h-5" /> Manage Users
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("reviews")}
          className={`flex items-center gap-2 px-6 py-3 rounded font-semibold transition ${activeTab === "reviews" ? "bg-[#e50914]" : "bg-[#232323] hover:bg-[#333]"}`}
        >
          <MessageSquare className="w-5 h-5" /> Moderation
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("media")}
          className={`flex items-center gap-2 px-6 py-3 rounded font-semibold transition ${activeTab === "media" ? "bg-[#e50914]" : "bg-[#232323] hover:bg-[#333]"}`}
        >
          <Film className="w-5 h-5" /> Movie catalog
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
                    {u.role === "admin" && (
                      <span className="ml-4 bg-red-900 text-red-100 text-xs px-2 py-1 rounded">Admin</span>
                    )}
                    {!u.is_verified && (
                      <span className="ml-4 bg-yellow-900 text-yellow-100 text-xs px-2 py-1 rounded">
                        Unverified
                      </span>
                    )}
                    {u.is_banned && (
                      <span className="ml-4 bg-orange-900 text-orange-100 text-xs px-2 py-1 rounded">
                        Banned
                        {u.banned_until ? ` until ${new Date(u.banned_until).toLocaleString()}` : " (permanent)"}
                      </span>
                    )}
                  </div>
                  {u.role !== "admin" && (
                    <div className="flex items-center gap-2">
                      {u.is_banned ? (
                        <button
                          type="button"
                          onClick={() => setBan(u.user_id, { banned: false })}
                          className="bg-orange-700 px-3 py-2 rounded hover:bg-orange-600 text-xs font-semibold"
                        >
                          Unban
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => setBan(u.user_id, { durationDays: 7 })}
                            className="bg-orange-700 px-3 py-2 rounded hover:bg-orange-600 text-xs font-semibold"
                          >
                            Ban 7d
                          </button>
                          <button
                            type="button"
                            onClick={() => setBan(u.user_id, { permanent: true })}
                            className="bg-orange-800 px-3 py-2 rounded hover:bg-orange-700 text-xs font-semibold"
                          >
                            Ban ∞
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => deleteUser(u.user_id)}
                        className="bg-red-600 p-2 rounded hover:bg-red-700"
                      >
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
                    <p className="text-gray-300">&quot;{r.content}&quot;</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteReview(r.review_id)}
                    className="text-red-500 hover:text-red-400 p-2"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "media" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
            <div>
              <h2 className="text-xl font-bold mb-2">{editingId ? "Edit movie" : "Add movie"}</h2>
              <p className="text-gray-400 text-sm mb-6">
                Titles, posters, and metadata are stored in PostgreSQL (Media + Movie + Genre). Optional image
                files are saved under <code className="text-gray-300">/uploads</code>.
              </p>
              <form onSubmit={saveMovie} className="flex flex-col gap-4 max-w-lg">
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Title *"
                  className="w-full bg-[#333] px-4 py-2 rounded focus:outline-none focus:ring-1 focus:ring-[#e50914]"
                  required
                />
                <textarea
                  value={form.plot_summary}
                  onChange={(e) => setForm((f) => ({ ...f, plot_summary: e.target.value }))}
                  placeholder="Plot summary"
                  rows={4}
                  className="w-full bg-[#333] px-4 py-2 rounded focus:outline-none resize-y"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={form.release_date}
                    onChange={(e) => setForm((f) => ({ ...f, release_date: e.target.value }))}
                    className="w-full bg-[#333] px-4 py-2 rounded"
                  />
                  <input
                    type="text"
                    value={form.runtime_minutes}
                    onChange={(e) => setForm((f) => ({ ...f, runtime_minutes: e.target.value }))}
                    placeholder="Runtime (minutes)"
                    className="w-full bg-[#333] px-4 py-2 rounded"
                  />
                </div>
                <input
                  type="text"
                  value={form.genres}
                  onChange={(e) => setForm((f) => ({ ...f, genres: e.target.value }))}
                  placeholder="Genres (comma-separated, e.g. Action, Sci-Fi)"
                  className="w-full bg-[#333] px-4 py-2 rounded"
                />
                <input
                  type="text"
                  value={form.original_language}
                  onChange={(e) => setForm((f) => ({ ...f, original_language: e.target.value }))}
                  placeholder="Language code (en, ko, …)"
                  className="w-full bg-[#333] px-4 py-2 rounded"
                />
                <input
                  type="text"
                  value={form.tagline}
                  onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))}
                  placeholder="Tagline"
                  className="w-full bg-[#333] px-4 py-2 rounded"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={form.poster_url}
                    onChange={(e) => setForm((f) => ({ ...f, poster_url: e.target.value }))}
                    placeholder="Poster URL (optional if uploading file)"
                    className="w-full bg-[#333] px-4 py-2 rounded text-sm"
                  />
                  <input
                    type="text"
                    value={form.backdrop_url}
                    onChange={(e) => setForm((f) => ({ ...f, backdrop_url: e.target.value }))}
                    placeholder="Backdrop URL"
                    className="w-full bg-[#333] px-4 py-2 rounded text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-gray-400">
                    Poster file
                    <input
                      type="file"
                      accept="image/*"
                      className="block w-full text-sm mt-1"
                      onChange={(e) => setPosterFile(e.target.files?.[0] || null)}
                    />
                  </label>
                  <label className="text-xs text-gray-400">
                    Backdrop file
                    <input
                      type="file"
                      accept="image/*"
                      className="block w-full text-sm mt-1"
                      onChange={(e) => setBackdropFile(e.target.files?.[0] || null)}
                    />
                  </label>
                </div>
                <input
                  type="text"
                  value={form.trailer_url}
                  onChange={(e) => setForm((f) => ({ ...f, trailer_url: e.target.value }))}
                  placeholder="Trailer (YouTube URL)"
                  className="w-full bg-[#333] px-4 py-2 rounded"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={form.production_budget}
                    onChange={(e) => setForm((f) => ({ ...f, production_budget: e.target.value }))}
                    placeholder="Production budget (USD)"
                    className="w-full bg-[#333] px-4 py-2 rounded text-sm"
                  />
                  <input
                    type="text"
                    value={form.box_office_worldwide}
                    onChange={(e) => setForm((f) => ({ ...f, box_office_worldwide: e.target.value }))}
                    placeholder="Box office (USD)"
                    className="w-full bg-[#333] px-4 py-2 rounded text-sm"
                  />
                </div>
                <textarea
                  value={form.awards}
                  onChange={(e) => setForm((f) => ({ ...f, awards: e.target.value }))}
                  placeholder="Awards (stored in admin_metadata)"
                  rows={2}
                  className="w-full bg-[#333] px-4 py-2 rounded"
                />
                <textarea
                  value={form.secondary_info}
                  onChange={(e) => setForm((f) => ({ ...f, secondary_info: e.target.value }))}
                  placeholder="Editorial / secondary info"
                  rows={2}
                  className="w-full bg-[#333] px-4 py-2 rounded"
                />
                <div className="flex gap-2 flex-wrap">
                  <button
                    type="submit"
                    className="bg-[#e50914] px-6 py-2 rounded font-semibold flex items-center gap-2"
                  >
                    {editingId ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    {editingId ? "Update" : "Create"}
                  </button>
                  {editingId && (
                    <button type="button" onClick={resetForm} className="bg-[#333] px-6 py-2 rounded">
                      Cancel edit
                    </button>
                  )}
                </div>
              </form>
            </div>

            <div>
              <h2 className="text-xl font-bold mb-4">Catalog ({moviesList.length})</h2>
              <div className="flex flex-col gap-2 max-h-[70vh] overflow-y-auto pr-2">
                {moviesList.map((m) => (
                  <div
                    key={m.media_id}
                    className="flex justify-between items-center bg-[#232323] p-3 rounded gap-2"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{m.title}</p>
                      <p className="text-xs text-gray-500 font-mono truncate">{m.media_id}</p>
                      {m.media_type === "series" && (
                        <span className="text-xs text-blue-300">TV series</span>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => loadMovieForEdit(m.media_id)}
                        className="p-2 bg-[#333] rounded hover:bg-[#444]"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteMovie(m.media_id)}
                        className="p-2 bg-red-900/50 rounded hover:bg-red-800"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
