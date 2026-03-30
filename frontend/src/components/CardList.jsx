import React, { useEffect, useState } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";
import "swiper/css/navigation";
import { Navigation } from "swiper/modules";
import  {Link} from "react-router"
import { tmdbGet } from "../lib/tmdbClient";

const CardList = ({ title, category, fetchUrl }) => {
  const [data, setData] = useState([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        // Support legacy callers that pass full TMDB URLs.
        const url = fetchUrl || `https://api.themoviedb.org/3/movie/${category}?language=en-US&page=1`;
        const m = String(url).match(/api\.themoviedb\.org\/3\/(.+?)(\?.*)?$/i);
        if (m) {
          const path = m[1];
          const params = Object.fromEntries(new URLSearchParams(m[2] || ""));
          const res = await tmdbGet(path, params);
          if (!cancelled) setData(res?.results || []);
          return;
        }

        // Newer callers can pass a TMDB path directly via fetchUrl (e.g. "movie/popular").
        if (fetchUrl && !String(fetchUrl).startsWith("http")) {
          const [path, qs = ""] = String(fetchUrl).split("?");
          const extraParams = Object.fromEntries(new URLSearchParams(qs));
          const res = await tmdbGet(path, { language: "en-US", page: 1, ...extraParams });
          if (!cancelled) setData(res?.results || []);
          return;
        }

        const res = await tmdbGet(`movie/${category}`, { language: "en-US", page: 1 });
        if (!cancelled) setData(res?.results || []);
      } catch (err) {
        if (!cancelled) setData([]);
        console.error(err);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [category, fetchUrl]);

  return (
    <div className="text-white md:px-4">
      <h2 className="pt-10 pb-5 text-lg font-medium">{title}</h2>

      {/* Focusable wrapper so Swiper navigation buttons only show on focus */}
      <div className="cardListCarousel" tabIndex={0}>
        <Swiper
          slidesPerView={5}
          spaceBetween={10}
          className="mySwiper"
          modules={[Navigation]}
          navigation
          grabCursor
          breakpoints={{
            0: { slidesPerView: 2.2 },
            480: { slidesPerView: 3.2 },
            768: { slidesPerView: 4.2 },
            1024: { slidesPerView: 6 },
          }}
        >
          {data.map((item, index) => (
            <SwiperSlide key={index} className="max-w-72 group">
              <Link to={`/movie/${item.id}`}>
                <img
                  src={`https://image.tmdb.org/t/p/w500/${item.backdrop_path || item.poster_path}`}
                  alt=""
                  className="h-44 w-full object-center object-cover transition duration-200 group-hover:scale-[1.09] group-hover:brightness-110"
                />
                <p className="text-center pt-2">
                  {item.title || item.original_title || item.name || ""}
                </p>
              </Link>
            </SwiperSlide>
          ))}
        </Swiper>
      </div>
    </div>
  );
};

export default CardList;
