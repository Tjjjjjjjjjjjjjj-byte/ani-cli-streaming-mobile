import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FORMAT_LABELS } from "../utils/animeFormat";
import { TrailerBackground } from "../Trailer";

const SLIDE_MS = 8000;

function Hero({ items }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [trailerState, setTrailerState] = useState("idle");
  const count = items.length;

  useEffect(() => {
    if (count < 2 || paused || trailerState === "playing") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), SLIDE_MS);
    return () => clearInterval(timer);
  }, [count, paused, index, trailerState]);

  const anime = items[index];
  const format = FORMAT_LABELS[anime.format] ?? anime.format;
  const facts = [
    format,
    anime.year ?? anime.releaseDate?.year,
    anime.episodes ? `${anime.episodes} eps` : null,
  ].filter(Boolean);

  return (
    <section
      className="hero"
      aria-roledescription="carousel"
      aria-label="Top rated this week"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="hero__backdrop" aria-hidden="true">
        {items.map((item, i) => (
          <img
            key={item.id}
            className={`hero__image${i === index ? " is-active" : ""}`}
            src={item.banner}
            alt=""
            loading={i === 0 ? "eager" : "lazy"}
          />
        ))}
      </div>

      {anime.trailer && <TrailerBackground key={anime.id} trailer={anime.trailer} onStateChange={setTrailerState} />}

      <div className="hero__inner">
        <div className="hero__content" key={anime.id} aria-live="polite">
          <p className="hero__kicker">
            <span className="material-symbols-outlined" aria-hidden="true">trending_up</span>
            Top rated this week
          </p>
          <h1 className="hero__title">{anime.title}</h1>

          <div className="hero__meta">
            {anime.rating != null && <span className="hero__score">★ {(anime.rating / 10).toFixed(1)}</span>}
            {facts.map((fact) => <span key={fact}>{fact}</span>)}
            {anime.genres.length > 0 && <span>{anime.genres.slice(0, 3).join(" · ")}</span>}
          </div>

          {anime.description && <p className="hero__desc">{anime.description}</p>}

          <div className="hero__actions">
            <Link className="btn btn--primary" to={`/anime/${anime.id}/watch/1`} state={{ anime }}>
              <span className="material-symbols-outlined" aria-hidden="true">play_arrow</span>
              Watch now
            </Link>
            {anime.trailer && (
              <Link className="btn btn--outline hero__more" to={`/anime/${anime.id}/trailer`} state={{ anime }}>
                <span className="material-symbols-outlined" aria-hidden="true">movie</span>
                Trailer
              </Link>
            )}
            <Link className="btn btn--outline hero__more" to={`/anime/${anime.id}`} state={{ anime }}>
              More info
            </Link>
          </div>
        </div>

        {count > 1 && (
          <div className="hero__dots" role="group" aria-label="Choose a show">
            {items.map((item, i) => (
              <button
                key={item.id}
                type="button"
                className={`hero__dot${i === index ? " is-active" : ""}`}
                aria-label={`Show ${item.title}`}
                aria-current={i === index}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default Hero;
