/**
 * Zustand auth store: signup/login/logout, fetchUser, profile & watchlist sync (axios + credentials).
 */
import { create } from "zustand";
import axios from "axios";
import { API_URL, getSiteOrigin } from "../lib/apiBase.js";

axios.defaults.withCredentials = true;

const normalizeProfilePic = (pic) => {
  if (!pic) return pic;
  if (typeof pic !== "string") return pic;
  if (pic.startsWith("http://") || pic.startsWith("https://") || pic.startsWith("data:")) return pic;
  const origin = getSiteOrigin();
  const normalizedPath = pic.startsWith("/") ? pic : `/${pic}`;
  return `${origin}${normalizedPath}`;
};

const normalizeUser = (u) => {
  if (!u) return u;
  return {
    ...u,
    profilePic: normalizeProfilePic(u.profilePic),
  };
};

export const useAuthStore = create((set) => ({
  // initial states
  user: null,
  isLoading: false,
  error: null,
  message: null,
  fetchingUser: true,

  // functions

  signup: async (username, email, password, adminCode) => {
    set({ isLoading: true, message: null, error: null });

    try {
      const response = await axios.post(`${API_URL}/signup`, {
        username,
        email,
        password,
        adminCode
      });

      set({ isLoading: false, message: response.data.message });
      return response.data;
    } catch (error) {
      set({
        isLoading: false,
        error: error.response?.data?.message || "Error Signing up",
      });

      throw error;
    }
  },

  resendVerification: async (email) => {
    set({ isLoading: true, error: null, message: null });
    try {
      const response = await axios.post(`${API_URL}/resend-verification`, { email });
      set({ isLoading: false, message: response.data.message });
      return response.data;
    } catch (error) {
      set({
        isLoading: false,
        error: error.response?.data?.message || "Could not resend code",
      });
      throw error;
    }
  },

  verifyEmailSignup: async (email, otp) => {
    set({ isLoading: true, error: null, message: null });
    try {
      const response = await axios.post(`${API_URL}/verify-email`, { email, otp });
      set({
        user: normalizeUser(response.data.user),
        message: response.data.message,
        isLoading: false,
      });
      return response.data;
    } catch (error) {
      set({ isLoading: false, error: error.response?.data?.message || "Invalid OTP" });
      throw error;
    }
  },

  login: async (username, password) => {
    set({ isLoading: true, message: null, error: null });

    try {
      const response = await axios.post(`${API_URL}/login`, {
        username,
        password,
      });

      const { user, message } = response.data;

      set({
        user: normalizeUser(user),
        message,
        isLoading: false,
      });

      return { user, message };
    } catch (error) {
      set({
        isLoading: false,
        error: error.response.data.message || "Error logging in",
      });

      throw error;
    }
  },

  fetchUser: async () => {
    set({ fetchingUser: true, error: null });

    try {
      const response = await axios.get(`${API_URL}/fetch-user`);
      set({ user: normalizeUser(response.data.user), fetchingUser: false });
    } catch (error) {
      set({
        fetchingUser: false,
        error: null,
        user: null,
      });

      throw error;
    }
  },

  logout: async () => {
    set({ isLoading: true, error: null, message: null });

    try {
      const response = await axios.post(`${API_URL}/logout`);
      const { message } = response.data;
      set({
        message,
        isLoading: false,
        user: null,
        error: null,
      });

      return { message };
    } catch (error) {
      set({
        isLoading: false,
        error: error.response.data.message || "Error logging out",
      });

      throw error;
    }
  },

  forgotPassword: async (email) => {
    set({ isLoading: true, error: null });
    try {
      const response = await axios.post(`${API_URL}/forgot-password`, { email });
      set({ isLoading: false, message: response.data.message });
      return response.data;
    } catch (error) {
      set({ isLoading: false, error: error.response.data.message || "Error" });
      throw error;
    }
  },

  verifyOtp: async (email, otp) => {
    set({ isLoading: true, error: null });
    try {
      const response = await axios.post(`${API_URL}/verify-otp`, { email, otp });
      set({ isLoading: false, message: response.data.message });
    } catch (error) {
      set({ isLoading: false, error: error.response.data.message || "Error" });
      throw error;
    }
  },

  resetPassword: async (email, otp, newPassword) => {
    set({ isLoading: true, error: null });
    try {
      const response = await axios.post(`${API_URL}/reset-password`, { email, otp, newPassword });
      set({ isLoading: false, message: response.data.message });
    } catch (error) {
      set({ isLoading: false, error: error.response.data.message || "Error" });
      throw error;
    }
  },

  updateProfile: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const response = await axios.put(`${API_URL}/update-profile`, data);
      set({
        user: normalizeUser(response.data.user),
        isLoading: false,
        message: response.data.message,
      });
    } catch (error) {
      set({ isLoading: false, error: error.response?.data?.message || "Error" });
      throw error;
    }
  },

  uploadProfilePic: async (formData) => {
    set({ isLoading: true, error: null });
    try {
      const response = await axios.post(`${API_URL}/upload-profile-pic`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      set((state) => ({
        user: {
          ...state.user,
          profilePic: normalizeProfilePic(response.data.url),
        },
        isLoading: false,
      }));
      return response.data;
    } catch (error) {
      set({ isLoading: false, error: error.response?.data?.message || "Error Uploading" });
      throw error;
    }
  },

  addToWatchlist: async (mediaIdOrMovie) => {
    try {
      const media_id =
        typeof mediaIdOrMovie === "string" || typeof mediaIdOrMovie === "number"
          ? String(mediaIdOrMovie)
          : mediaIdOrMovie?.id != null
            ? String(mediaIdOrMovie.id)
            : null;
      if (!media_id) throw new Error("Missing media id");
      const response = await axios.post(`${API_URL}/watchlist/add`, { media_id });
      set((state) => ({
        user: { ...state.user, watchlist: response.data.watchlist },
      }));
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  removeFromWatchlist: async (movieId) => {
    try {
      const response = await axios.delete(`${API_URL}/watchlist/remove/${movieId}`);
      set((state) => ({
        user: { ...state.user, watchlist: response.data.watchlist },
      }));
      return response.data;
    } catch (error) {
      throw error;
    }
  },
}));
