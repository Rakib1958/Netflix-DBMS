import axios from "axios";

axios.defaults.withCredentials = true;

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";


export async function getAIRecommendation(userInputs) {
  try {
    const response = await axios.post(`${API_URL}/ai/recommendations`, userInputs, {
      withCredentials: true,
    });

    const data = response.data;
    return {
      recommendations: data.recommendations || [],
      fallback: !!data.fallback,
      message: data.message || null,
    };
  } catch (error) {
    const status = error.response?.status;
    const data = error.response?.data;

    if (data?.recommendations?.length > 0) {
      return {
        recommendations: data.recommendations,
        fallback: true,
        message: data.message || null,
      };
    }

    if (status === 401) {
      throw new Error("Please log in to access AI recommendations.");
    }

    if (status === 429) {
      throw new Error("AI service is temporarily busy. Please wait a moment and try again.");
    }

    if (status === 500) {
      throw new Error("AI service is currently unavailable. Please try again later.");
    }

    if (data?.message) {
      throw new Error(data.message);
    }

    throw new Error("Failed to get AI recommendations. Please check your connection and try again.");
  }
}
