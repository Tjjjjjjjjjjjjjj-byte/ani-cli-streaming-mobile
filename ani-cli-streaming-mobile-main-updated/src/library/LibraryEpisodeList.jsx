import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

const NO_EPISODES = [];

function LibraryEpisodeList({
  animeId,
  episodes,
  currentKey = null,
  watched = NO_EPISODES,
  langs = NO_EPISODES,
  lang,
  onSelectLang,
  onDelete,
  className = "",
}) {
  const [query, setQuery] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [deleting, setDeleting] = useState(false);
  const scrollRef = useRef(null);
  const currentRef = useRef(null);

  const watchedSet = useMemo(() => new Set(watched), [watched]);
  const liveSelected = episodes.filter((e) => selected.has(e.key)).map((e) => e.key);

  const shown = useMemo(() => {
    const q = query.trim();
    return q ? episodes.filter((e) => String(e.number).includes(q)) : episodes;
  }, [episodes, query]);

  useEffect(() => {
    const box = scrollRef.current;
    const el = currentRef.current;
    if (!box || !el) return;
    box.scrollTo({ top: el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2 });
  }, [currentKey]);

  function toggle(key) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function leaveSelecting() {
    setSelected(new Set());
    setSelecting(false);
  }

  async function handleDelete() {
    setDeleting(true);
    let finished;
    try {
      finished = await onDelete(liveSelected);
    } finally {
      setDeleting(false);
    }
    if (finished !== false) leaveSelecting();
  }

  const showTools = episodes.length > 24;
  const canDelete = typeof onDelete === "function";

  return (
    <section className={`episodes ${className}`} aria-label="Saved episodes">
      <header className="episodes__head">
        <h2 className="episodes__title">Episodes</h2>

        {(langs.length > 1 || canDelete) && (
          <div className="episodes__actions">
            {langs.length > 1 && onSelectLang && (
              <div className="episodes__view episodes__view--text" role="group" aria-label="Audio">
                {langs.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={lang === option ? "is-on" : ""}
                    aria-pressed={lang === option}
                    onClick={() => {
                      if (lang === option) return;
                      leaveSelecting();
                      onSelectLang(option);
                    }}
                  >
                    {option === "sub" ? "Sub" : "Dub"}
                  </button>
                ))}
              </div>
            )}
            {canDelete && (
              <button
                type="button"
                className={`episodes__select-btn${selecting ? " is-on" : ""}`}
                aria-pressed={selecting}
                disabled={deleting}
                onClick={() => (selecting ? leaveSelecting() : setSelecting(true))}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  {selecting ? "close" : "checklist"}
                </span>
                {selecting ? "Done" : "Select"}
              </button>
            )}
          </div>
        )}

        {showTools && (
          <div className="episodes__tools">
            <label className="episodes__search">
              <span className="material-symbols-outlined" aria-hidden="true">search</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="Go to episode"
                value={query}
                onChange={(e) => setQuery(e.target.value.replace(/\D/g, ""))}
                aria-label="Find an episode number"
              />
            </label>
          </div>
        )}
      </header>

      <div className="episodes__scroll" ref={scrollRef}>
        {shown.length === 0 ? (
          <p className="episodes__empty">No saved episode {query}.</p>
        ) : (
          <ol className="episodes__items">
            {shown.map((ep, index) => {
              const isCurrent = ep.key === currentKey;
              const isSelected = selected.has(ep.key);
              const isWatched = watchedSet.has(ep.number);
              const classes = `episodes__item${isCurrent ? " is-current" : ""}${isSelected ? " is-selected" : ""}${isWatched ? " is-watched" : ""}`;

              const marker = selecting ? (
                <span className="material-symbols-outlined episodes__check" aria-hidden="true">
                  {isSelected ? "check_box" : "check_box_outline_blank"}
                </span>
              ) : isCurrent ? (
                <span className="material-symbols-outlined episodes__playing" aria-hidden="true">
                  play_circle
                </span>
              ) : isWatched ? (
                <span className="material-symbols-outlined episodes__seen" aria-hidden="true">
                  check_circle
                </span>
              ) : null;

              const body = (
                <>
                  <span className="episodes__num">{ep.number}</span>
                  <span className="episodes__label">Episode {ep.number}</span>
                  {marker}
                </>
              );

              return (
                <li key={ep.key} style={{ "--i": Math.min(index, 14) }}>
                  {selecting ? (
                    <button
                      type="button"
                      className={classes}
                      aria-pressed={isSelected}
                      aria-label={`Episode ${ep.number}`}
                      onClick={() => toggle(ep.key)}
                    >
                      {body}
                    </button>
                  ) : (
                    <Link
                      ref={isCurrent ? currentRef : null}
                      className={classes}
                      to={`/downloads/${animeId}/watch/${ep.key}`}
                      aria-current={isCurrent ? "page" : undefined}
                      aria-label={`Episode ${ep.number}`}
                    >
                      {body}
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {selecting && (
        <div className="episodes__dl">
          <div className="episodes__dl-row">
            <p className="episodes__dl-count">{liveSelected.length} selected</p>
            <button
              type="button"
              className="link-btn"
              disabled={shown.length === 0 || deleting}
              onClick={() => setSelected(new Set(shown.map((e) => e.key)))}
            >
              Select shown
            </button>
            <button
              type="button"
              className="link-btn"
              disabled={liveSelected.length === 0 || deleting}
              onClick={() => setSelected(new Set())}
            >
              Clear
            </button>
          </div>
          <button
            type="button"
            className="btn btn--primary episodes__dl-go"
            disabled={liveSelected.length === 0 || deleting}
            onClick={handleDelete}
          >
            <span className="material-symbols-outlined" aria-hidden="true">delete</span>
            {deleting
              ? "Deleting…"
              : liveSelected.length === 0
                ? "Pick episodes to delete"
                : `Delete ${liveSelected.length} episode${liveSelected.length === 1 ? "" : "s"}`}
          </button>
        </div>
      )}
    </section>
  );
}

export default LibraryEpisodeList;
