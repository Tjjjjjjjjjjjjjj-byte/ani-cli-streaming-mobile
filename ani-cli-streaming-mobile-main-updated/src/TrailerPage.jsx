import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { fetchDetails } from "./anilist";
import { FORMAT_LABELS } from "./utils/animeFormat";
import { TrailerPlayer } from "./Trailer";

function TrailerPage() {
  const { id } = useParams();
  const location = useLocation();
  const preview = String(location.state?.anime?.id) === id ? location.state.anime : null;
  const [result, setResult] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchDetails(id, controller.signal)
      .then((data) => setResult({ id, data, error: null }))
      .catch((err) => {
        if (err.name === "AbortError") return;
        setResult({ id, data: null, error: err.message });
      });
    return () => controller.abort();
  }, [id]);

  const finished = result?.id === id ? result : null;
  const anime = finished?.data ?? preview;
  const trailer = finished?.data?.trailer ?? preview?.trailer ?? null;

  useEffect(() => {
    document.title = anime ? `${anime.title} · Trailer` : "Trailer";
    return () => {
      document.title = "ani-cli-streaming";
    };
  }, [anime]);

  const back = (
    <Link className="trailer-page__back" to={`/anime/${id}`} state={anime ? { anime } : undefined}>
      <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
      Back to details
    </Link>
  );

  if (!anime && !finished) {
    return (
      <main className="trailer-page">
        {back}
        <p className="empty-note" role="status">Loading…</p>
      </main>
    );
  }

  if (finished?.error && !anime) {
    return (
      <main className="trailer-page">
        {back}
        <p className="empty-note" role="alert">Couldn’t load this anime. {finished.error}</p>
      </main>
    );
  }

  const format = FORMAT_LABELS[anime.format] ?? anime.format;
  const facts = [
    anime.rating != null ? { key: "score", text: `★ ${(anime.rating / 10).toFixed(1)}`, score: true } : null,
    anime.releaseDate?.year ? { key: "year", text: String(anime.releaseDate.year) } : null,
    format ? { key: "format", text: format } : null,
    anime.episodes ? { key: "eps", text: `${anime.episodes} episodes` } : null,
  ].filter(Boolean);

  return (
    <main className="trailer-page">
      {back}
      <h1 className="trailer-page__title">{anime.title}</h1>

      {trailer ? (
        <TrailerPlayer key={trailer.id} trailer={trailer} title={anime.title} />
      ) : finished ? (
        <p className="empty-note">There is no trailer for this anime.</p>
      ) : (
        <p className="empty-note" role="status">Loading…</p>
      )}

      <div className="trailer-page__about">
        {facts.length > 0 && (
          <p className="series-facts">
            {facts.map((f) => (
              <span key={f.key} className={f.score ? "is-score" : undefined}>
                {f.text}
              </span>
            ))}
          </p>
        )}

        {anime.genres?.length > 0 && (
          <ul className="series-genres">
            {anime.genres.slice(0, 5).map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        )}

        {anime.description && (
          <div className="series-desc">
            <p className="series-desc__text scroll-text" tabIndex={0}>
              {anime.description}
            </p>
          </div>
        )}

        <div className="series-actions">
          <Link className="btn btn--primary" to={`/anime/${id}/watch/1`} state={{ anime }}>
            <span className="material-symbols-outlined" aria-hidden="true">play_arrow</span>
            Watch now
          </Link>
          <Link className="btn btn--outline" to={`/anime/${id}`} state={{ anime }}>
            More info
          </Link>
        </div>
      </div>
    </main>
  );
}

export default TrailerPage;
