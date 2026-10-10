import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { STANDALONE, assetUrl } from "../api";
import { FORMAT_LABELS, formatBytes } from "../utils/animeFormat";
import { IMPORT_EVENT, importZip, useLibrary } from "./useLibrary";

function DownloadsPage() {
  const [library, reload] = useLibrary();
  const [params] = useSearchParams();
  const q = params.get("q")?.trim() ?? "";
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(null);
  const [message, setMessage] = useState(null);

  async function handleFile(file) {
    if (!file || importing) return;
    if (!/\.zip$/i.test(file.name)) {
      setMessage({ ok: false, text: "That isn’t a .zip file." });
      return;
    }
    setMessage(null);
    setImporting({ name: file.name, progress: 0 });
    try {
      const result = await importZip(file, (progress) => setImporting({ name: file.name, progress }));
      setMessage({
        ok: true,
        text: `Added ${result.added} episode${result.added === 1 ? "" : "s"} of ${result.title}.`,
      });
      reload();
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setImporting(null);
    }
  }

  const handleFileRef = useRef(handleFile);
  useEffect(() => {
    handleFileRef.current = handleFile;
  });
  useEffect(() => {
    const onPicked = (e) => handleFileRef.current(e.detail);
    window.addEventListener(IMPORT_EVENT, onPicked);
    return () => window.removeEventListener(IMPORT_EVENT, onPicked);
  }, []);

  useEffect(() => {
    document.title = "Library";
    return () => {
      document.title = "ani-cli-streaming";
    };
  }, []);

  const unpacking = importing && importing.progress >= 1;
  const needle = q.toLowerCase();
  const items = needle ? library.items.filter((a) => a.title.toLowerCase().includes(needle)) : library.items;

  return (
    <main className="downloads-page">
      <header className="downloads-page__header">
        <h2>{q ? <>Results for “{q}”</> : "Downloads"}</h2>
        <p className="result-count">
          {q
            ? `${items.length} of ${library.items.length} saved`
            : STANDALONE
              ? "Saved on this device. Watch anywhere, no internet needed."
              : "Saved on this phone, ready to watch without streaming."}
        </p>
      </header>

      <div
        className={`dropzone${dragging ? " is-dragging" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFile(e.dataTransfer.files[0]);
        }}
      >
        <span className="material-symbols-outlined" aria-hidden="true">upload_file</span>
        <p>
          {importing
            ? unpacking
              ? `Unpacking ${importing.name}…`
              : `${STANDALONE ? "Importing" : "Uploading"} ${importing.name}… ${Math.round(importing.progress * 100)}%`
            : STANDALONE
              ? "Choose an exported anime zip to add it to this device."
              : "Drop an exported anime zip here to add it to the library."}
        </p>
        <button
          type="button"
          className="btn btn--outline"
          disabled={Boolean(importing)}
          onClick={() => inputRef.current?.click()}
        >
          Choose zip
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip"
          hidden
          onChange={(e) => {
            handleFile(e.target.files[0]);
            e.target.value = "";
          }}
        />
      </div>

      {message && (
        <p className={`downloads-page__message${message.ok ? "" : " is-error"}`} role="status">
          {message.text}
        </p>
      )}

      {library.status === "loading" && <p className="empty-note downloads-page__note">Loading…</p>}
      {library.status === "error" && (
        <p className="empty-note downloads-page__note">Couldn’t load the library. {library.error}</p>
      )}
      {library.status === "ready" && library.items.length > 0 && items.length === 0 && (
        <p className="empty-note downloads-page__note">Nothing saved matches “{q}”.</p>
      )}
      {library.status === "ready" && library.items.length === 0 && (
        <p className="empty-note downloads-page__note">
          {STANDALONE
            ? "Nothing here yet. Import an exported anime zip above and it will show up here."
            : "Nothing saved yet. Download an episode from an anime’s page and it will show up here."}
        </p>
      )}

      {items.length > 0 && (
        <div className="library-grid">
          {items.map((anime) => (
            <Link className="anime-card" key={anime.id} to={`/downloads/${anime.id}`}>
              <div className="anime-card__poster">
                {anime.cover ? (
                  <img src={assetUrl(anime.cover)} alt={anime.title} loading="lazy" />
                ) : (
                  <span className="material-symbols-outlined anime-card__fallback" aria-hidden="true">movie</span>
                )}
                <span className="badge badge--score">
                  {anime.savedEpisodes}
                  {anime.totalEpisodes ? ` / ${anime.totalEpisodes}` : ""} ep
                </span>
                {FORMAT_LABELS[anime.format] && (
                  <span className="badge badge--format">{FORMAT_LABELS[anime.format]}</span>
                )}
              </div>
              <h3 className="anime-card__title" title={anime.title}>{anime.title}</h3>
              <p className="anime-card__date">
                {[anime.langs.map((l) => l.toUpperCase()).join(" + "), formatBytes(anime.size)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}

export default DownloadsPage;
