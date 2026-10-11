import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  FORMAT_LABELS,
  STATUS_LABELS,
  formatReleaseDate,
} from "./utils/animeFormat";
import EpisodeList from "./watch/EpisodeList";
import { useDownload } from "./watch/useDownload";
import { useEpisodeInfo } from "./watch/useEpisodeInfo";
import { useThemes } from "./watch/useThemes";
import SeriesSidebar from "./SeriesSidebar";
import { resumeEpisode, useProgress } from "./watch/useProgress";
import { getPosition } from "./store/history";
import { getShowPrefs, setShowPrefs } from "./store/showPrefs";
import { useSavedEpisodes } from "./library/useSavedEpisodes";
import WatchlistButton from "./watch/WatchlistButton";
import SimilarRow from "./discover/SimilarRow";
import AiringCountdown from "./AiringCountdown";
import { fetchDetails } from "./anilist";
import { TrailerBackground, TrailerPlayer } from "./Trailer";
import RelatedList from "./discover/RelatedList";
import RetryButton from "./ui/RetryButton";

function formatSpot(seconds) {
  const m = Math.floor(seconds / 60);
  const s = String(Math.floor(seconds % 60)).padStart(2, "0");
  return `${m}:${s}`;
}

function SelectedAnimePage() {
  const { id } = useParams();

  const location = useLocation();
  const preview =
    String(location.state?.anime?.id) === id ? location.state.anime : null;

  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState("episodes");
  const [copied, setCopied] = useState(false);
  const [lang, setLangState] = useState(() => (getShowPrefs(id).lang === "dub" ? "dub" : "sub"));
  const setLang = (next) => {
    setLangState(next);
    setShowPrefs(id, { lang: next });
  };
  const [download, startDownload, startDownloadAll] = useDownload(id, lang);
  const { episodes: episodeInfo, loading: infoLoading } = useEpisodeInfo(id);
  const themes = useThemes(id);
  const [progress] = useProgress(id);
  const saved = useSavedEpisodes(id, lang);
  const pageRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();

    fetchDetails(id, controller.signal)
      .then((data) => setResult({ id, data, error: null }))
      .catch((err) => {
        if (err.name === "AbortError") return;
        console.error("Details failed:", err);
        setResult({ id, data: null, error: err.message, status: err.status });
      });

    return () => controller.abort();
  }, [id, attempt]);

  // A different anime starts on its episodes again.
  useEffect(() => {
    setTab("episodes");
  }, [id]);

  function retry() {
    setResult(null);
    setAttempt((n) => n + 1);
  }

  async function handleShare() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  }

  const finished = result?.id === id ? result : null;
  const anime = finished?.data ?? preview;
  const available = anime?.availableEpisodes ?? anime?.episodes ?? null;
  const shown = Boolean(anime);

  useEffect(() => {
    const el = pageRef.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        el.style.setProperty("--scroll", String(Math.min(window.scrollY, 700))),
      );
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [shown]);

  if (!anime) {
    if (finished?.error) {
      return (
        <main className="series">
          <div className="discover__message" role="alert">
            <span className="material-symbols-outlined" aria-hidden="true">cloud_off</span>
            <p>Couldn’t load this anime. {finished.error}</p>
            <RetryButton onRetry={retry} auto={finished.status === 429} />
          </div>
        </main>
      );
    }
    return (
      <main className="series series--loading" aria-busy="true" aria-label="Loading anime">
        <div className="series-skeleton__hero skeleton" />
        <div className="series-skeleton__body">
          <div className="skeleton skeleton--title" />
          <div className="skeleton series-skeleton__line" />
          <div className="skeleton series-skeleton__line series-skeleton__line--short" />
          <div className="series-skeleton__grid">
            {Array.from({ length: 12 }, (_, i) => (
              <div className="skeleton series-skeleton__ep" key={i} />
            ))}
          </div>
        </div>
      </main>
    );
  }

  const formatLabel = FORMAT_LABELS[anime.format] ?? anime.format;
  const statusLabel = STATUS_LABELS[anime.status] ?? null;
  const releaseDate = formatReleaseDate(anime.releaseDate);
  const genres = anime.genres?.slice(0, 5) ?? [];

  const facts = [
    anime.rating != null ? { key: "score", text: `★ ${(anime.rating / 10).toFixed(1)}`, score: true } : null,
    anime.releaseDate?.year ? { key: "year", text: String(anime.releaseDate.year) } : null,
    formatLabel ? { key: "format", text: formatLabel } : null,
    anime.episodes != null
      ? { key: "episodes", text: `${anime.episodes} ${anime.episodes === 1 ? "episode" : "episodes"}` }
      : null,
  ].filter(Boolean);

  const last = progress.last;
  const finishedLast = last != null && progress.watched.includes(last);
  const resumeAt = resumeEpisode(progress, available);
  const spot = getPosition(id, resumeAt);
  const resumeLabel =
    last == null
      ? "Start watching E1"
      : `${finishedLast && resumeAt === last ? "Rewatch" : "Continue watching"} E${resumeAt}${spot ? ` · ${formatSpot(spot.t)}` : ""}`;

  const details = [
    ["Format", formatLabel],
    ["Status", statusLabel],
    ["Episodes", anime.episodes],
    ["Duration", anime.duration ? `${anime.duration} min` : null],
    ["Released", releaseDate],
    ["Score", anime.rating != null ? `★ ${(anime.rating / 10).toFixed(1)}` : null],
  ].filter(([, value]) => value != null && value !== "");

  const hasBanner = Boolean(anime.banner);
  const relations = anime.relations ?? [];
  const tabs = [
    ["episodes", "Episodes", null],
    ["related", "Related", relations.length || null],
    ...(anime.trailer ? [["trailer", "Trailer", null]] : []),
  ];
  const activeTab = tabs.some(([key]) => key === tab) ? tab : "episodes";

  function onTabKey(e) {
    const i = tabs.findIndex(([key]) => key === activeTab);
    let next = i;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    setTab(tabs[next][0]);
    document.getElementById(`series-tab-${tabs[next][0]}`)?.focus();
  }

  return (
    <main className="series" ref={pageRef}>
      <header className={`series-hero${hasBanner ? "" : " series-hero--poster"}`}>
        <div className="series-hero__bg" aria-hidden="true">
          <img className="series-hero__img" src={anime.banner ?? anime.cover} alt="" />
        </div>

        {anime.trailer && <TrailerBackground key={`${id}:${anime.trailer.id}`} trailer={anime.trailer} />}

        <div className="series-hero__inner">
          <div className="series-hero__info">
            <h1 className="series-hero__title">{anime.title}</h1>

            {facts.length > 0 && (
              <p className="series-facts">
                {facts.map((f) => (
                  <span key={f.key} className={f.score ? "is-score" : undefined}>
                    {f.text}
                  </span>
                ))}
              </p>
            )}

            {anime.nextEpisode && (
              <AiringCountdown episode={anime.nextEpisode.episode} airingAt={anime.nextEpisode.airingAt} />
            )}

            {genres.length > 0 && (
              <ul className="series-genres">
                {genres.map((g) => (
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
              <Link
                className="btn btn--primary"
                to={`/anime/${id}/watch/${resumeAt}?lang=${lang}`}
                state={{ anime }}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  play_arrow
                </span>
                {resumeLabel}
              </Link>
              {anime.trailer && (
                <Link className="btn btn--outline" to={`/anime/${id}/trailer`} state={{ anime }}>
                  <span className="material-symbols-outlined" aria-hidden="true">
                    movie
                  </span>
                  Trailer
                </Link>
              )}
              <WatchlistButton anime={anime} />
              <button className="btn btn--outline" type="button" onClick={handleShare}>
                <span className="material-symbols-outlined" aria-hidden="true">
                  {copied ? "check" : "share"}
                </span>
                {copied ? "Link copied" : "Share"}
              </button>
            </div>
          </div>

          {!hasBanner && <img className="series-hero__poster" src={anime.cover} alt="" />}
        </div>
      </header>

      <div className="series-body">
        <div className="series-body__main">
          {finished?.error && (
            <p className="empty-note series__error">Couldn’t load the full details. {finished.error}</p>
          )}

          <div className="series-nav" role="tablist" aria-label="Anime sections" onKeyDown={onTabKey}>
            {tabs.map(([key, label, count]) => (
              <button
                key={key}
                id={`series-tab-${key}`}
                type="button"
                role="tab"
                aria-selected={activeTab === key}
                aria-controls={`series-panel-${key}`}
                tabIndex={activeTab === key ? 0 : -1}
                className={`series-nav__tab${activeTab === key ? " is-active" : ""}`}
                onClick={() => setTab(key)}
              >
                {label}
                {count != null && <span className="series-nav__count">{count}</span>}
              </button>
            ))}
          </div>

          <div id={`series-panel-${activeTab}`} role="tabpanel" aria-labelledby={`series-tab-${activeTab}`}>
            {activeTab === "episodes" &&
              ((available ?? 0) > 0 ? (
                <EpisodeList
                  animeId={id}
                  total={available}
                  lang={lang}
                  onSelectLang={setLang}
                  download={download}
                  onDownload={startDownload}
                  onDownloadAll={startDownloadAll}
                  infoLoading={infoLoading}
                  linkState={{ anime }}
                  info={episodeInfo}
                  watched={progress.watched}
                  saved={saved}
                  allowRich
                  className="episodes--grid"
                />
              ) : (
                <p className="empty-note">No episodes are available to watch yet.</p>
              ))}

            {activeTab === "related" && <RelatedList relations={relations} title={anime.title} />}

            {activeTab === "trailer" && anime.trailer && (
              <TrailerPlayer key={anime.trailer.id} trailer={anime.trailer} title={anime.title} />
            )}
          </div>
        </div>

        <aside className="series-body__side">
          <SeriesSidebar details={details} genres={anime.genres ?? []} themes={themes} />
        </aside>
      </div>

      <SimilarRow animeId={id} />
    </main>
  );
}
export default SelectedAnimePage;
