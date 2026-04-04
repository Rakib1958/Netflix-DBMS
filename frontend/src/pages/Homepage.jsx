import React from "react";
import Hero from "../components/Hero";
import CardList from "../components/CardList";
import Footer from "../components/Footer";

const Homepage = () => {
  return (
    <div className="p-5">
      <Hero />
      <CardList title="Recently added" section="new" />
      <CardList title="Top rated" section="top_rated" />
      <CardList title="Popular" section="popular" />
      <CardList title="Upcoming" section="upcoming" />
      <CardList title="Popular TV" section="popular" catalogType="series" />
      <Footer />
    </div>
  );
};

export default Homepage;
