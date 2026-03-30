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
          fetchUrl: "movie/popular",
        };
      case "tv":
        // We keep this browsing compatible with your existing `/movie/:id` page.
        // This searches movie results related to "tv series".
        return {
          title: "TV Shows",
          fetchUrl: "search/movie?query=tv%20series&include_adult=false",
        };
      case "anime":
        return {
          title: "Anime",
          fetchUrl: "discover/movie?with_genres=16&sort_by=popularity.desc",
        };
      case "upcoming":
        return {
          title: "Upcoming",
          fetchUrl: "movie/upcoming",
        };
      case "popular":
        return {
          title: "Popular",
          fetchUrl: "movie/popular",
        };
      default:
        return {
          title: "Browse",
          fetchUrl: "movie/popular",
        };
    }
  })();

  return (
    <div className="p-5">
      <h1 className="pt-10 pb-5 text-2xl md:text-3xl text-white font-semibold">
        {config.title}
      </h1>
      <CardList title={config.title} fetchUrl={config.fetchUrl} category="popular" />
    </div>
  );
};

export default Browse;

