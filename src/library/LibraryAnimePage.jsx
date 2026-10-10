import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { STANDALONE, assetUrl } from "../api";
import { FORMAT_LABELS, STATUS_LABELS, formatBytes } from "../utils/animeFormat";
import { useProgress } from "../watch/useProgress";
import SeriesSidebar from "../SeriesSidebar";
import LibraryEpisodeList from "./LibraryEpisodeList";
import { deleteFromLibrary, useLibraryAnime } from "./useLibrary";

function LibraryAnimePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [state, reload] = useLibraryAnime(id);
  const [progress] = useProgress(id);
  const [pickedLang, setPickedLang] = useState(null);
  const pageRef = useRef(null);
  const ready = state.status === "ready";
  const episodes = ready ? state.episodes : null;

  useEffect(() => {
    document.title = ready ? state.anime.title : "Library";
    return () => {
      document.title = "ani-cli-streaming";
    };
  }, [ready, state.anime]);

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
  }, [ready]);

  const status = state.status;
  const emptied = ready && episodes.length === 0;
  useEffect(() => {
    if (status === "missing" || emptied) navigate("/downloads", { replace: true });
  }, [status, emptied, navigate]);

  async function remove(path, question) {
    if (!window.confirm(question)) return false;
    try {
      await deleteFromLibrary(path);
      return true;
    } catch (err) {
      window.alert(`Couldn’t delete: ${err.message}`);
      return false;
    }
  }

  if (!ready) {
    const text =
      state.status === "loading"
        ? "Loading…"
        : state.status === "missing"
          ? "That anime isn’t in the library."
          : `Couldn’t load this anime. ${state.error}`;
    return (
      <main className="library-page">
        <p className="empty-note" role="status">
          {text} <Link to="/downloads">Back to Downloads</Link>
        </p>
      </main>
    );
  }
  if (emptied) return null;

  const { anime } = state;
  const where = "this phone";
  const langs = ["sub", "dub"].filter((l) => episodes.some((e) => e.lang === l));
  const lang = langs.includes(pickedLang) ? pickedLang : langs[0];
  const listed = episodes.filter((e) => e.lang === lang);
  const cover = assetUrl(anime.coverUrl);

  const formatLabel = FORMAT_LABELS[anime.format] ?? anime.format;
  const statusLabel = STATUS_LABELS[anime.status] ?? null;
  const facts = [
    anime.rating != null ? { key: "score", text: `★ ${(anime.rating / 10).toFixed(1)}`, score: true } : null,
    anime.releaseDate?.year ? { key: "year", text: String(anime.releaseDate.year) } : null,
    formatLabel ? { key: "format", text: formatLabel } : null,
    { key: "saved", text: `${listed.length}${anime.episodes ? ` of ${anime.episodes}` : ""} saved` },
  ].filter(Boolean);

  const last = progress.last;
  const finishedLast = last != null && progress.watched.includes(last);
  const sameOrLater = (n) => listed.find((e) => e.number >= n);
  const target =
    last == null
      ? listed[0]
      : finishedLast
        ? (listed.find((e) => e.number > last) ?? listed.find((e) => e.number === last) ?? listed[0])
        : (sameOrLater(last) ?? listed[0]);
  const rewatch = last != null && finishedLast && target.number === last;
  const resumeLabel =
    last == null ? `Start watching E${target.number}` : `${rewatch ? "Rewatch" : "Continue watching"} E${target.number}`;

  const totalSize = episodes.reduce((sum, e) => sum + (e.size ?? 0), 0);
  const details = [
    ["Format", formatLabel],
    ["Status", statusLabel],
    ["Episodes", anime.episodes],
    ["Duration", anime.duration ? `${anime.duration} min` : null],
    ["Released", anime.releaseDate?.year ?? null],
    ["Score", anime.rating != null ? `★ ${(anime.rating / 10).toFixed(1)}` : null],
    ["Saved", `${episodes.length} file${episodes.length === 1 ? "" : "s"}${totalSize ? ` · ${formatBytes(totalSize)}` : ""}`],
  ].filter(([, value]) => value != null && value !== "");

  async function deleteEpisodes(keys) {
    const question =
      keys.length === 1
        ? `Delete this episode from ${where}?`
        : `Delete ${keys.length} episodes from ${where}?`;
    if (!window.confirm(question)) return false;
    try {
      for (const key of keys) await deleteFromLibrary(`/library/${anime.id}/episodes/${key}`);
    } catch (err) {
      window.alert(`Couldn’t delete: ${err.message}`);
    }
    reload();
    return true;
  }

  return (
    <main className="series" ref={pageRef}>
      <header className="series-hero series-hero--poster">
        {cover && (
          <div className="series-hero__bg" aria-hidden="true">
            <img className="series-hero__img" src={cover} alt="" />
          </div>
        )}

        <div className="series-hero__inner">
          <div className="series-hero__info">
            <h1 className="series-hero__title">{anime.title}</h1>

            <p className="series-facts">
              {facts.map((f) => (
                <span key={f.key} className={f.score ? "is-score" : undefined}>
                  {f.text}
                </span>
              ))}
            </p>

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
              <Link className="btn btn--primary" to={`/downloads/${anime.id}/watch/${target.key}`}>
                <span className="material-symbols-outlined" aria-hidden="true">play_arrow</span>
                {resumeLabel}
              </Link>
              {!STANDALONE && (
                <a className="btn btn--outline" href={assetUrl(`/library/${anime.id}/export`)}>
                  <span className="material-symbols-outlined" aria-hidden="true">folder_zip</span>
                  Export zip
                </a>
              )}
              <button
                type="button"
                className="btn btn--outline"
                onClick={async () => {
                  if (await remove(`/library/${anime.id}`, `Delete ${anime.title} and all its saved episodes from ${where}?`)) {
                    navigate("/downloads");
                  }
                }}
              >
                <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                Delete all
              </button>
            </div>
          </div>

          {cover && <img className="series-hero__poster" src={cover} alt="" />}
        </div>
      </header>

      <div className="series-body">
        <div className="series-body__main">
          <LibraryEpisodeList
            animeId={id}
            episodes={listed}
            watched={progress.watched}
            langs={langs}
            lang={lang}
            onSelectLang={setPickedLang}
            onDelete={deleteEpisodes}
            className="episodes--grid"
          />
        </div>

        <aside className="series-body__side">
          <SeriesSidebar details={details} genres={anime.genres ?? []} />
        </aside>
      </div>
    </main>
  );
}

export default LibraryAnimePage;
