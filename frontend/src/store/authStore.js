import { create } from "zustand";
import axios from "axios";

axios.defaults.withCredentials = true;

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

export const useAuthStore = create((set) => ({
  // initial states
  user: null,
  isLoading: false,
  error: null,
  message: null,
  fetchingUser: true,

  // functions

  signup: async (username, email, password) => {
    set({ isLoading: true, message: null });

    try {
      const response = await axios.post(`${API_URL}/signup`, {
        username,
        email,
        password,
      });

      set({ user: response.data.user, isLoading: false });
    } catch (error) {
      set({
        isLoading: false,
        error: error.response.data.message || "Error Signing up",
      });

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
        user,
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
      set({ user: response.data.user, fetchingUser: false });
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
      set({ user: response.data.user, isLoading: false, message: response.data.message });
    } catch (error) {
      set({ isLoading: false, error: error.response.data.message || "Error" });
      throw error;
    }
  },

  addToWatchlist: async (movie) => {
    try {
      const response = await axios.post(`${API_URL}/watchlist/add`, { movie });
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
