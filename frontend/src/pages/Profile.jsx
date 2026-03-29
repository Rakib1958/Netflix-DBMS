import React, { useState } from "react";
import { useAuthStore } from "../store/authStore";
import { toast } from "react-hot-toast";
import { Settings, User, Mail, Lock, Camera } from "lucide-react";

const Profile = () => {
  const { user, updateProfile, isLoading } = useAuthStore();
  const [username, setUsername] = useState(user?.username || "");
  const [email, setEmail] = useState(user?.email || "");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await updateProfile({ username, email, password: password || undefined });
      toast.success("Profile updated!");
      setPassword("");
    } catch (error) {
      toast.error(error.response?.data?.message || "Update failed");
    }
  };

  const avatarUrl = user
    ? `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.username)}`
    : "";

  return (
    <div className="min-h-screen bg-[#141414] text-white pt-24 px-8 md:px-24">
      <div className="max-w-2xl mx-auto bg-[#181818] p-8 rounded-lg border border-[#333333]">
        <h1 className="text-3xl font-bold mb-8 flex items-center gap-3">
          <Settings className="w-8 h-8 text-[#e50914]" /> Profile Settings
        </h1>

        <div className="flex flex-col items-center mb-10">
          <div className="relative">
            <img src={avatarUrl} alt="Avatar" className="w-32 h-32 rounded-full border-4 border-[#e50914] mb-4" />
            <button className="absolute bottom-2 right-2 bg-[#e50914] p-2 rounded-full hover:scale-110 transition">
              <Camera className="w-5 h-5" />
            </button>
          </div>
          <p className="text-gray-400 text-sm">Personalize your profile</p>
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
