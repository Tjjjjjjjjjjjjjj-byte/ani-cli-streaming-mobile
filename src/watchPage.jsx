import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import EpisodeList from "./watch/EpisodeList";
import WatchPanel from "./watch/WatchPanel";
import { useEpisode } from "./watch/useEpisode";
import { useDownload, useDownloadQueue } from "./watch/useDownload";
import { useSkipTimes } from "./watch/useSkipTimes";
import { useEpisodeInfo } from "./watch/useEpisodeInfo";
import { rememberEpisode, useProgress } from "./watch/useProgress";
import { FORMAT_LABELS, STATUS_LABELS } from "./utils/animeFormat";
import { fetchDetails } from "./anilist";
import { getPosition, recordPosition } from "./store/history";
import { setShowPrefs, showPrefsStore } from "./store/showPrefs";
import { useStore } from "./store/storage";
import { addFinishedEpisode, addWatchTime } from "./store/stats";
import { autoTrack } from "./store/watchlist";
import { getSettings } from "./store/settings";
import { canAutoDownload } from "./store/network";
import { useSavedEpisodes } from "./library/useSavedEpisodes";
import { deleteFromLibrary } from "./library/useLibrary";
import { episodeKey } from "./library/cleanup";

function WatchPage() {
  const { id, episode: episodeParam } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // The URL decides when it says so; otherwise use what you last picked for this show.
  const langParam = searchParams.get("lang");
  const showPrefs = useStore(showPrefsStore)[id] ?? {};
  const lang = langParam === "dub" || langParam === "sub" ? langParam : showPrefs.lang === "dub" ? "dub" : "sub";

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
  const queue = useDownloadQueue();
  const saved = useSavedEpisodes(id, lang);
  const savedRef = useRef(saved);
  const animeRef = useRef(null);

  // Read the saved spot once per episode/language, not on every save, so playback never jumps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const startAt = useMemo(() => getPosition(id, episode)?.t ?? 0, [id, episode, lang]);

  useEffect(() => {
    if (validEpisode) rememberEpisode(id, episode);
  }, [id, episode, validEpisode]);

  useEffect(() => {
    if (validEpisode) setShowPrefs(id, { lang });
  }, [id, lang, validEpisode]);

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
    animeRef.current = anime;
    savedRef.current = saved;
  });

  // Called every few seconds by the player: remembers the spot and counts watch time.
  const handleProgress = useCallback(
    ({ time, duration, delta }) => {
      const a = animeRef.current;
      if (!a) return;
      recordPosition({ anime: a, episode, lang, time, duration });
      addWatchTime({ anime: a, seconds: delta });
    },
    [episode, lang],
  );

  // Called once, at 85% of an episode.
  const handleWatched = useCallback(() => {
    markWatched(episode);
    const a = animeRef.current;
    if (!a) return;
    const available = a.availableEpisodes ?? a.episodes ?? null;
    addFinishedEpisode({ anime: a });
    autoTrack(a, episode, available);

    const settings = getSettings();
    const have = savedRef.current;

    if (settings.deleteAfterWatching && have.has(episode)) {
      deleteFromLibrary(`/library/${id}/episodes/${encodeURIComponent(episodeKey(episode, lang))}`)
        .then(() => queue.refreshLibrary?.())
        .catch((err) => console.warn("Couldn't delete the watched download:", err));
    }

    if (settings.autoDownloadNext > 0 && canAutoDownload(settings.wifiOnly)) {
      const wanted = Array.from({ length: settings.autoDownloadNext }, (_, i) => episode + 1 + i).filter(
        (n) => (available == null || n <= available) && !have.has(n),
      );
      if (wanted.length) queue.enqueue(id, wanted, lang, { auto: true });
    }
  }, [episode, id, lang, markWatched, queue]);

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
    navigate(`/anime/${id}/watch/${n}?lang=${nextLang}`);
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
            saved={saved}
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
            onWatched={handleWatched}
            startAt={startAt}
            initialSpeed={showPrefs.speed ?? 1}
            onSpeedChange={(speed) => setShowPrefs(id, { speed })}
            subSize={showPrefs.subSize ?? null}
            onSubSize={(subSize) => setShowPrefs(id, { subSize })}
            onProgress={handleProgress}
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
