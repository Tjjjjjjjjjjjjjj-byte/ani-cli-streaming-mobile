import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MAX_BATCH, downloadProgress, shortDownloadLabel } from "./useDownload";
import DownloadStatus from "./DownloadStatus";
import ProgressRing from "./ProgressRing";
import { formatAired } from "../utils/animeFormat";

const CHUNK = 100;
const NO_INFO = {};
const NO_EPISODES = [];

function EpisodeList({
  animeId,
  total,
  current = null,
  lang = "sub",
  onSelectLang,
  download,
  onDownload,
  onDownloadAll,
  infoLoading = false,
  linkState,
  info = NO_INFO,
  watched = NO_EPISODES,
  allowRich = false,
  className = "",
}) {
  const count = total ?? Math.max(current ?? 0, 1);
  const chunkCount = Math.ceil(count / CHUNK);
  const chunkOf = (n) => Math.floor(((n ?? 1) - 1) / CHUNK);

  const [range, setRange] = useState({ forEpisode: current, picked: null });
  if (range.forEpisode !== current) setRange({ forEpisode: current, picked: null });
  const chunk = Math.min(range.picked ?? chunkOf(current), chunkCount - 1);

  const [query, setQuery] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [limitHit, setLimitHit] = useState(false);
  const [view, setView] = useState(() => {
    try {
      return localStorage.getItem("episodes:view") === "grid" ? "grid" : "list";
    } catch {
      return "list";
    }
  });
  const scrollRef = useRef(null);
  const currentRef = useRef(null);
  const lastClicked = useRef(null);

  const watchedSet = useMemo(() => new Set(watched), [watched]);
  const hasInfo = allowRich && Object.values(info).some((e) => e.title || e.synopsis);
  const rich = hasInfo && view === "list";
  const loadingRich = allowRich && infoLoading && view === "list";

  function chooseView(next) {
    setView(next);
    try {
      localStorage.setItem("episodes:view", next);
    } catch {
    }
  }

  const numbers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) {
      const all = Array.from({ length: count }, (_, i) => i + 1);
      return all.filter(
        (n) => String(n).includes(q) || info[n]?.title?.toLowerCase().includes(q),
      );
    }
    const start = chunk * CHUNK + 1;
    const end = Math.min(count, start + CHUNK - 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [count, chunk, query, info]);

  useEffect(() => {
    const box = scrollRef.current;
    const el = currentRef.current;
    if (!box || !el) return;
    box.scrollTo({ top: el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2 });
  }, [current, chunk]);

  function addEpisodes(list) {
    const next = new Set(selected);
    let hitLimit = false;
    for (const n of list) {
      if (next.size >= MAX_BATCH && !next.has(n)) {
        hitLimit = true;
        break;
      }
      next.add(n);
    }
    setSelected(next);
    setLimitHit(hitLimit);
  }

  function handlePick(n, event) {
    if (event.shiftKey && lastClicked.current != null) {
      const a = numbers.indexOf(lastClicked.current);
      const b = numbers.indexOf(n);
      if (a !== -1 && b !== -1) {
        addEpisodes(numbers.slice(Math.min(a, b), Math.max(a, b) + 1));
        lastClicked.current = n;
        return;
      }
    }

    lastClicked.current = n;
    if (selected.has(n)) {
      const next = new Set(selected);
      next.delete(n);
      setSelected(next);
      setLimitHit(false);
    } else {
      addEpisodes([n]);
    }
  }

  function clearSelection() {
    setSelected(new Set());
    setLimitHit(false);
    lastClicked.current = null;
  }

  function toggleSelecting() {
    if (selecting) clearSelection();
    setSelecting((v) => !v);
  }

  function handleDownload() {
    const episodes = [...selected].sort((a, b) => a - b);
    clearSelection();
    onDownload(episodes);
  }

  const showTools = count > 24;
  const canDownload = typeof onDownload === "function";
  const busy = download?.status === "starting" || download?.status === "running";
  const hasStatus = Boolean(download) && download.status !== "idle";
  const downloadLabel =
    selected.size === 1 ? "Download 1 episode" : `Download ${selected.size} as zip`;

  function handleDownloadAll() {
    if (!total) return;
    const batches = Math.ceil(total / MAX_BATCH);
    const note = batches > 1 ? ` They arrive as ${batches} zip files.` : "";
    if (total > 24 && !window.confirm(`Download all ${total} episodes?${note} This can take a long time.`)) return;
    onDownloadAll(Array.from({ length: total }, (_, i) => i + 1));
  }

  return (
    <section
      className={`episodes ${className}${rich || loadingRich ? " episodes--rich" : ""}`}
      aria-label="Episodes"
      aria-busy={infoLoading}
    >
      <header className="episodes__head">
        <h2 className="episodes__title">Episodes</h2>
        {(canDownload || hasInfo) && (
          <div className="episodes__actions">
            {hasInfo && (
              <div className="episodes__view" role="group" aria-label="Episode layout">
                {[
                  ["list", "view_list", "Detailed list"],
                  ["grid", "grid_view", "Number grid"],
                ].map(([option, icon, label]) => (
                  <button
                    key={option}
                    type="button"
                    className={view === option ? "is-on" : ""}
                    aria-pressed={view === option}
                    aria-label={label}
                    title={label}
                    onClick={() => chooseView(option)}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">{icon}</span>
                  </button>
                ))}
              </div>
            )}
            {canDownload && onDownloadAll && total != null && (
              <button
                type="button"
                className="episodes__select-btn"
                disabled={busy}
                onClick={handleDownloadAll}
                title={total > MAX_BATCH ? `Downloads in batches of ${MAX_BATCH}` : "Download every episode"}
              >
                {busy ? (
                  <ProgressRing size={18} stroke={2.5} value={downloadProgress(download)} />
                ) : (
                  <span className="material-symbols-outlined" aria-hidden="true">
                    download_for_offline
                  </span>
                )}
                {busy ? shortDownloadLabel(download) : "Download all"}
              </button>
            )}
            {canDownload && (
              <button
                type="button"
                className={`episodes__select-btn${selecting ? " is-on" : ""}`}
                aria-pressed={selecting}
                onClick={toggleSelecting}
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
                placeholder={hasInfo ? "Number or title" : "Go to episode"}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Find an episode by number or title"
              />
            </label>
            {chunkCount > 1 && !query && (
              <select
                className="episodes__range"
                value={chunk}
                onChange={(e) => setRange((r) => ({ ...r, picked: Number(e.target.value) }))}
                aria-label="Episode range"
              >
                {Array.from({ length: chunkCount }, (_, i) => (
                  <option key={i} value={i}>
                    {i * CHUNK + 1}–{Math.min(count, (i + 1) * CHUNK)}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </header>

      {infoLoading && (
        <p className="episodes__loading" role="status">
          <span className="toggle__spinner" aria-hidden="true" />
          Loading episode details…
        </p>
      )}

      <div className="episodes__scroll" ref={scrollRef}>
        {loadingRich ? (
          <ol className="episodes__items" aria-hidden="true">
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i} style={{ "--i": i }}>
                <div className="episodes__item episodes__item--skeleton">
                  <span className="sk sk--num" />
                  <span className="sk sk--thumb" />
                  <span className="episodes__text">
                    <span className="sk sk--line sk--w40" />
                    <span className="sk sk--line sk--w25" />
                    <span className="sk sk--line" />
                  </span>
                  <span />
                </div>
              </li>
            ))}
          </ol>
        ) : numbers.length === 0 ? (
          <p className="episodes__empty">No episode matches “{query}”.</p>
        ) : (
          <ol className="episodes__items">
            {numbers.map((n, index) => {
              const isCurrent = n === current;
              const isSelected = selected.has(n);
              const isWatched = watchedSet.has(n);
              const detail = info[n];
              const title = detail?.title ?? `Episode ${n}`;
              const aired = formatAired(detail?.aired);
              const classes = `episodes__item${isCurrent ? " is-current" : ""}${isSelected ? " is-selected" : ""}${isWatched ? " is-watched" : ""}`;
              const label = detail?.title ? `Episode ${n}: ${detail.title}` : `Episode ${n}`;

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

              const body = rich ? (
                <>
                  <span className="episodes__num">{n}</span>
                  {detail?.thumbnail ? (
                    <img className="episodes__thumb" src={detail.thumbnail} alt="" loading="lazy" />
                  ) : (
                    <span className="episodes__thumb episodes__thumb--empty" aria-hidden="true">
                      <span className="material-symbols-outlined">movie</span>
                    </span>
                  )}
                  <span className="episodes__text">
                    <span className="episodes__ep-title">{title}</span>
                    {(aired || detail?.filler || detail?.recap) && (
                      <span className="episodes__meta">
                        {aired}
                        {detail?.filler && <span className="ep-tag ep-tag--filler">Filler</span>}
                        {detail?.recap && <span className="ep-tag">Recap</span>}
                      </span>
                    )}
                    {detail?.synopsis && <span className="episodes__synopsis">{detail.synopsis}</span>}
                  </span>
                  <span className="episodes__marker">{marker}</span>
                </>
              ) : (
                <>
                  <span className="episodes__num">{n}</span>
                  <span className="episodes__label">{title}</span>
                  {marker}
                </>
              );

              return (
                <li key={n} style={{ "--i": Math.min(index, 14) }}>
                  {selecting ? (
                    <button
                      type="button"
                      ref={isCurrent ? currentRef : null}
                      className={classes}
                      aria-pressed={isSelected}
                      aria-label={label}
                      onClick={(e) => handlePick(n, e)}
                    >
                      {body}
                    </button>
                  ) : (
                    <Link
                      ref={isCurrent ? currentRef : null}
                      className={classes}
                      to={`/anime/${animeId}/watch/${n}${lang === "dub" ? "?lang=dub" : ""}`}
                      state={linkState}
                      aria-current={isCurrent ? "page" : undefined}
                      aria-label={label}
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

      {canDownload && (selecting || hasStatus) && (
        <div className="episodes__dl">
          {selecting && (
            <>
              <div className="episodes__dl-row">
                <p className="episodes__dl-count">
                  {selected.size} selected
                  {limitHit && ` (${MAX_BATCH} is the most at once)`}
                </p>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => addEpisodes(numbers)}
                  disabled={numbers.length === 0}
                >
                  Select shown
                </button>
                <button type="button" className="link-btn" onClick={clearSelection} disabled={selected.size === 0}>
                  Clear
                </button>
              </div>

              {onSelectLang && (
                <div className="episodes__dl-row" role="group" aria-label="Audio">
                  <span className="episodes__dl-count">Audio</span>
                  {["sub", "dub"].map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`episodes__lang${lang === option ? " is-active" : ""}`}
                      aria-pressed={lang === option}
                      onClick={() => onSelectLang(option)}
                    >
                      {option === "sub" ? "Sub" : "Dub"}
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                className="btn btn--primary episodes__dl-go"
                disabled={selected.size === 0 || busy}
                onClick={handleDownload}
              >
                <span className="material-symbols-outlined" aria-hidden="true">download</span>
                {selected.size === 0 ? "Pick episodes to download" : downloadLabel}
              </button>
            </>
          )}

          {hasStatus && <DownloadStatus download={download} />}
        </div>
      )}
    </section>
  );
}

export default EpisodeList;
