import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Player from "../player";
import { STANDALONE, assetUrl } from "../api";
import { FORMAT_LABELS, STATUS_LABELS, formatBytes } from "../utils/animeFormat";
import { usePlayerPrefs } from "../watch/useEpisode";
import { useEpisodeNavKeys } from "../watch/keyboard";
import { rememberEpisode, useProgress } from "../watch/useProgress";
import { fetchDetails, loadFullDetails } from "../anilist";
import { getPosition, recordPosition } from "../store/history";
import { addFinishedEpisode, addWatchTime } from "../store/stats";
import { autoTrack } from "../store/watchlist";
import LibraryEpisodeList from "./LibraryEpisodeList";
import { useLibraryAnime } from "./useLibrary";

// Same threshold the history uses before it saves a position.
const START_TRACKING_SECONDS = 15;

function LibraryWatchPage() {
  const { id, key } = useParams();
  const navigate = useNavigate();
  const [state] = useLibraryAnime(id);
  const [prefs, togglePref] = usePlayerPrefs();
  const [progress, markWatched] = useProgress(id);
  const [theater, setTheater] = useState(false);

  const anime = state.status === "ready" ? state.anime : null;
  const episode = state.status === "ready" ? state.episodes.find((e) => e.key === key) : null;

  const siblings = episode ? state.episodes.filter((e) => e.lang === episode.lang) : [];
  const here = siblings.findIndex((e) => e.key === key);
  const nextKey = here >= 0 ? siblings[here + 1]?.key : undefined;
  const prevKey = here > 0 ? siblings[here - 1].key : undefined;
  useEpisodeNavKeys({
    onNext: nextKey ? () => navigate(`/downloads/${id}/watch/${nextKey}`) : null,
    onPrev: prevKey ? () => navigate(`/downloads/${id}/watch/${prevKey}`) : null,
  });

  const number = episode?.number ?? null;
  const lang = episode?.lang ?? "sub";
  useEffect(() => {
    if (number != null) rememberEpisode(id, number);
  }, [id, number]);

  // Offline episodes count towards history, stats and the list like streamed ones do.
  // AniList details give real airing info and a cover; if we're offline the saved manifest is the fallback.
  const [online, setOnline] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    fetchDetails(id, controller.signal)
      .then((data) => data && setOnline({ id, data }))
      .catch(() => {});
    return () => controller.abort();
  }, [id]);

  const trackAnime = useMemo(() => {
    if (online?.id === id) return online.data;
    if (!anime) return null;
    // No cover on purpose: the library's cover is a local URL that means nothing outside this page.
    return { id: Number(id), title: anime.title, format: anime.format, status: anime.status, episodes: anime.episodes, rating: anime.rating, genres: anime.genres };
  }, [online, anime, id]);

  const trackRef = useRef(null);
  const startedRef = useRef(null);
  useEffect(() => {
    trackRef.current = trackAnime;
  });

  // Read the saved spot once per episode so playback never jumps while it saves.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const startAt = useMemo(() => (number != null ? getPosition(id, number)?.t ?? 0 : 0), [id, number]);

  const handleProgress = useCallback(
    ({ time, duration, delta }) => {
      const a = trackRef.current;
      if (!a || number == null) return;
      recordPosition({ anime: a, episode: number, lang, time, duration });
      addWatchTime({ anime: a, seconds: delta });

      const startedKey = `${id}:${number}`;
      if (time >= START_TRACKING_SECONDS && startedRef.current !== startedKey) {
        startedRef.current = startedKey;
        autoTrack(a, number);
      }
    },
    [id, number, lang],
  );

  const handleWatched = useCallback(() => {
    markWatched(number);
    const a = trackRef.current;
    if (!a) return;
    addFinishedEpisode({ anime: a });
    loadFullDetails(id, a).then((full) => autoTrack(full ?? a, number, { watched: true }));
  }, [id, number, markWatched]);

  useEffect(() => {
    if (anime?.title && episode) document.title = `${anime.title} – Episode ${episode.number}`;
    return () => {
      document.title = "ani-cli-streaming";
    };
  }, [anime, episode]);

  const back = <Link to={`/downloads/${id}`}>Back to the anime</Link>;
  if (state.status !== "ready" || !episode) {
    const text =
      state.status === "loading"
        ? "Loading…"
        : state.status === "ready"
          ? "That episode isn’t saved."
          : "Couldn’t open this episode.";
    return (
      <main className="watch-page">
        <p className="empty-note watch-page__note" role="status">
          {text} {back}
        </p>
      </main>
    );
  }

  const { episodes } = state;

  const sameLang = episodes.filter((e) => e.lang === lang);
  const at = sameLang.findIndex((e) => e.key === key);
  const prev = sameLang[at - 1];
  const next = sameLang[at + 1];
  const langs = ["sub", "dub"].filter((l) => episodes.some((e) => e.lang === l));

  const open = (ep) => navigate(`/downloads/${id}/watch/${ep.key}`);

  function switchLang(option) {
    const options = episodes.filter((e) => e.lang === option);
    open(options.find((e) => e.number === episode.number) ?? options[0]);
  }

  const formatLabel = FORMAT_LABELS[anime.format] ?? anime.format;
  const statusLabel = STATUS_LABELS[anime.status] ?? null;
  const genres = anime.genres?.slice(0, 4) ?? [];
  const cover = assetUrl(anime.coverUrl);
  const totalSize = sameLang.reduce((sum, e) => sum + (e.size ?? 0), 0);
  const fileInfo = [
    formatBytes(episode.size),
    episode.subtitle ? "subtitles included" : "no subtitles",
    episode.skip.length ? "skip times included" : null,
  ].filter(Boolean);

  return (
    <main className={`watch-page${theater ? " is-theater" : ""}`}>
      {cover && (
        <div className="watch-page__backdrop" aria-hidden="true">
          <img src={cover} alt="" />
        </div>
      )}

      <div className="watch-page__layout">
        <header className="watch-page__header">
          <Link className="watch-page__back" to={`/downloads/${id}`}>
            <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
            Back to details
          </Link>
          <h1 className="watch-page__title">{anime.title}</h1>
          <p className="watch-page__episode">
            Episode {episode.number}
            {anime.episodes != null && <span> of {anime.episodes}</span>}
            <span> · {lang === "dub" ? "Dub" : "Sub"}</span>
          </p>
        </header>

        <aside className="watch-page__list">
          <LibraryEpisodeList
            animeId={id}
            episodes={sameLang}
            currentKey={key}
            watched={progress.watched}
            className="episodes--side"
          />
        </aside>

        <div className="watch-page__main">
          <section className="watch">
            <div className="watch__stage">
              <Player
                key={episode.key}
                kind="file"
                src={assetUrl(episode.videoUrl)}
                subtitles={episode.subtitleUrl && lang !== "dub" ? assetUrl(episode.subtitleUrl) : null}
                skipTimes={episode.skip}
                autoSkip={prefs.autoSkip}
                autoPlay={prefs.autoPlay}
                onEnded={() => prefs.autoNext && next && open(next)}
                onWatched={handleWatched}
                onProgress={handleProgress}
                startAt={startAt}
              />
            </div>

            <div className="watch__toolbar">
              <div className="watch__toggles">
                <button type="button" className="toggle" onClick={() => setTheater((v) => !v)} aria-pressed={theater}>
                  <span className="material-symbols-outlined" aria-hidden="true">
                    {theater ? "close_fullscreen" : "open_in_full"}
                  </span>
                  {theater ? "Collapse" : "Expand"}
                </button>
                {[["autoPlay", "Auto Play"], ["autoNext", "Auto Next"], ["autoSkip", "Auto Skip"]].map(([name, label]) => (
                  <button key={name} type="button" className="toggle" aria-pressed={prefs[name]} onClick={() => togglePref(name)}>
                    {label} <span className={`toggle__state${prefs[name] ? " is-on" : ""}`}>{prefs[name] ? "On" : "Off"}</span>
                  </button>
                ))}
              </div>

              <div className="watch__toggles">
                <button type="button" className="toggle" disabled={!prev} onClick={() => open(prev)}>
                  <span className="material-symbols-outlined" aria-hidden="true">fast_rewind</span>
                  Prev
                </button>
                <button type="button" className="toggle" disabled={!next} onClick={() => open(next)}>
                  Next
                  <span className="material-symbols-outlined" aria-hidden="true">fast_forward</span>
                </button>
              </div>
            </div>

            <div className="watch__info">
              <div className="watch__now">
                <p>You are watching</p>
                <p className="watch__now-episode">
                  Episode {episode.number}{anime.episodes != null ? ` of ${anime.episodes}` : ""}
                </p>
                <p className="watch__now-hint">{STANDALONE ? "Saved on this device" : "Saved on your PC"} · {fileInfo.join(" · ")}</p>
              </div>
              <div className="watch__tracks">
                {langs.map((option) => (
                  <div className="watch__track-row" key={option}>
                    <span className="watch__track-label">
                      <span className="material-symbols-outlined" aria-hidden="true">
                        {option === "sub" ? "closed_caption" : "mic"}
                      </span>
                      {option === "sub" ? "SUB:" : "DUB:"}
                    </span>
                    <button
                      type="button"
                      className={`watch__pill${lang === option ? " is-active" : ""}`}
                      aria-pressed={lang === option}
                      onClick={() => lang !== option && switchLang(option)}
                    >
                      Saved
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        <aside className="watch-page__about">
          <div className="about-card">
            {cover && <img className="about-card__cover" src={cover} alt={`${anime.title} cover`} />}
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
              <p className="about-card__genres">
                {sameLang.length} episode{sameLang.length === 1 ? "" : "s"} saved · {formatBytes(totalSize)}
              </p>
            </div>

            {anime.description && (
              <div className="about-card__desc">
                <p className="about-card__text scroll-text" tabIndex={0}>
                  {anime.description}
                </p>
              </div>
            )}

            <Link className="btn btn--outline about-card__link" to={`/downloads/${id}`}>
              View details
            </Link>
          </div>
        </aside>
      </div>
    </main>
  );
}

export default LibraryWatchPage;
