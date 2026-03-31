import React, { useState } from "react";
import { toast } from "react-hot-toast";
import { getAIRecommendation } from "../lib/AIModel";
import RecommendedMovies from "../components/RecommendedMovies";

const steps = [
  {
    name: "genre",
    label: "What's your favorite genre?",
    options: [
      "Action",
      "Comedy",
      "Drama",
      "Horror",
      "Romance",
      "Sci-Fi",
      "Animation",
    ],
  },
  {
    name: "mood",
    label: "What's your current mood?",
    options: [
      "Excited",
      "Relaxed",
      "Thoughtful",
      "Scared",
      "Inspired",
      "Romantic",
    ],
  },
  {
    name: "decade",
    label: "Preferred decade?",
    options: ["2020s", "2010s", "2000s", "1990s", "Older"],
  },
  {
    name: "language",
    label: "Preferred language?",
    options: ["English", "Korean", "Spanish", "French", "Other"],
  },
  {
    name: "length",
    label: "Preferred movie length?",
    options: ["Short (<90 min)", "Standard (90-120 min)", "Long (>120 min)"],
  },
];

const initialState = steps.reduce((acc, step) => {
  acc[step.name] = "";
  return acc;
}, {});

const FALLBACK_RECOMMENDATIONS = [
  "The Shawshank Redemption",
  "Inception",
  "The Dark Knight",
  "Interstellar",
  "Parasite",
  "Mad Max: Fury Road",
  "Titanic",
  "The Grand Budapest Hotel",
  "Get Out",
  "Arrival",
];

const AIRecommendations = () => {
  const [inputs, setInputs] = useState(initialState);
  const [step, setStep] = useState(0);
  const [recommendation, setRecommendation] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFallback, setIsFallback] = useState(false);

  const handleOption = (value) => {
    setInputs((prev) => ({ ...prev, [steps[step].name]: value }));
  };

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };

  const generateRecommendations = async () => {
    const missing = steps.some((s) => !inputs[s.name]);
    if (missing) {
      toast.error("Please complete all selections before finishing.");
      return;
    }

    setIsLoading(true);

    try {
      const result = await getAIRecommendation(inputs);

      const titles = Array.isArray(result.recommendations)
        ? result.recommendations
            .map((x) => (typeof x === "string" ? x : x?.title || x?.name))
            .filter(Boolean)
            .slice(0, 10)
        : [];

      if (titles.length === 0) {
        toast.error("AI returned an unexpected format. Showing fallback recommendations.");
        setRecommendation(FALLBACK_RECOMMENDATIONS);
        setIsFallback(true);
        return;
      }

      setRecommendation(titles);
      setIsFallback(!!result.fallback);

      if (result.fallback && result.message) {
        toast(result.message, { icon: "ℹ️" });
      }
    } catch (err) {
      const message = err?.message || "Failed to get AI recommendations.";
      const isQuotaError = /rate limit|quota|RESOURCE_EXHAUSTED|429/i.test(message);

      if (isQuotaError) {
        toast.error("AI quota or rate limit hit. Showing a fallback movie list instead.");
        setRecommendation(FALLBACK_RECOMMENDATIONS);
        setIsFallback(true);
      } else {
        toast.error(message);
      }
    } finally {
      setIsLoading(false);
    }
  };
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#181818] via-[#232323] to-[#181818] relative overflow-hidden">
      {!(recommendation && recommendation.length > 0) && (
        <img
          src="/background_banner.jpg"
          className="absolute inset-0 w-full h-full object-cover opacity-20 blur-[2px] "
        />
      )}

      {recommendation && recommendation.length > 0 ? (
        <div className="w-full max-w-7xl mx-auto mt-2">
          <h2 className="text-2xl font-bold text-white mb-4 text-center">AI Recommended Movies</h2>
          <RecommendedMovies movieTitles={recommendation} />
          {isFallback && (
            <div className="mt-4 flex flex-col gap-3 items-center">
              <div className="mt-2 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsFallback(false);
                    setRecommendation([]);
                    generateRecommendations();
                  }}
                  className="px-5 py-2 rounded-lg font-semibold transition border-2 border-[#e50914] text-white bg-[#e50914] hover:bg-[#b0060f]"
                >
                  Try AI Again
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsFallback(false);
                    setRecommendation([]);
                    setStep(0);
                  }}
                  className="px-5 py-2 rounded-lg font-semibold transition border-2 border-gray-600 text-white bg-gray-700 hover:bg-gray-600"
                >
                  Change Inputs
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="relative w-full max-w-md mx-auto rounded-2xl bg-[#181818]/90 shadow-2xl border border-[#333] px-8 py-10 mt-4 flex flex-col items-center min-h-[480px]">
          <h2 className="text-3xl font-extrabold mb-8 text-center text-white tracking-tight drop-shadow-lg">
            AI Movie Recommendation
          </h2>

          <div className="w-full flex items-center mb-8">
            <div className="flex-1 h-2 bg-[#232323] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#e50914] transition-all duration-300"
                style={{ width: `${((step + 1) / steps.length) * 100}%` }}
              ></div>
            </div>

            <span className="ml-4 text-white text-sm font-semibold">
              {step + 1}/{steps.length}
            </span>
          </div>

          <div className="w-full flex flex-col flex-1">
            <div className="mb-6 flex-1">
              <h3 className=" text-lg font-semibold text-white mb-6 text-center">
                {steps[step].label}
              </h3>

              <div className="grid grid-cols-1 gap-3">
                {steps[step].options.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => handleOption(opt)}
                    className={`w-full py-3 rounded-xl border-2 transition font-semibold text-base flex items-center justify-center gap-2 focus:outline-none focus:ring-2 active:scale-95 duration-150 focus:ring-[#e50914] shadow-sm ${
                      inputs[steps[step].name] == opt
                        ? "bg-[#e50914] border-[#e50914] text-white shadow-lg"
                        : "bg-[#232323] border-[#444] text-white hover:bg-[#e50914]/80 hover:border-[#e50914]"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-between items-center mt-6">
              <button
                type="button"
                onClick={handleBack}
                disabled={step == 0}
                className="px-6 py-2 rounded-lg font-semibold transition border-2 border-[#444] text-white bg-[#181818] hover:bg-[#232323]"
              >
                Back
              </button>
              <button
                type="button"
                onClick={
                  step === steps.length - 1
                    ? generateRecommendations
                    : handleNext
                }
                disabled={!inputs[steps[step].name] || isLoading}
                className="px-6 py-2 rounded-lg font-semibold transition border-2 border-[#e50914] text-white bg-[#e50914] hover:bg-[#b0060f] ml-2"
              >
                {step === steps.length - 1 ? "Finish" : "Next"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIRecommendations;
