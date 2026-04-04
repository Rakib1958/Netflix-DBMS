import React, { useEffect, useState } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";
import "swiper/css/navigation";
import { Navigation } from "swiper/modules";
import { Link } from "react-router";
import { fetchCatalogMovies, fetchCatalogSeries } from "../lib/catalogApi";
import { catalogImageUrl } from "../lib/mediaUrls";

const CardList = ({ title, section = "all", genre = "", limit = 30, catalogType = "movies" }) => {
  const [data, setData] = useState([]);
  const linkPrefix = catalogType === "series" ? "/series/" : "/movie/";

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const rows =
          catalogType === "series"
            ? await fetchCatalogSeries(section, { genre, limit })
            : await fetchCatalogMovies(section, { genre, limit });
        if (!cancelled) setData(rows);
      } catch (err) {
        if (!cancelled) setData([]);
        console.error(err);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [section, genre, limit, catalogType]);

  return (
    <div className="text-white md:px-4">
      <h2 className="pt-10 pb-5 text-lg font-medium">{title}</h2>

      {data.length === 0 ? (
        <p className="text-gray-500 text-sm pb-6">No titles in this row yet — add movies in the admin panel.</p>
      ) : null}

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
          {data.map((item) => (
            <SwiperSlide key={item.id} className="max-w-72 group">
              <Link to={`${linkPrefix}${item.id}`}>
                <img
                  src={catalogImageUrl(item) || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E"}
                  alt=""
                  className="h-44 w-full object-center object-cover transition duration-200 group-hover:scale-[1.09] group-hover:brightness-110 bg-[#232323]"
                />
                <p className="text-center pt-2">
                  {item.title || ""}
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
