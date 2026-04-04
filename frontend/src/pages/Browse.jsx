import React from "react";
import { useParams } from "react-router";
import CardList from "../components/CardList";

const Browse = () => {
  const { tab } = useParams();

  const config = (() => {
    switch (tab) {
      case "movies":
        return {
          title: "Movies",
          section: "popular",
          genre: "",
          catalogType: "movies",
        };
      case "tv":
        return {
          title: "TV Shows",
          section: "popular",
          genre: "",
          catalogType: "series",
        };
      case "anime":
        return {
          title: "Animation",
          section: "all",
          genre: "Animation",
          catalogType: "series",
        };
      case "upcoming":
        return {
          title: "Upcoming",
          section: "upcoming",
          genre: "",
          catalogType: "movies",
        };
      case "popular":
        return {
          title: "Popular",
          section: "popular",
          genre: "",
          catalogType: "movies",
        };
      default:
        return {
          title: "Browse",
          section: "popular",
          genre: "",
          catalogType: "movies",
        };
    }
  })();

  return (
    <div className="p-5">
      <h1 className="pt-10 pb-5 text-2xl md:text-3xl text-white font-semibold">
        {config.title}
      </h1>
      <p className="text-gray-500 text-sm -mt-4 mb-2 max-w-2xl">
        {config.catalogType === "series"
          ? "TV series from your PostgreSQL catalog (TMDB bootstrap or admin)."
          : "Movies from your PostgreSQL catalog."}
      </p>
      <CardList
        title={config.title}
        section={config.section}
        genre={config.genre}
        catalogType={config.catalogType === "series" ? "series" : "movies"}
      />
    </div>
  );
};

export default Browse;
