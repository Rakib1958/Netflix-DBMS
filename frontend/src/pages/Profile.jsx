import React, { useState, useEffect } from "react";
import { useAuthStore } from "../store/authStore";
import { toast } from "react-hot-toast";
import { Settings, User, Mail, Lock, Camera, Calendar, Globe, Shield } from "lucide-react";

const fmtTs = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString();
};

const Profile = () => {
  const { user, updateProfile, uploadProfilePic, isLoading } = useAuthStore();
  const [username, setUsername] = useState(user?.username || "");
  const [email, setEmail] = useState(user?.email || "");
  const [password, setPassword] = useState("");
  const [birthDate, setBirthDate] = useState(
    user?.birth_date ? String(user.birth_date).slice(0, 10) : ""
  );
  const [countryCode, setCountryCode] = useState(user?.country_code || "");
  const fileInputRef = React.useRef(null);

  useEffect(() => {
    if (!user) return;
    setUsername(user.username || "");
    setEmail(user.email || "");
    setBirthDate(user.birth_date ? String(user.birth_date).slice(0, 10) : "");
    setCountryCode(user.country_code || "");
  }, [user?._id, user?.birth_date, user?.country_code, user?.username, user?.email]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await updateProfile({
        username,
        email,
        password: password || undefined,
        birth_date: birthDate || null,
        country_code: countryCode.trim() ? countryCode.trim().toUpperCase() : null,
      });
      toast.success("Profile updated!");
      setPassword("");
    } catch (error) {
      toast.error(error.response?.data?.message || "Update failed");
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("profilePic", file);

    try {
      await uploadProfilePic(formData);
      toast.success("Profile picture updated!");
    } catch (error) {
      toast.error(error.response?.data?.message || "Upload failed");
    }
  };

  const avatarUrl = user?.profilePic || (user
    ? `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.username)}`
    : "");

  return (
    <div className="min-h-screen bg-[#141414] text-white pt-24 px-8 md:px-24">
      <div className="max-w-2xl mx-auto bg-[#181818] p-8 rounded-lg border border-[#333333]">
        <h1 className="text-3xl font-bold mb-8 flex items-center gap-3">
          <Settings className="w-8 h-8 text-[#e50914]" /> Profile Settings
        </h1>

        <div className="flex flex-col items-center mb-10">
          <div className="relative">
            <img src={avatarUrl} alt="Avatar" className="w-32 h-32 rounded-full border-4 border-[#e50914] mb-4 object-cover" />
            <input 
              type="file" 
              accept="image/*" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleImageUpload} 
            />
            <button 
              type="button"
              onClick={() => fileInputRef.current.click()}
              className="absolute bottom-2 right-2 bg-[#e50914] p-2 rounded-full hover:scale-110 transition cursor-pointer"
            >
              <Camera className="w-5 h-5" />
            </button>
          </div>
          <p className="text-gray-400 text-sm">Personalize your profile</p>
        </div>

        <div className="mb-8 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-gray-400 border border-[#333] rounded-lg p-4 bg-[#141414]/50">
          <div>
            <span className="flex items-center gap-2 text-gray-500 mb-1">
              <Shield className="w-4 h-4" /> Role
            </span>
            <p className="text-white font-medium capitalize">{user?.role || "—"}</p>
          </div>
          <div>
            <span className="flex items-center gap-2 text-gray-500 mb-1">
              <Calendar className="w-4 h-4" /> Member since
            </span>
            <p className="text-white font-medium">{fmtTs(user?.registered_at)}</p>
          </div>
          <div>
            <span className="flex items-center gap-2 text-gray-500 mb-1">
              <Calendar className="w-4 h-4" /> Last login
            </span>
            <p className="text-white font-medium">{fmtTs(user?.last_login)}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-400">Username</label>
            <div className="relative">
              <User className="absolute left-3 top-3 w-5 h-5 text-gray-500" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-[#333333] pl-12 pr-4 py-3 rounded outline-none focus:ring-2 focus:ring-[#e50914]"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-400">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 w-5 h-5 text-gray-500" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#333333] pl-12 pr-4 py-3 rounded outline-none focus:ring-2 focus:ring-[#e50914]"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-400">Birth date</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-3 w-5 h-5 text-gray-500" />
              <input
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="w-full bg-[#333333] pl-12 pr-4 py-3 rounded outline-none focus:ring-2 focus:ring-[#e50914] text-white [color-scheme:dark]"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-400">Country (ISO 3166-1 alpha-2)</label>
            <div className="relative">
              <Globe className="absolute left-3 top-3 w-5 h-5 text-gray-500" />
              <input
                type="text"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2))}
                maxLength={2}
                placeholder="e.g. US, BD"
                className="w-full bg-[#333333] pl-12 pr-4 py-3 rounded outline-none focus:ring-2 focus:ring-[#e50914] uppercase placeholder:normal-case"
              />
            </div>
            <p className="text-xs text-gray-500">Two-letter code as in your database schema (CHAR(2)). Leave empty to clear.</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-400">New Password (leave blank to keep current)</label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 w-5 h-5 text-gray-500" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#333333] pl-12 pr-4 py-3 rounded outline-none focus:ring-2 focus:ring-[#e50914]"
                placeholder="********"
              />
            </div>
          </div>

          <button
            disabled={isLoading}
            className="w-full bg-[#e50914] py-3 rounded font-bold hover:bg-[#b20710] transition disabled:opacity-50"
          >
            {isLoading ? "Saving Changes..." : "Update Profile"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Profile;
