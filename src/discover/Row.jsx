import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FORMAT_LABELS } from "../utils/animeFormat";

function Poster({ anime }) {
  const format = FORMAT_LABELS[anime.format] ?? anime.format;
  const meta = [format, anime.year ?? anime.releaseDate?.year].filter(Boolean).join(" · ");

  return (
    <Link className="poster" to={`/anime/${anime.id}`} state={{ anime }}>
      <div className="poster__frame">
        <img src={anime.cover} alt="" loading="lazy" />
        {anime.rating != null && <span className="badge badge--score">★ {(anime.rating / 10).toFixed(1)}</span>}
      </div>
      <h3 className="poster__title" title={anime.title}>{anime.title}</h3>
      {meta && <p className="poster__meta">{meta}</p>}
    </Link>
  );
}

function Row({ title, items }) {
  const scroller = useRef(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const update = () =>
      setEdges({
        start: el.scrollLeft < 8,
        end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8,
      });
    const frame = requestAnimationFrame(update);
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [items]);

  function page(direction) {
    const el = scroller.current;
    el?.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: "smooth" });
  }

  return (
    <section className="row" aria-label={title}>
      <h2 className="row__title">{title}</h2>
      <div className="row__viewport">
        {!edges.start && (
          <button type="button" className="row__arrow row__arrow--prev" aria-label={`Scroll ${title} back`} onClick={() => page(-1)}>
            <span className="material-symbols-outlined" aria-hidden="true">chevron_left</span>
          </button>
        )}
        <ul className="row__track" ref={scroller}>
          {items.map((anime) => (
            <li className="row__item" key={anime.id}>
              <Poster anime={anime} />
            </li>
          ))}
        </ul>
        {!edges.end && (
          <button type="button" className="row__arrow row__arrow--next" aria-label={`Scroll ${title} forward`} onClick={() => page(1)}>
            <span className="material-symbols-outlined" aria-hidden="true">chevron_right</span>
          </button>
        )}
      </div>
    </section>
  );
}

export default Row;
