import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import EpisodeList from "./watch/EpisodeList";
import WatchPanel from "./watch/WatchPanel";
import { useEpisode } from "./watch/useEpisode";
import { useDownload } from "./watch/useDownload";
import { useSkipTimes } from "./watch/useSkipTimes";
import { useEpisodeInfo } from "./watch/useEpisodeInfo";
import { rememberEpisode, useProgress } from "./watch/useProgress";
import { FORMAT_LABELS, STATUS_LABELS } from "./utils/animeFormat";
import { fetchDetails } from "./anilist";

function WatchPage() {
  const { id, episode: episodeParam } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const lang = searchParams.get("lang") === "dub" ? "dub" : "sub";

  const location = useLocation();
  const preview =
    String(location.state?.anime?.id) === id ? location.state.anime : null;

  const episode = Number(episodeParam);
  const validEpisode = Number.isInteger(episode) && episode >= 1;

  const [result, setResult] = useState(null);
  const [theater, setTheater] = useState(false);
  const [download, startDownload, startDownloadAll] = useDownload(id, lang);
  const [watch, retryWatch] = useEpisode(id, validEpisode ? episode : null, lang);
  const skipTimes = useSkipTimes(id, validEpisode ? episode : null);
  const { episodes: episodeInfo, loading: infoLoading } = useEpisodeInfo(id);
  const [progress, markWatched] = useProgress(id);
  const detail = validEpisode ? episodeInfo[episode] : null;

  useEffect(() => {
    if (validEpisode) rememberEpisode(id, episode);
  }, [id, episode, validEpisode]);

  useEffect(() => {
    const controller = new AbortController();
    fetchDetails(id, controller.signal)
      .then((data) => data && setResult({ id, data }))
      .catch((err) => {
        if (err.name !== "AbortError") console.error("Details failed:", err);
      });
    return () => controller.abort();
  }, [id]);

  const anime = result?.id === id ? result.data : preview;

  useEffect(() => {
    if (anime?.title && validEpisode) document.title = `${anime.title} – Episode ${episode}${detail?.title ? `: ${detail.title}` : ""}`;
    return () => {
      document.title = "ani-cli-streaming";
    };
  }, [anime, episode, validEpisode, detail]);

  if (!validEpisode) {
    return (
      <main className="watch-page">
        <p className="empty-note watch-page__note" role="status">
          That isn’t a valid episode number. <Link to={`/anime/${id}`}>Back to the anime</Link>
        </p>
      </main>
    );
  }

  function goTo(n, nextLang = lang) {
    navigate(`/anime/${id}/watch/${n}${nextLang === "dub" ? "?lang=dub" : ""}`);
  }

  const formatLabel = anime ? FORMAT_LABELS[anime.format] ?? anime.format : null;
  const statusLabel = anime ? STATUS_LABELS[anime.status] ?? null : null;
  const genres = anime?.genres?.slice(0, 4) ?? [];
  const total = anime?.availableEpisodes ?? anime?.episodes ?? null;

  return (
    <main className={`watch-page${theater ? " is-theater" : ""}`}>
      {anime?.cover && (
        <div className="watch-page__backdrop" aria-hidden="true">
          <img src={anime.cover} alt="" />
        </div>
      )}

      <div className="watch-page__layout">
        <header className="watch-page__header">
          <Link className="watch-page__back" to={`/anime/${id}`} state={anime ? { anime } : undefined}>
            <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
            Back to details
          </Link>
          <h1 className="watch-page__title">{anime?.title ?? "Loading…"}</h1>
          <p className="watch-page__episode">
            Episode {episode}
            {total != null && <span> of {total}</span>}
            <span> · {lang === "dub" ? "Dub" : "Sub"}</span>
            {detail?.filler && <span className="ep-tag ep-tag--filler">Filler</span>}
            {detail?.recap && <span className="ep-tag">Recap</span>}
          </p>
        </header>

        <aside className="watch-page__list">
          <EpisodeList
            animeId={id}
            total={total}
            current={episode}
            lang={lang}
            download={download}
            onDownload={startDownload}
            onDownloadAll={startDownloadAll}
            infoLoading={infoLoading}
            linkState={anime ? { anime } : undefined}
            info={episodeInfo}
            watched={progress.watched}
            className="episodes--side"
          />
        </aside>

        <div className="watch-page__main">
          <WatchPanel
            watch={watch}
            lang={lang}
            download={download}
            onDownload={startDownload}
            totalEpisodes={total}
            onSelectEpisode={goTo}
            onSelectLang={(l) => goTo(episode, l)}
            onRetry={retryWatch}
            skipTimes={skipTimes}
            onWatched={() => markWatched(episode)}
            expanded={theater}
            onToggleExpand={() => setTheater((v) => !v)}
            detail={detail}
            infoLoading={infoLoading}
          />
        </div>

        {anime && (
          <aside className="watch-page__about">
            <div className="about-card">
              <img className="about-card__cover" src={anime.cover} alt={`${anime.title} cover`} />
              <div className="about-card__body">
                <h2 className="about-card__title">{anime.title}</h2>

                <div className="about-card__chips">
                  {formatLabel && <span className="meta-chip">{formatLabel}</span>}
                  {statusLabel && <span className="meta-chip">{statusLabel}</span>}
                  {anime.rating != null && (
                    <span className="meta-chip meta-chip--score">★ {(anime.rating / 10).toFixed(1)}</span>
                  )}
                </div>

                {genres.length > 0 && <p className="about-card__genres">{genres.join(", ")}</p>}
              </div>

              {anime.description && (
                <div className="about-card__desc">
                  <p className="about-card__text scroll-text" tabIndex={0}>
                    {anime.description}
                  </p>
                </div>
              )}

              <Link className="btn btn--outline about-card__link" to={`/anime/${id}`} state={{ anime }}>
                View details
              </Link>
            </div>
          </aside>
        )}
      </div>
    </main>
  );
}

export default WatchPage;
