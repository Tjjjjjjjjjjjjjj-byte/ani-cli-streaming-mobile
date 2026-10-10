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
import { useProgress } from "./watch/useProgress";
import AiringCountdown from "./AiringCountdown";
import { fetchDetails } from "./anilist";
import { TrailerBackground } from "./Trailer";

function SelectedAnimePage() {
  const { id } = useParams();

  const location = useLocation();
  const preview =
    String(location.state?.anime?.id) === id ? location.state.anime : null;

  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [lang, setLang] = useState("sub");
  const [download, startDownload, startDownloadAll] = useDownload(id, lang);
  const { episodes: episodeInfo, loading: infoLoading } = useEpisodeInfo(id);
  const themes = useThemes(id);
  const [progress] = useProgress(id);
  const pageRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();

    fetchDetails(id, controller.signal)
      .then((data) => setResult({ id, data, error: null }))
      .catch((err) => {
        if (err.name === "AbortError") return;
        console.error("Details failed:", err);
        setResult({ id, data: null, error: err.message });
      });

    return () => controller.abort();
  }, [id]);

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
    return (
      <main className="series">
        <p className="empty-note series__note" role="status">
          {finished?.error ? `Couldn’t load this anime. ${finished.error}` : "Loading…"}
        </p>
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
  const resumeAt =
    last == null ? 1 : finishedLast && (available == null || last < available) ? last + 1 : last;
  const resumeLabel =
    last == null
      ? "Start watching E1"
      : `${finishedLast && resumeAt === last ? "Rewatch" : "Continue watching"} E${resumeAt}`;

  const details = [
    ["Format", formatLabel],
    ["Status", statusLabel],
    ["Episodes", anime.episodes],
    ["Duration", anime.duration ? `${anime.duration} min` : null],
    ["Released", releaseDate],
    ["Score", anime.rating != null ? `★ ${(anime.rating / 10).toFixed(1)}` : null],
  ].filter(([, value]) => value != null && value !== "");

  const hasBanner = Boolean(anime.banner);

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
                to={`/anime/${id}/watch/${resumeAt}${lang === "dub" ? "?lang=dub" : ""}`}
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

          {(available ?? 0) > 0 ? (
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
              allowRich
              className="episodes--grid"
            />
          ) : (
            <p className="empty-note">No episodes are available to watch yet.</p>
          )}
        </div>

        <aside className="series-body__side">
          <SeriesSidebar details={details} genres={anime.genres ?? []} themes={themes} />
        </aside>
      </div>
    </main>
  );
}
export default SelectedAnimePage;
